import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { importApprovedContent, ImportEnvelopeSchema } from '../src/lib/import-content.js';
import { approvedFixture, demoFixture, publishedFixture } from './helpers.js';

async function testWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-import-'));
  fs.mkdirSync(path.join(root, 'public/images'), { recursive: true });
  const recipe = approvedFixture(); recipe.images = recipe.images.map((image) => ({ ...image, width: 16, height: 10 }));
  await sharp({ create: { width: 16, height: 10, channels: 3, background: '#ccc' } }).webp().toFile(path.join(root, 'public', recipe.images[0]!.src));
  return { root, envelope: { schemaVersion: '1' as const, importId: '00000000-0000-4000-8000-000000000001', recipe } };
}

test('import is a staging operation, idempotent and cannot edit the live catalog', async () => {
  const { root, envelope } = await testWorkspace();
  try {
    assert.equal((await importApprovedContent(envelope, root)).state, 'imported');
    assert.equal((await importApprovedContent(envelope, root)).state, 'unchanged');
    assert.equal(fs.existsSync(path.join(root, 'src/content/recipes')), false);
    const staged = JSON.parse(fs.readFileSync(path.join(root, 'content/incoming', `${envelope.recipe.slug}.json`), 'utf8'));
    assert.equal(staged.status, 'approved'); assert.equal(staged.dates.published, null);
    await assert.rejects(importApprovedContent({ ...envelope, recipe: { ...envelope.recipe, title: 'Different content' } }, root), /Idempotency conflict/);
    staged.title = 'Tampered staging content';
    fs.writeFileSync(path.join(root, 'content/incoming', `${envelope.recipe.slug}.json`), JSON.stringify(staged));
    await assert.rejects(importApprovedContent(envelope, root), /conflicts/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('demo, already-published, unapproved and unknown input cannot enter the import pipeline', () => {
  for (const recipe of [demoFixture(), publishedFixture(), { ...approvedFixture(), approval: null }]) {
    assert.equal(ImportEnvelopeSchema.safeParse({ schemaVersion: '1', importId: '00000000-0000-4000-8000-000000000001', recipe }).success, false);
  }
});

test('actual image dimensions and symlink boundaries are verified before content writes', async () => {
  const { root, envelope } = await testWorkspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-outside-'));
  try {
    const invalid = structuredClone(envelope); invalid.recipe.images[0]!.width = 100;
    await assert.rejects(importApprovedContent(invalid, root), /dimensions/);
    fs.symlinkSync(outside, path.join(root, 'content'));
    await assert.rejects(importApprovedContent(envelope, root), /real directories/);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('new imports reject permanent identity reassignment and stale revisions', async () => {
  const { root, envelope } = await testWorkspace();
  try {
    await importApprovedContent(envelope, root);
    const next = { ...envelope, importId: '00000000-0000-4000-8000-000000000002', recipe: { ...envelope.recipe, id: 'different-identity' } };
    await assert.rejects(importApprovedContent(next, root), /identity/);
    const stale = { ...envelope, importId: next.importId, recipe: { ...envelope.recipe, title: 'Different content same revision' } };
    await assert.rejects(importApprovedContent(stale, root), /revision/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
