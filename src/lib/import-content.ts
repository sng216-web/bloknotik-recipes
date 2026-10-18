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
    if (fs.statSync(real).size > 10 * 1024 * 1024) throw new Error('Images may not exceed 10 MiB');
    const metadata = await sharp(real, { limitInputPixels: 40_000_000 }).metadata();
    if (metadata.width !== image.width || metadata.height !== image.height || metadata.width <= metadata.height) {
      throw new Error(`Actual image dimensions do not match ${image.src}`);
    }
  }
}

function ensureDirectory(root: string, relative: string): string {
  let directory = root;
  for (const segment of relative.split('/')) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory)) {
      if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error('Import directories must be real directories');
    } else fs.mkdirSync(directory);
  }
  return directory;
}

function atomicWrite(file: string, value: unknown): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** Imports to staging only. It cannot publish or replace a live article. */
export async function importApprovedContent(input: unknown, root = process.cwd()) {
  const envelope = ImportEnvelopeSchema.parse(input);
  const realRoot = fs.realpathSync(root);
  const digest = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  await validateRecipeAssets(envelope.recipe, realRoot);
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
}
