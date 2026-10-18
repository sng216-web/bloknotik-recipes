import { absoluteUrl, SITE } from './site-config.js';
import { CATEGORIES, isPublished, type Recipe } from './recipe-schema.js';

export function recipeJsonLd(recipe: Recipe): Record<string, unknown> | null {
  if (!isPublished(recipe)) return null;
  const result: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Recipe', name: recipe.title,
    description: recipe.description, url: absoluteUrl(`recipes/${recipe.slug}/`),
    image: recipe.images.map((image) => absoluteUrl(image.src)),
    datePublished: recipe.dates.published, dateModified: recipe.dates.updated,
    author: { '@type': 'Organization', name: SITE.name },
    recipeCategory: CATEGORIES[recipe.category].title,
    recipeIngredient: recipe.ingredients.map((item) => `${item.quantity} ${item.name}`),
    recipeInstructions: recipe.steps.map((step, index) => ({ '@type': 'HowToStep', position: index + 1, text: step.text })),
    inLanguage: 'ru-RU',
  };
  if (recipe.details.servings) result['recipeYield'] = `${recipe.details.servings.value} порций`;
  if (recipe.details.prepMinutes) result['prepTime'] = `PT${recipe.details.prepMinutes.value}M`;
  if (recipe.details.cookMinutes) result['cookTime'] = `PT${recipe.details.cookMinutes.value}M`;
  if (recipe.details.prepMinutes && recipe.details.cookMinutes) {
    result['totalTime'] = `PT${recipe.details.prepMinutes.value + recipe.details.cookMinutes.value}M`;
  }
  if (recipe.details.caloriesKcal) result['nutrition'] = {
    '@type': 'NutritionInformation', calories: `${recipe.details.caloriesKcal.value} kcal`,
  };
  return result;
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function rssXml(recipes: Recipe[], now = new Date()): string {
  const items = recipes.filter((recipe) => isPublished(recipe, now)).map((recipe) => {
    const url = xml(absoluteUrl(`recipes/${recipe.slug}/`));
    return `<item><title>${xml(recipe.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${xml(recipe.description)}</description><category>${xml(CATEGORIES[recipe.category].title)}</category><pubDate>${new Date(recipe.dates.published!).toUTCString()}</pubDate></item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SITE.name}</title><link>${xml(absoluteUrl())}</link><description>${xml(SITE.description)}</description><language>ru</language><atom:link href="${xml(absoluteUrl('rss.xml'))}" rel="self" type="application/rss+xml"/>${items.join('')}</channel></rss>`;
}

export function sitemapXml(recipes: Recipe[], now = new Date()): string {
  const paths = ['', 'categories/', 'about/', ...Object.keys(CATEGORIES).map((category) => `categories/${category}/`)];
  const entries = paths.map((path) => `<url><loc>${xml(absoluteUrl(path))}</loc></url>`);
  for (const recipe of recipes.filter((entry) => isPublished(entry, now))) {
    entries.push(`<url><loc>${xml(absoluteUrl(`recipes/${recipe.slug}/`))}</loc><lastmod>${xml(recipe.dates.updated)}</lastmod></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;
}
