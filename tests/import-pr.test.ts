import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureImportPullRequest } from '../scripts/import-pr.js';

test('a retry after PR API failure completes an existing import branch without duplicate PRs', async () => {
  let attempts = 0;
  let opened = false;
  const list = async () => opened ? [{ state: 'OPEN' as const, url: 'https://example.org/test-pr', mergedAt: null }] : [];
  const create = async () => { attempts++; if (attempts === 1) throw new Error('Test API unavailable'); opened = true; return 'https://example.org/test-pr'; };
  await assert.rejects(ensureImportPullRequest(list, create), /unavailable/);
  assert.equal((await ensureImportPullRequest(list, create)).state, 'created');
  assert.equal((await ensureImportPullRequest(list, create)).state, 'existing');
  assert.equal(attempts, 2);
});

test('merged imports remain terminal and closed imports require explicit editorial reopening', async () => {
  let writes = 0;
  const create = async () => { writes++; return 'unused'; };
  assert.equal((await ensureImportPullRequest(async () => [{ state: 'MERGED', mergedAt: '2026-10-18T00:00:00Z', url: 'https://example.org/test-pr' }], create)).state, 'merged');
  await assert.rejects(ensureImportPullRequest(async () => [{ state: 'CLOSED', mergedAt: null, url: 'https://example.org/test-pr' }], create), /closed/);
  assert.equal(writes, 0);
});
