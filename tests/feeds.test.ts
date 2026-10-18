import test from 'node:test';
import assert from 'node:assert/strict';
import { rssXml, sitemapXml, recipeJsonLd } from '../src/lib/seo.js';
import { validateFeeds } from '../scripts/validate-feeds.js';
import { approvedFixture, demoFixture, publishedFixture, reseal } from './helpers.js';

const now = new Date('2026-10-18T00:00:00Z');
test('empty RSS is valid and contains no fabricated publications', () => {
  assert.deepEqual(validateFeeds(rssXml([], now), sitemapXml([], now), [], now), { rssItems: 0, sitemapUrls: 9 });
});

test('RSS semantics, escaped content, permanent GUIDs, namespaces and dates are validated together', () => {
  const recipe = reseal({ ...publishedFixture(), title: 'Тест <овощи> & зелень 🌿', description: 'Quotes " and & symbols' });
  assert.equal(validateFeeds(rssXml([recipe], now), sitemapXml([recipe], now), [recipe], now).rssItems, 1);
});

test('draft, demo, approved, archived, future publication and future revision never enter public feeds', () => {
  const published = publishedFixture();
  const approved = reseal({ ...approvedFixture(), id: 'not-released', slug: 'not-released' });
  const draft = reseal({ ...approvedFixture(), id: 'draft-test', slug: 'draft-test', status: 'draft', approval: null });
  const archived = reseal({ ...publishedFixture(), id: 'archived-test', slug: 'archived-test', status: 'archived' });
  const future = reseal({ ...publishedFixture(), id: 'future-test', slug: 'future-test', dates: { ...published.dates, published: '2026-10-19T00:00:00Z', updated: '2026-10-19T00:00:00Z' } });
  const futureRevision = reseal({ ...publishedFixture(), id: 'future-revision', slug: 'future-revision', dates: { ...published.dates, updated: '2026-10-19T00:00:00Z' } });
  const recipes = [published, approved, draft, archived, future, futureRevision, demoFixture()];
  const feed = rssXml(recipes, now); const sitemap = sitemapXml(recipes, now);
  assert.equal(validateFeeds(feed, sitemap, recipes, now).rssItems, 1);
  for (const recipe of recipes.filter((entry) => entry.id !== published.id)) {
    assert.ok(!feed.includes(`/recipes/${recipe.slug}/`) && !sitemap.includes(`/recipes/${recipe.slug}/`));
    if (recipe.status !== 'published') assert.equal(recipeJsonLd(recipe), null);
  }
});

test('feed validation detects broken XML, duplicate or leaked entries and incorrect publication dates', () => {
  const recipe = publishedFixture(); const recipes = [recipe];
  const feed = rssXml(recipes, now); const sitemap = sitemapXml(recipes, now);
  const item = feed.match(/<item>.*?<\/item>/)![0];
  for (const broken of [feed.replace('</rss>', ''), feed.replace('</channel>', `${item}</channel>`),
    feed.replace(/<pubDate>.*?<\/pubDate>/, '<pubDate>not-a-date</pubDate>'),
    feed.replaceAll(`/recipes/${recipe.slug}/`, '/recipes/unapproved/')]) {
    assert.throws(() => validateFeeds(broken, sitemap, recipes, now));
  }
  assert.throws(() => validateFeeds(feed, sitemap.replace('<loc>', '<loc>https://unapproved.invalid/'), recipes, now));
});

test('duplicate slugs or IDs cannot be serialized even if the caller bypasses catalog loading', () => {
  const recipe = publishedFixture();
  for (const records of [[recipe, recipe], [recipe, reseal({ ...recipe, id: 'other' })]]) {
    assert.throws(() => rssXml(records, now), /Duplicate/);
    assert.throws(() => sitemapXml(records, now), /Duplicate/);
  }
});
