import fs from 'node:fs';
import { RecipeSchema, type Recipe } from '../src/lib/recipe-schema.js';

export function demoFixture(): Recipe {
  return RecipeSchema.parse(JSON.parse(fs.readFileSync('fixtures/recipes/ovoshchnoy-salat.json', 'utf8')));
}

/** Synthetic test data only, never written to the real publication catalog. */
export function approvedFixture(): Recipe {
  const demo = demoFixture();
  return RecipeSchema.parse({ ...demo, demo: false, id: 'synthetic-unit-test', status: 'approved',
    dates: { created: '2026-10-17T10:00:00Z', updated: '2026-10-17T12:00:00Z', published: null },
    sources: [{ title: 'Synthetic test source', url: 'https://example.org/test-source' }],
    approval: { reviewId: 'test-only-review', revision: 1, reviewer: 'test-editor', approvedAt: '2026-10-17T11:00:00Z',
      checks: { completeness: true, cookingLogic: true, foodSafety: true, originality: true, facts: true, mediaRights: true } },
  });
}

export function publishedFixture(): Recipe {
  const recipe = approvedFixture();
  return RecipeSchema.parse({ ...recipe, status: 'published', dates: { ...recipe.dates, published: '2026-10-17T12:00:00Z' } });
}
