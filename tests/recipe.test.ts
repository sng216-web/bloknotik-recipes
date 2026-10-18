import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipeSchema, isPublished } from '../src/lib/recipe-schema.js';
import { validateCatalog } from '../src/lib/catalog.js';
import { recipeJsonLd, rssXml, safeJson, sitemapXml } from '../src/lib/seo.js';
import { resolveSite } from '../src/lib/site-config.js';
import { approvedFixture, demoFixture, publishedFixture, reseal } from './helpers.js';

test('strict recipe contract rejects unknown fields, unsafe slugs, missing QA and portrait images', () => {
  const recipe = approvedFixture();
  for (const input of [
    { ...recipe, secret: 'not-a-real-secret' }, { ...recipe, slug: '../escape' },
    { ...recipe, approval: null }, { ...recipe, revision: 2 },
    { ...recipe, ingredients: [{ name: 'No quantity' }] },
    { ...recipe, images: recipe.images.map((image) => ({ ...image, width: 100, height: 200 })) },
    { ...recipe, images: recipe.images.map((image) => ({ ...image, src: '/images/../../escape.webp' })) },
    { ...recipe, details: { servings: { value: 4, confirmed: false } } },
    { ...recipe, sources: [{ title: 'Invalid', url: 'not-a-url' }] },
    { ...recipe, approval: { ...recipe.approval, checks: { ...recipe.approval!.checks, foodSafety: false } } },
  ]) assert.equal(RecipeSchema.safeParse(input).success, false);
});

test('drafts, demos, approved and future content cannot masquerade as published', () => {
  assert.equal(isPublished(demoFixture()), false);
  assert.equal(isPublished(approvedFixture()), false);
  assert.equal(RecipeSchema.safeParse({ ...publishedFixture(), demo: true }).success, false);
  assert.equal(isPublished(publishedFixture(), new Date('2026-10-17T11:00:00Z')), false);
  assert.equal(isPublished(publishedFixture(), new Date('2026-10-17T13:00:00Z')), true);
  const futureRevision = publishedFixture(); futureRevision.dates.updated = '2026-10-20T00:00:00Z';
  assert.equal(isPublished(futureRevision, new Date('2026-10-18T00:00:00Z')), false);
});

test('permanent recipe identity and slugs cannot collide within a catalog', () => {
  const recipe = publishedFixture();
  assert.throws(() => validateCatalog([recipe, reseal({ ...recipe, id: 'another' })]), /Duplicate recipe slug/);
  assert.throws(() => validateCatalog([recipe, reseal({ ...recipe, slug: 'another' })]), /Duplicate recipe id/);
});

test('RSS and sitemap contain only genuine published records and permanent absolute URLs', () => {
  const published = publishedFixture();
  published.title = 'Тест & <спецсимволы>';
  const feed = rssXml([demoFixture(), reseal({ ...approvedFixture(), id: 'unreleased', slug: 'unreleased' }), reseal(published)], new Date('2026-10-18T00:00:00Z'));
  assert.equal((feed.match(/<item>/g) ?? []).length, 1);
  assert.match(feed, /Тест &amp; &lt;спецсимволы&gt;/);
  assert.match(feed, /https:\/\/sng216-web.github.io\/bloknotik-recipes\/recipes\//);
  assert.doesNotMatch(feed, /\/demo\//);
  assert.doesNotMatch(sitemapXml([demoFixture(), approvedFixture()]), /\/recipes\/|\/demo\//);
});

test('Recipe JSON-LD omits unconfirmed optional facts, ratings and demo content', () => {
  assert.equal(recipeJsonLd(demoFixture()), null);
  const data = recipeJsonLd(publishedFixture());
  assert.ok(data);
  for (const field of ['aggregateRating', 'review', 'nutrition', 'recipeYield', 'prepTime', 'cookTime', 'totalTime']) {
    assert.equal(field in data, false);
  }
  const recipe = publishedFixture(); recipe.details = { servings: { value: 3, confirmed: true }, cookMinutes: { value: 20, confirmed: true } };
  const confirmed = recipeJsonLd(reseal(recipe))!;
  assert.equal(confirmed['recipeYield'], '3 порций'); assert.equal(confirmed['cookTime'], 'PT20M');
  assert.equal('totalTime' in confirmed, false);
  assert.doesNotMatch(safeJson({ text: '</script><script>alert(1)</script>' }), /<\/script>/);
});

test('hosting configuration supports a project subpath or custom domain and rejects injected URLs', () => {
  assert.equal(resolveSite('https://example.org/').base, '/');
  assert.equal(resolveSite('https://example.org/recipes/').base, '/recipes/');
  for (const url of ['http://example.org/', 'https://user:password@example.org/', 'https://example.org/?q=1', 'https://example.org/path']) {
    assert.throws(() => resolveSite(url));
  }
});
