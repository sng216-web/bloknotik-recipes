import fs from 'node:fs';
import path from 'node:path';
import { RecipeSchema, isPublished, type Recipe } from './recipe-schema.js';

export function validateCatalog(input: unknown[]): Recipe[] {
  const recipes = input.map((entry) => RecipeSchema.parse(entry));
  for (const key of ['id', 'slug'] as const) {
    if (new Set(recipes.map((recipe) => recipe[key])).size !== recipes.length) throw new Error(`Duplicate recipe ${key}`);
  }
  return recipes;
}

function readDirectory(directory: string): Recipe[] {
  const root = path.resolve(directory);
  return validateCatalog(fs.readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => {
    const file = path.join(root, name);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Content symlinks are not supported');
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const recipe = RecipeSchema.parse(value);
    if (name !== `${recipe.slug}.json`) throw new Error('Recipe filename must match slug');
    return recipe;
  }));
}

export function allRecipes(): Recipe[] {
  const recipes = readDirectory('src/content/recipes');
  if (recipes.some((recipe) => recipe.demo)) throw new Error('Demo fixtures belong outside the publication catalog');
  return recipes;
}

export function publishedRecipes(now = new Date()): Recipe[] {
  return allRecipes().filter((recipe) => isPublished(recipe, now))
    .sort((a, b) => Date.parse(b.dates.published!) - Date.parse(a.dates.published!));
}

export function demoRecipes(): Recipe[] {
  const recipes = readDirectory('fixtures/recipes');
  if (recipes.some((recipe) => !recipe.demo || recipe.status !== 'draft')) throw new Error('Fixtures must be explicit demo drafts');
  return recipes;
}
