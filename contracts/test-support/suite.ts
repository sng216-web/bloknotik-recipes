import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicArticleSchema, MediaAssetSchema, articleDigest, canonicalJson } from '../v2/model.js';
import { WireEventSchema, operationKey, encodeEvent, decodeEvent } from '../v2/events.js';
import { importIdForKey, SiteHandoffSchema, handoffToImport, handoffToRecipe } from '../v2/handoff.js';
import { RecipeSchema, isPublished } from '../v2/recipe.js';
import { sharedArticleFixture } from './fixture.js';
export function sharedHandoffFixture() {
  const a = sharedArticleFixture(), contentDigest = articleDigest(a);
  return SiteHandoffSchema.parse({ schemaVersion: '2.0.0', importId: importIdForKey(operationKey(a.articleId, a.revision, 'stage', 'stage-test')), operationId: 'stage-test',
    idempotencyKey: operationKey(a.articleId, a.revision, 'stage', 'stage-test'), article: a, contentDigest, updatedAt: '2026-10-18T09:00:00Z',
    approval: { reviewId: 'synthetic-review', revision: a.revision, contentDigest, approvedAt: '2026-10-18T09:00:00Z', publicReviewer: 'Synthetic test role',
      checks: { completeness: true, cookingLogic: true, foodSafety: true, originality: true, facts: true, mediaRights: true } } });
}
export function eventFixture(type: string, payload: unknown) {
  const a = sharedArticleFixture();
  return { schemaVersion: '2.0.0', eventId: `test-${type}`, articleId: a.articleId, slug: a.slug, revision: a.revision,
    contentDigest: articleDigest(a), idempotencyKey: operationKey(a.articleId, a.revision, type, 'test-operation'),
    correlationId: 'test-trace', operationId: 'test-operation', occurredAt: '2026-10-18T10:00:00Z', source: 'editorial', actor: 'synthetic-test', type, payload };
}
export function runSharedContractTests() {
  test('shared v2 fixture reaches actual RecipeSchema without field editing or data loss', () => {
    const h = sharedHandoffFixture(), recipe = handoffToRecipe(h), envelope = handoffToImport(h);
    RecipeSchema.parse(recipe);
    assert.deepEqual(recipe.editorial, h.article);
    assert.equal(recipe.id, h.article.articleId); assert.equal(recipe.slug, h.article.slug); assert.equal(recipe.revision, h.article.revision);
    assert.equal(articleDigest(recipe.editorial), h.contentDigest);
    assert.deepEqual(recipe, envelope.recipe); assert.equal(isPublished(recipe), false);
    assert.equal(recipe.ingredients[0]?.quantity, '100 г');
    assert.match(recipe.steps[0]!.text, /100 °C.*5 мин.*признак готовности/);
  });
  test('digest is invariant under key order and rejects non-JSON; fact changes invalidate QA', () => {
    const h = sharedHandoffFixture();
    const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ?
      Object.fromEntries(Object.entries(v).reverse().map(([k, value]) => [k, reverse(value)])) : v;
    assert.equal(articleDigest(reverse(h.article)), h.contentDigest);
    assert.throws(() => canonicalJson({ undefinedValue: undefined }), /JSON/);
    h.article.facts.ingredients[0]!.amount = '101';
    assert.notEqual(articleDigest(h.article), h.contentDigest);
    assert.throws(() => SiteHandoffSchema.parse(h), /Stale QA/);
  });
  test('strict boundaries reject unknown fields, versions, source references and stale approvals', () => {
    const h = sharedHandoffFixture();
    for (const bad of [{ ...h, schemaVersion: '3' }, { ...h, token: 'unknown' }, { ...h, approval: { ...h.approval, revision: 2 } },
      { ...h, idempotencyKey: operationKey(h.article.articleId, 1, 'release', 'stage-test') }]) assert.equal(SiteHandoffSchema.safeParse(bad).success, false);
    assert.equal(PublicArticleSchema.safeParse({ ...h.article, articleId: '' }).success, false);
    h.article.facts.ingredients[0]!.sourceIds = ['unknown'];
    assert.equal(PublicArticleSchema.safeParse(h.article).success, false);
  });
  test('cover orientation, 16:9, clean overlays, MIME and alt text are validated', () => {
    const cover = sharedArticleFixture().media[0]!;
    for (const bad of [{ ...cover, width: 90, height: 160 }, { ...cover, width: 150 }, { ...cover, alt: '' },
      { ...cover, mimeType: 'image/webp' }, { ...cover, kind: 'clean', hasTextOverlay: true }]) assert.equal(MediaAssetSchema.safeParse(bad).success, false);
    const h = sharedHandoffFixture(); h.article.media = h.article.media.filter(m => m.kind !== 'clean');
    assert.equal(SiteHandoffSchema.safeParse(h).success, false);
  });
  test('all eight strict event contracts round-trip through n8n JSON on both sides', () => {
    const entries = {
      'plan.created': { weekId: '2026-W42' }, 'article.claimed': { owner: 'test-owner', leaseUntil: '2026-10-18T11:00:00Z' },
      'draft.ready': { artifactUrl: 'https://example.org/test-artifact' }, 'qa.approved': { reviewId: 'test-review' },
      'qa.rejected': { reviewId: 'test-review', issues: ['synthetic issue'] }, 'release.requested': { stagingRef: 'test-ref' },
      'deployment.confirmed': { deploymentId: 'test-deploy', commitSha: 'a'.repeat(40), url: 'https://example.org/test-deploy' },
      'publication.failed': { code: 'test_failure', message: 'Synthetic failure', retryable: true, service: 'site' },
    };
    const planned = { ...eventFixture('plan.created', { weekId: '2026-W42' }), revision: 0,
      idempotencyKey: operationKey('synthetic-contract-article', 0, 'plan.created', 'test-operation') };
    delete (planned as { contentDigest?: string }).contentDigest;
    assert.equal(WireEventSchema.safeParse(planned).success, true);
    assert.equal(WireEventSchema.safeParse({ ...planned, type: 'draft.ready' }).success, false);
    for (const [type, payload] of Object.entries(entries)) {
      const e = WireEventSchema.parse(eventFixture(type, payload));
      assert.deepEqual(decodeEvent(encodeEvent(e)), e);
      assert.equal(WireEventSchema.safeParse({ ...e, schemaVersion: '1' }).success, false);
      assert.equal(WireEventSchema.safeParse({ ...e, payload: {} }).success, false);
    }
  });
  test('projection cannot alter facts behind a valid approval; demo cannot stage', () => {
    const h = sharedHandoffFixture(), recipe = handoffToRecipe(h);
    recipe.ingredients[0]!.quantity = '999 г';
    assert.equal(RecipeSchema.safeParse(recipe).success, false);
    h.article.demo = true; assert.equal(SiteHandoffSchema.safeParse(h).success, false);
  });
}
