import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sharedHandoffFixture } from '../contracts/test-support/suite.js';
import { handoffToRecipe, stageEditorialHandoff } from '../src/lib/editorial-contract.js';
import { RecipeSchema, isPublished } from '../src/lib/recipe-schema.js';
import { prepareRelease } from '../src/lib/publish-content.js';
import { validateRecipeAssets } from '../src/lib/import-content.js';
import { recipeJsonLd, rssXml, sitemapXml } from '../src/lib/seo.js';
import { articleDigest } from '../contracts/v2/model.js';
const now = new Date('2026-10-18T12:00:00Z');
async function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-v2-'));
  fs.mkdirSync(path.join(root, 'public/images'), { recursive: true });
  const handoff = sharedHandoffFixture();
  for (const image of handoff.article.media) {
    await sharp({ create: { width: image.width, height: image.height, channels: 3, background: '#ccc' } }).png().toFile(path.join(root, 'public', image.src));
  }
  return { root, handoff };
}
test('shared v2 object stages idempotently, retains facts, and releases only explicitly in an isolated temporary workspace', async () => {
  const { root, handoff } = await workspace();
  try {
    assert.equal((await stageEditorialHandoff(handoff, root, now)).state, 'imported');
    assert.equal((await stageEditorialHandoff(handoff, root, now)).state, 'unchanged');
    assert.equal(fs.existsSync(path.join(root, 'src/content/recipes')), false);
    const staged = RecipeSchema.parse(JSON.parse(fs.readFileSync(path.join(root, `content/incoming/${handoff.article.slug}.json`), 'utf8')));
    assert.deepEqual(staged.editorial, handoff.article);
    assert.equal(isPublished(staged, now), false); assert.equal(recipeJsonLd(staged), null);
    assert.doesNotMatch(rssXml([staged], now), /<item>/); assert.doesNotMatch(sitemapXml([staged], now), /synthetic-contract-recipe/);
    assert.equal((await prepareRelease(staged.slug, '2026-10-18T10:00:00Z', root, now)).state, 'prepared');
    assert.equal((await prepareRelease(staged.slug, '2026-10-18T10:00:00Z', root, now)).state, 'unchanged');
    const released = RecipeSchema.parse(JSON.parse(fs.readFileSync(path.join(root, `src/content/recipes/${staged.slug}.json`), 'utf8')));
    assert.equal(articleDigest(released.editorial), handoff.contentDigest); assert.equal(released.dates.published, '2026-10-18T10:00:00.000Z');
    const jsonLd = recipeJsonLd(released)!;
    assert.deepEqual(jsonLd['image'], ['https://sng216-web.github.io/bloknotik-recipes/images/test-clean.png']);
    assert.equal('prepTime' in jsonLd, false); assert.equal('nutrition' in jsonLd, false);
    assert.equal((rssXml([released], now).match(/<item>/g) ?? []).length, 1);
    const conflict = structuredClone(handoff); conflict.article.revision = 2;
    await assert.rejects(stageEditorialHandoff(conflict, root, now), /Stale QA|operation|Import ID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('actual media signature, dimensions, missing assets and clean-image presence fail before staging', async () => {
  const { root, handoff } = await workspace();
  try {
    const file = path.join(root, 'public/images/test-cover.png');
    await sharp({ create: { width: 160, height: 90, channels: 3, background: '#ccc' } }).webp().toFile(`${file}.tmp`);
    fs.renameSync(`${file}.tmp`, file);
    await assert.rejects(stageEditorialHandoff(handoff, root, now), /type/);
    assert.equal(fs.existsSync(path.join(root, 'content')), false);
    fs.unlinkSync(file);
    await assert.rejects(validateRecipeAssets(handoffToRecipe(handoff), root), /ENOENT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
