import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { RecipeSchema } from '../src/lib/recipe-schema.js';
import { validateRecipeAssets } from '../src/lib/import-content.js';

const { values } = parseArgs({ options: { slug: { type: 'string' }, 'published-at': { type: 'string' } } });
if (!values.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug) || !values['published-at']) {
  throw new Error('Use --slug <permanent-slug> --published-at <confirmed-ISO-timestamp>');
}
const recipe = RecipeSchema.parse(JSON.parse(fs.readFileSync(`content/incoming/${values.slug}.json`, 'utf8')));
if (recipe.status !== 'approved' || recipe.demo) throw new Error('Only approved non-demo staging content can be prepared for publication');
const published = values['published-at'];
if (!Number.isFinite(Date.parse(published)) || Date.parse(published) > Date.now()) throw new Error('Publication time must be confirmed and not in the future');
const output = RecipeSchema.parse({ ...recipe, status: 'published', dates: {
  ...recipe.dates, published, updated: new Date(Math.max(Date.parse(recipe.dates.updated), Date.parse(published))).toISOString(),
} });
await validateRecipeAssets(output, process.cwd());
const destination = `src/content/recipes/${recipe.slug}.json`;
if (fs.existsSync(destination)) {
  const previous = RecipeSchema.parse(JSON.parse(fs.readFileSync(destination, 'utf8')));
  if (previous.id !== output.id || previous.revision >= output.revision) throw new Error('Published content identity/revision conflict');
  if (previous.dates.published !== output.dates.published) throw new Error('Keep the original confirmed publication date when updating a recipe');
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log('Prepared for editorial PR; this command does not deploy or prove public availability.');
