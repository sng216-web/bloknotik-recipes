import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { RecipeSchema, type Recipe } from './recipe-schema.js';

export const ImportEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  importId: z.uuid(),
  recipe: RecipeSchema,
}).superRefine((entry, ctx) => {
  if (entry.recipe.demo || entry.recipe.status !== 'approved' || !entry.recipe.approval) {
    ctx.addIssue({ code: 'custom', message: 'Only approved non-demo content may be imported' });
  }
});

export async function validateRecipeAssets(recipe: Recipe, root: string): Promise<void> {
  const realRoot = fs.realpathSync(root);
  for (const image of recipe.images) {
    const candidate = path.join(realRoot, 'public', image.src);
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(`${realRoot}${path.sep}`) || real !== candidate || fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error('Images must be regular files inside this repository');
    }
    if (!fs.statSync(real).isFile()) throw new Error('Images must be regular files');
    if (fs.statSync(real).size > 10 * 1024 * 1024) throw new Error('Images may not exceed 10 MiB');
    const metadata = await sharp(real, { limitInputPixels: 40_000_000 }).metadata();
    const ext = image.src.split('.').pop();
    const expectedFormat = ext === 'jpg' ? 'jpeg' : ext;
    if (metadata.format !== expectedFormat && !(expectedFormat === 'avif' && metadata.format === 'heif' && metadata.compression === 'av1')) {
      throw new Error(`Actual image type does not match ${image.src}`);
    }
    if (!recipe.demo && image.kind === 'cover' && image.width * 9 !== image.height * 16) throw new Error('Cover must be 16:9');
    if (metadata.orientation && metadata.orientation >= 5) throw new Error('Image orientation must be normalized to landscape');
    if (metadata.width !== image.width || metadata.height !== image.height || metadata.width <= metadata.height) {
      throw new Error(`Actual image dimensions do not match ${image.src}`);
    }
  }
}

export function ensureDirectory(root: string, relative: string): string {
  let directory = root;
  for (const segment of relative.split('/')) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory)) {
      if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error('Import directories must be real directories');
    } else fs.mkdirSync(directory);
  }
  return directory;
}

export function atomicWrite(file: string, value: unknown): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function readContentFile(root: string, relative: string): unknown {
  const file = path.join(root, relative);
  if (fs.realpathSync(file) !== file || !fs.statSync(file).isFile()) throw new Error('Content must be a regular file inside real repository directories');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Known fixture identities stay reserved even when the input changes its demo flag. */
export function assertNotFixture(recipe: Recipe, root: string): void {
  const fixtures = path.join(root, 'fixtures/recipes');
  if (!fs.existsSync(fixtures)) return;
  for (const name of fs.readdirSync(fixtures).filter((name) => name.endsWith('.json'))) {
    const fixture = RecipeSchema.parse(readContentFile(root, `fixtures/recipes/${name}`));
    if (recipe.id === fixture.id || recipe.slug === fixture.slug ||
        (JSON.stringify(recipe.ingredients) === JSON.stringify(fixture.ingredients) && JSON.stringify(recipe.steps) === JSON.stringify(fixture.steps))) {
      throw new Error('Demonstration fixture content/identity cannot be released as a real recipe');
    }
  }
}

/** Imports to staging only. It cannot publish or replace a live article. */
export async function importApprovedContent(input: unknown, root = process.cwd(), now = new Date()) {
  const envelope = ImportEnvelopeSchema.parse(input);
  if (!Number.isFinite(now.getTime()) || Date.parse(envelope.recipe.dates.updated) > now.getTime() ||
      Date.parse(envelope.recipe.approval!.approvedAt) > now.getTime()) throw new Error('Approved content dates cannot be in the future');
  const realRoot = fs.realpathSync(root);
  assertNotFixture(envelope.recipe, realRoot);
  const digest = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  await validateRecipeAssets(envelope.recipe, realRoot);
  const lock = path.join(realRoot, '.content-import.lock');
  const descriptor = fs.openSync(lock, 'wx', 0o600);
  try {
    const ledger = ensureDirectory(realRoot, 'content/imports');
    const incoming = ensureDirectory(realRoot, 'content/incoming');
    const marker = path.join(ledger, `${envelope.importId}.json`);
    const target = path.join(incoming, `${envelope.recipe.slug}.json`);
    if (fs.existsSync(marker)) {
      if (fs.lstatSync(marker).isSymbolicLink()) throw new Error('Invalid import ledger file');
      const previous = JSON.parse(fs.readFileSync(marker, 'utf8')) as { digest?: string };
      if (previous.digest !== digest) throw new Error('Idempotency conflict: importId was used for a different payload');
      if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) throw new Error('Staging content is missing; reconcile the import');
      const staged = RecipeSchema.parse(JSON.parse(fs.readFileSync(target, 'utf8')));
      if (staged.id !== envelope.recipe.id || staged.slug !== envelope.recipe.slug || staged.revision < envelope.recipe.revision ||
          (staged.revision === envelope.recipe.revision && JSON.stringify(staged) !== JSON.stringify(envelope.recipe))) {
        throw new Error('Staging content conflicts with the recorded import');
      }
      return { state: 'unchanged' as const, slug: envelope.recipe.slug, importId: envelope.importId };
    }
    for (const directory of [incoming, path.join(realRoot, 'src/content/recipes')]) {
      if (!fs.existsSync(directory)) continue;
      for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.json'))) {
        const candidate = path.join(directory, filename);
        if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Content symlinks are not allowed');
        const previous = RecipeSchema.parse(JSON.parse(fs.readFileSync(candidate, 'utf8')));
        if ((previous.slug === envelope.recipe.slug && previous.id !== envelope.recipe.id) ||
            (previous.id === envelope.recipe.id && previous.slug !== envelope.recipe.slug)) {
          throw new Error('Recipe identity and permanent slug cannot be reassigned');
        }
        if (previous.id === envelope.recipe.id && previous.revision >= envelope.recipe.revision) {
          // A crash after staging but before its ledger write is safely recoverable.
          if (directory === incoming && JSON.stringify(previous) === JSON.stringify(envelope.recipe)) continue;
          throw new Error('Content revision must increase');
        }
      }
    }
    atomicWrite(target, envelope.recipe);
    atomicWrite(marker, { schemaVersion: '1', importId: envelope.importId, digest,
      articleId: envelope.recipe.id, slug: envelope.recipe.slug, revision: envelope.recipe.revision });
    return { state: 'imported' as const, slug: envelope.recipe.slug, importId: envelope.importId };
  } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
}
