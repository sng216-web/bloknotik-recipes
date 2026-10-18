import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { RecipeSchema } from './recipe-schema.js';
import { assertNotFixture, atomicWrite, ensureDirectory, readContentFile, validateRecipeAssets } from './import-content.js';

/** Explicit editorial operation. No automatic workflow calls this function. */
export async function prepareRelease(slug: string, date: string, root = process.cwd(), now = new Date()) {
  z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse(slug);
  const published = new Date(z.iso.datetime({ offset: true }).parse(date)).toISOString();
  if (!Number.isFinite(now.getTime()) || Date.parse(published) > now.getTime()) throw new Error('Publication date cannot be in the future');
  const realRoot = fs.realpathSync(root);
  const recipe = RecipeSchema.parse(readContentFile(realRoot, `content/incoming/${slug}.json`));
  if (recipe.slug !== slug || recipe.status !== 'approved' || recipe.demo || !recipe.approval) throw new Error('Only matching approved non-demo staging content can be released');
  if (Date.parse(recipe.dates.updated) > now.getTime()) throw new Error('Content/approval dates cannot be in the future');
  assertNotFixture(recipe, realRoot);
  await validateRecipeAssets(recipe, realRoot);
  const output = RecipeSchema.parse({ ...recipe, status: 'published', dates: {
    ...recipe.dates, published, updated: new Date(Math.max(Date.parse(recipe.dates.updated), Date.parse(published))).toISOString(),
  } });
  const directory = ensureDirectory(realRoot, 'src/content/recipes');
  const target = path.join(directory, `${slug}.json`);
  // Atomic lock makes conflicting concurrent CLI processes fail rather than overwrite.
  const lock = path.join(realRoot, '.content-publication.lock');
  const descriptor = fs.openSync(lock, 'wx', 0o600);
  try {
    for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      const previous = RecipeSchema.parse(readContentFile(realRoot, `src/content/recipes/${name}`));
      if (name !== `${previous.slug}.json`) throw new Error('Published filename must match slug');
      if ((previous.slug === output.slug && previous.id !== output.id) || (previous.id === output.id && previous.slug !== output.slug)) throw new Error('Published identity/slug conflict');
      if (previous.id !== output.id) continue;
      const normalized = (value: typeof output) => ({ ...value, dates: {
        created: new Date(value.dates.created).toISOString(), updated: new Date(value.dates.updated).toISOString(),
        published: value.dates.published ? new Date(value.dates.published).toISOString() : null,
      } });
      if (JSON.stringify(normalized(previous)) === JSON.stringify(normalized(output))) return { state: 'unchanged' as const, slug };
      if (previous.revision >= output.revision) throw new Error('Published content revision conflict');
      if (Date.parse(previous.dates.published!) !== Date.parse(output.dates.published!)) throw new Error('Keep the original publication date');
      if (Date.parse(output.dates.updated) <= Date.parse(previous.dates.updated)) throw new Error('Updated date must advance');
    }
    if (!fs.existsSync(target) && Date.parse(published) < Date.parse(recipe.approval.approvedAt)) throw new Error('First publication cannot precede approval');
    atomicWrite(target, output);
    return { state: 'prepared' as const, slug };
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
}
