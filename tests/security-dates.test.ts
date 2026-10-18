import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipeSchema } from '../src/lib/recipe-schema.js';
import { parseSearchIndex } from '../src/lib/search-index.js';
import { xml } from '../src/lib/seo.js';
import { approvedFixture, demoFixture, reseal } from './helpers.js';

test('invalid calendar/timezone dates and impossible chronology are rejected', () => {
  const recipe = approvedFixture();
  for (const date of ['2026-02-30T10:00:00Z', '2026-13-01T00:00:00Z', '2026-10-17T25:00:00Z', '2026-10-17T10:00:00', 'not-a-date']) {
    assert.equal(RecipeSchema.safeParse({ ...recipe, dates: { ...recipe.dates, updated: date } }).success, false);
  }
  assert.equal(RecipeSchema.safeParse({ ...recipe, dates: { ...recipe.dates, updated: '2026-10-16T10:00:00Z' } }).success, false);
  assert.equal(RecipeSchema.safeParse({ ...recipe, approval: { ...recipe.approval, approvedAt: '2026-10-17T13:00:00Z' } }).success, false);
});

test('XML control characters and lone surrogates fail closed instead of producing broken feeds', () => {
  const recipe = demoFixture();
  for (const character of ['\u0000', '\u000b', '\uffff', '\ud800']) {
    assert.equal(RecipeSchema.safeParse({ ...recipe, title: `Text${character}Text` }).success, false);
    assert.throws(() => xml(character));
  }
  assert.equal(RecipeSchema.safeParse(reseal(approvedFixture())).success, true);
  assert.equal(xml('Зелень 🌿 & овощи'), 'Зелень 🌿 &amp; овощи');
});

test('search data rejects malformed structures, executable URLs and duplicate destinations', () => {
  const entry = { title: 'Text', description: 'Text', category: 'soups', categoryTitle: 'Супы',
    href: '/bloknotik-recipes/recipes/test/', image: '/bloknotik-recipes/images/test.webp', searchText: 'Text' };
  assert.equal(parseSearchIndex([entry], '/bloknotik-recipes/').length, 1);
  for (const input of [{}, null, [null], [{ ...entry, title: 1 }], [{ ...entry, href: 'javascript:alert(1)' }],
    [{ ...entry, image: 'https://external.invalid/image.webp' }], [entry, entry], [{ ...entry, unexpected: true }]]) {
    assert.throws(() => parseSearchIndex(input, '/bloknotik-recipes/'));
  }
});
