import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { allRecipes, demoRecipes, publishedRecipes } from '../src/lib/catalog.js';
import { SITE } from '../src/lib/site-config.js';
import { validateRecipeAssets } from '../src/lib/import-content.js';

const root = path.resolve('dist');
const files = fs.readdirSync(root, { recursive: true }).filter((file): file is string => typeof file === 'string');
const htmlFiles = files.filter((file) => file.endsWith('.html'));
for (const filename of htmlFiles) {
  const $ = load(fs.readFileSync(path.join(root, filename), 'utf8'));
  assert.equal($('h1').length, 1, `One H1 required: ${filename}`);
  const canonical = $('link[rel=canonical]').attr('href');
  assert.ok(canonical?.startsWith(SITE.url), `Invalid canonical: ${filename}`);
  assert.ok($('meta[name=description]').attr('content'), `Description required: ${filename}`);
  assert.ok($('meta[property="og:image"]').attr('content')?.startsWith(SITE.url));
  if (filename.startsWith('demo/')) {
    assert.match($('meta[name=robots]').attr('content') ?? '', /noindex/);
    assert.equal($('script[type="application/ld+json"]').length, 0);
  }
  $('a[href],img[src],script[src],link[rel=stylesheet]').each((_index, element) => {
    const attribute = $(element).attr('href') ?? $(element).attr('src');
    if (!attribute || /^(?:https?:|mailto:|data:)/.test(attribute)) return;
    const url = new URL(attribute, canonical!);
    assert.ok(url.pathname.startsWith(SITE.base), `Link misses hosting base: ${attribute}`);
    let relative = decodeURIComponent(url.pathname.slice(SITE.base.length));
    if (url.pathname.endsWith('/')) relative += 'index.html';
    const destination = path.resolve(root, relative);
    assert.ok(destination.startsWith(`${root}${path.sep}`));
    assert.ok(fs.existsSync(destination), `Broken local link ${attribute} in ${filename}`);
    if (url.hash && destination.endsWith('.html')) {
      const target = load(fs.readFileSync(destination, 'utf8'));
      assert.ok(target(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).length, `Missing fragment ${attribute}`);
    }
  });
}
const feed = fs.readFileSync('dist/rss.xml', 'utf8');
const sitemap = fs.readFileSync('dist/sitemap.xml', 'utf8');
assert.equal(SyntaxValidator.validate(feed), true); assert.equal(SyntaxValidator.validate(sitemap), true);
const channel = new XMLParser().parse(feed).rss.channel as { item?: unknown | unknown[] };
const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
assert.equal(items.length, publishedRecipes().length);
for (const entry of [...feed.matchAll(/<link>(.*?)<\/link>/g), ...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]) {
  const url = new URL(entry[1]!);
  assert.equal(url.origin, SITE.origin);
  assert.ok(url.pathname.startsWith(SITE.base));
  const relative = url.pathname.slice(SITE.base.length);
  assert.ok(fs.existsSync(path.join(root, relative, 'index.html')), `Public index links to a missing page: ${url.href}`);
}
const searchIndex = JSON.parse(fs.readFileSync('dist/search-index.json', 'utf8')) as unknown[];
assert.equal(searchIndex.length, publishedRecipes().length);
for (const demo of demoRecipes()) {
  assert.ok(!feed.includes(demo.slug) && !sitemap.includes(demo.slug));
  assert.ok(!JSON.stringify(searchIndex).includes(demo.slug));
}
for (const recipe of [...allRecipes(), ...demoRecipes()]) await validateRecipeAssets(recipe, process.cwd());
console.log(`Verified ${htmlFiles.length} HTML pages, local links, XML, public-only indexes and real image dimensions.`);
