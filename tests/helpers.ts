import fs from 'node:fs';
import { RecipeSchema, type Recipe } from '../src/lib/recipe-schema.js';
import { contentDigest } from '../src/lib/content-digest.js';

/** Simulate a NEW review only for synthetic tests, never for real source files. */
export function reseal(recipe: Recipe): Recipe {
  const copy = structuredClone(recipe);
  if (copy.approval) copy.approval.contentDigest = contentDigest(copy);
  return copy;
}

export function demoFixture(): Recipe {
  return RecipeSchema.parse(JSON.parse(fs.readFileSync('fixtures/recipes/ovoshchnoy-salat.json', 'utf8')));
}

/** Synthetic test data only, never written to the real publication catalog. */
export function approvedFixture(): Recipe {
  const demo = demoFixture();
  const input = { ...demo, demo: false, id: 'synthetic-unit-test', slug: 'synthetic-test-recipe', tags: ['synthetic-test-only'], status: 'approved',
    dates: { created: '2026-10-17T10:00:00Z', updated: '2026-10-17T12:00:00Z', published: null },
    images: [...demo.images.map(i => ({ ...i, width: 160, height: 90 })), { ...demo.images[0]!, src: '/images/test-clean.webp', kind: 'clean', width: 160, height: 90 }],
    sources: [{ title: 'Synthetic test source', url: 'https://example.org/test-source' }],
    approval: { reviewId: 'test-only-review', revision: 1, reviewer: 'test-editor', approvedAt: '2026-10-17T11:00:00Z', contentDigest: '',
      checks: { completeness: true, cookingLogic: true, foodSafety: true, originality: true, facts: true, mediaRights: true } },
  };
  input.approval.contentDigest = contentDigest(input);
  return RecipeSchema.parse(input);
}

export function publishedFixture(): Recipe {
  const recipe = approvedFixture();
  return RecipeSchema.parse({ ...recipe, status: 'published', dates: { ...recipe.dates, published: '2026-10-17T12:00:00Z' } });
}
