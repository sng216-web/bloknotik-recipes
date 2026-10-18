import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepareRelease } from '../src/lib/publish-content.js';
import { RecipeSchema, isPublished } from '../src/lib/recipe-schema.js';
import { assertNotFixture } from '../src/lib/import-content.js';
import { contentDigest } from '../src/lib/content-digest.js';
import { approvedFixture, demoFixture, publishedFixture, reseal } from './helpers.js';

const now = new Date('2026-10-18T00:00:00Z');
async function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-release-test-'));
  fs.mkdirSync(path.join(root, 'public/images'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content/incoming'), { recursive: true });
  const recipe = approvedFixture(); recipe.images[0]!.width = 16; recipe.images[0]!.height = 10;
  const approved = reseal(recipe);
  await sharp({ create: { width: 16, height: 10, channels: 3, background: '#ccc' } }).webp().toFile(path.join(root, 'public', approved.images[0]!.src));
  const stage = (value: unknown) => fs.writeFileSync(path.join(root, 'content/incoming', `${approved.slug}.json`), JSON.stringify(value));
  stage(approved);
  return { root, recipe: approved, stage, target: path.join(root, 'src/content/recipes', `${approved.slug}.json`) };
}

test('publication preparation is idempotent across retries and equivalent timezone dates', async () => {
  const { root, recipe, target } = await workspace();
  try {
    assert.equal((await prepareRelease(recipe.slug, '2026-10-17T12:00:00Z', root, now)).state, 'prepared');
    const before = fs.statSync(target).mtimeMs;
    const bytes = fs.readFileSync(target, 'utf8');
    assert.equal((await prepareRelease(recipe.slug, '2026-10-17T15:00:00+03:00', root, now)).state, 'unchanged');
    assert.equal(fs.statSync(target).mtimeMs, before); assert.equal(fs.readFileSync(target, 'utf8'), bytes);
    await assert.rejects(prepareRelease(recipe.slug, '2026-10-17T13:00:00Z', root, now), /revision conflict/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('post-QA changes cannot retain the old approval, including modifications without a revision bump', () => {
  const recipe = approvedFixture();
  for (const input of [
    { ...recipe, title: 'Changed after review' }, { ...recipe, ingredients: [{ name: 'Changed', quantity: '1 kg' }] },
    { ...recipe, details: { cookMinutes: { value: 40, confirmed: true } } },
    { ...recipe, approval: { ...recipe.approval, contentDigest: '0'.repeat(64) } },
  ]) assert.equal(RecipeSchema.safeParse(input).success, false);
  const reordered = Object.fromEntries(Object.entries(recipe).reverse());
  assert.equal(contentDigest(reordered), contentDigest(recipe));
});

test('demo fixture identities and copied fixture instructions cannot become real source', () => {
  const fixture = demoFixture(); const approved = approvedFixture();
  assert.equal(RecipeSchema.safeParse(reseal({ ...approved, id: fixture.id })).success, false);
  assert.throws(() => assertNotFixture({ ...approved, slug: fixture.slug }, process.cwd()), /Demonstration/);
  assert.throws(() => assertNotFixture(approved, process.cwd()), /Demonstration/);
  assert.equal(isPublished({ ...publishedFixture(), approval: null }), false);
  assert.equal(isPublished({ ...publishedFixture(), approval: { ...publishedFixture().approval, checks: {} } }), false);
});

test('invalid dates, future QA, missing approval and changed payloads fail before a publication file is written', async () => {
  const { root, recipe, target, stage } = await workspace();
  try {
    for (const date of ['2026-02-30T12:00:00Z', '2026-10-17', '2026-10-19T00:00:00Z', '2026-10-17T10:30:00Z']) {
      await assert.rejects(prepareRelease(recipe.slug, date, root, now));
      assert.equal(fs.existsSync(target), false);
    }
    for (const input of [{ ...recipe, approval: null }, { ...recipe, demo: true }, { ...recipe, title: 'Unreviewed change' },
      { ...recipe, dates: { ...recipe.dates, updated: '2026-10-19T00:00:00Z' }, approval: { ...recipe.approval, approvedAt: '2026-10-19T00:00:00Z' } }]) {
      stage(input); await assert.rejects(prepareRelease(recipe.slug, '2026-10-17T12:00:00Z', root, now));
      assert.equal(fs.existsSync(target), false);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('publication rejects symlink destinations and cannot write outside the repository', async () => {
  const { root, recipe } = await workspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-release-outside-'));
  try {
    fs.mkdirSync(path.join(root, 'src')); fs.symlinkSync(outside, path.join(root, 'src/content'));
    await assert.rejects(prepareRelease(recipe.slug, '2026-10-17T12:00:00Z', root, now), /real directories/);
    assert.deepEqual(fs.readdirSync(outside), []);
    await assert.rejects(prepareRelease('../escape', '2026-10-17T12:00:00Z', root, now));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('new reviewed revisions retain publication date and slug, and stale retries cannot overwrite them', async () => {
  const { root, recipe, target, stage } = await workspace();
  try {
    await prepareRelease(recipe.slug, '2026-10-17T12:00:00Z', root, now);
    const next = reseal({ ...recipe, revision: 2, title: 'New reviewed revision',
      dates: { ...recipe.dates, updated: '2026-10-17T14:00:00Z' },
      approval: { ...recipe.approval!, revision: 2, reviewId: 'next-review', approvedAt: '2026-10-17T13:00:00Z' } });
    stage(next);
    await prepareRelease(next.slug, '2026-10-17T12:00:00Z', root, now);
    assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).revision, 2);
    stage(recipe);
    await assert.rejects(prepareRelease(recipe.slug, '2026-10-17T12:00:00Z', root, now), /revision conflict/);
    assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).revision, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no workflow imports arbitrary content directly into published source or calls the release command', () => {
  const workflow = fs.readFileSync('.github/workflows/import-content.yml', 'utf8');
  assert.doesNotMatch(workflow, /content:publish|release-content|prepareRelease|--auto|pull_request_target/);
  assert.match(workflow, /ref: main/); assert.match(workflow, /GITHUB_EVENT_PATH/);
});
