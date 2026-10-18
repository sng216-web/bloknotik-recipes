import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { isPublished, type Recipe } from '../src/lib/recipe-schema.js';
import { absoluteUrl } from '../src/lib/site-config.js';
import { sitemapXml } from '../src/lib/seo.js';

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });
const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Verify feed meaning as well as XML syntax; does not contact external services. */
export function validateFeeds(rss: string, sitemap: string, recipes: Recipe[], now = new Date()) {
  assert.equal(SyntaxValidator.validate(rss), true);
  assert.equal(SyntaxValidator.validate(sitemap), true);
  const document = parser.parse(rss);
  assert.equal(document.rss['@_version'], '2.0');
  assert.equal(document.rss['@_xmlns:atom'], 'http://www.w3.org/2005/Atom');
  const channel = document.rss.channel;
  assert.equal(channel.link, absoluteUrl());
  assert.equal(channel['atom:link']['@_href'], absoluteUrl('rss.xml'));
  assert.equal(channel['atom:link']['@_rel'], 'self');
  const items = list<Record<string, any>>(channel.item);
  const published = recipes.filter((recipe) => isPublished(recipe, now));
  const expected = new Map(published.map((recipe) => [absoluteUrl(`recipes/${recipe.slug}/`), recipe]));
  assert.equal(expected.size, published.length, 'Duplicate published permanent URL');
  assert.equal(items.length, expected.size, 'RSS item count differs from published catalog');
  const seen = new Set<string>();
  for (const item of items) {
    assert.equal(typeof item['link'], 'string');
    const url = item['link'] as string;
    assert.ok(!seen.has(url), 'Duplicate RSS URL'); seen.add(url);
    const recipe = expected.get(url);
    assert.ok(recipe, `RSS contains an unpublished URL: ${url}`);
    assert.equal(item['guid']['#text'], url);
    assert.equal(item['guid']['@_isPermaLink'], 'true');
    assert.equal(item['title'], recipe.title);
    assert.equal(item['description'], recipe.description);
    assert.equal(item['pubDate'], new Date(recipe.dates.published!).toUTCString());
    assert.ok(Number.isFinite(Date.parse(item['pubDate'])) && Date.parse(item['pubDate']) <= now.getTime());
  }
  const map = parser.parse(sitemap).urlset;
  assert.equal(map['@_xmlns'], 'http://www.sitemaps.org/schemas/sitemap/0.9');
  const locations = list<Record<string, string>>(map.url);
  const expectedMap = parser.parse(sitemapXml(recipes, now)).urlset;
  const expectedLocations = list<Record<string, string>>(expectedMap.url);
  assert.deepEqual(locations.map((entry) => entry['loc']).sort(), expectedLocations.map((entry) => entry['loc']).sort());
  assert.equal(new Set(locations.map((entry) => entry['loc'])).size, locations.length, 'Duplicate sitemap URL');
  for (const entry of locations) {
    const recipe = expected.get(entry['loc']!);
    if (recipe) assert.equal(entry['lastmod'], recipe.dates.updated);
  }
  return { rssItems: items.length, sitemapUrls: locations.length };
}
