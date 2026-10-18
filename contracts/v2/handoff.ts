import { z } from 'zod';
import { PublicArticleSchema, Version, Id, Digest, Timestamp, articleDigest, assertReleaseContent } from './model.js';
import { RecipeSchema } from './recipe.js';
import { contentDigest } from './content-digest.js';
import { recipeProjection } from './projection.js';
import { operationKey } from './events.js';
export const ApprovalAttestationSchema = z.strictObject({
  reviewId: Id, revision: z.number().int().positive(), contentDigest: Digest,
  approvedAt: Timestamp, publicReviewer: Id,
  checks: z.strictObject({ completeness: z.literal(true), cookingLogic: z.literal(true), foodSafety: z.literal(true),
    originality: z.literal(true), facts: z.literal(true), mediaRights: z.literal(true) }),
});
export function importIdForKey(key: string): string {
  Digest.parse(key);
  const h = key.slice(0, 32).split(''); h[12] = '4'; h[16] = '8';
  const hex = h.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const SiteHandoffSchema = z.strictObject({
  schemaVersion: Version, importId: z.uuid(), operationId: Id, idempotencyKey: Digest,
  article: PublicArticleSchema, contentDigest: Digest, updatedAt: Timestamp, approval: ApprovalAttestationSchema,
}).superRefine((h, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  try { assertReleaseContent(h.article); } catch (e) { issue((e as Error).message); }
  if (h.importId !== importIdForKey(h.idempotencyKey)) issue('Import ID must be derived from the staging operation key');
  if (h.contentDigest !== articleDigest(h.article) || h.approval.contentDigest !== h.contentDigest || h.approval.revision !== h.article.revision) issue('Stale QA or content digest');
  if (h.idempotencyKey !== operationKey(h.article.articleId, h.article.revision, 'stage', h.operationId)) issue('Invalid staging operation key');
  if (Date.parse(h.approval.approvedAt) < Date.parse(h.article.createdAt) || Date.parse(h.updatedAt) < Date.parse(h.approval.approvedAt)) issue('Invalid approval chronology');
});
export type SiteHandoff = z.infer<typeof SiteHandoffSchema>;
/** v1 Recipe digest and v2 source digest are distinct, both validated; no approval is invented. */
export function handoffToRecipe(input: unknown) {
  const h = SiteHandoffSchema.parse(input);
  const recipe = { ...recipeProjection(h.article), editorial: h.article,
    dates: { created: h.article.createdAt, updated: h.updatedAt, published: null }, status: 'approved' as const,
    approval: { reviewId: h.approval.reviewId, revision: h.approval.revision, reviewer: h.approval.publicReviewer,
      approvedAt: h.approval.approvedAt, checks: h.approval.checks, contentDigest: '' },
  };
  recipe.approval.contentDigest = contentDigest(recipe);
  return RecipeSchema.parse(recipe);
}
export function handoffToImport(input: unknown) {
  const h = SiteHandoffSchema.parse(input);
  return { schemaVersion: '1' as const, importId: h.importId, recipe: handoffToRecipe(h) };
}
