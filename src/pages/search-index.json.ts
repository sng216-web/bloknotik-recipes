import { publishedRecipes } from '../lib/catalog.js';
import { CATEGORIES } from '../lib/recipe-schema.js';
import { pathFor } from '../lib/site-config.js';
export function GET() {
  const index = publishedRecipes().map((recipe) => ({
    title: recipe.title, description: recipe.description, category: recipe.category,
    categoryTitle: CATEGORIES[recipe.category].title, href: pathFor(`recipes/${recipe.slug}/`),
    image: pathFor(recipe.images.find((image) => image.kind === 'cover')!.src),
    searchText: [recipe.title, recipe.description, ...recipe.tags, ...recipe.ingredients.map((item) => item.name)].join(' '),
  }));
  return Response.json(index);
}
