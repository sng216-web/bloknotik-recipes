import { z } from 'zod';
import { Version, Id, Timestamp, Digest, Https, Slug, hash } from './model.js';
export const StatusSchema = z.enum(['prepared', 'approved', 'staged', 'released', 'deployed', 'public_verified', 'syndicated']);
const base = {
  schemaVersion: Version, eventId: Id, articleId: Id, slug: Slug, revision: z.number().int().nonnegative(), contentDigest: Digest.optional(),
  idempotencyKey: Digest, correlationId: Id, operationId: Id, occurredAt: Timestamp,
  source: z.enum(['editorial', 'notion', 'site', 'n8n']), actor: Id,
};
export const FailureSchema = z.strictObject({ code: Id, message: Id, retryable: z.boolean(), service: Id });
export const WireEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('plan.created'), payload: z.strictObject({ weekId: z.string().regex(/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/) }) }),
  z.strictObject({ ...base, type: z.literal('article.claimed'), payload: z.strictObject({ owner: Id, leaseUntil: Timestamp }) }),
  z.strictObject({ ...base, type: z.literal('draft.ready'), payload: z.strictObject({ artifactUrl: Https }) }),
  z.strictObject({ ...base, type: z.literal('qa.approved'), payload: z.strictObject({ reviewId: Id }) }),
  z.strictObject({ ...base, type: z.literal('qa.rejected'), payload: z.strictObject({ reviewId: Id, issues: z.array(Id).min(1) }) }),
  z.strictObject({ ...base, type: z.literal('release.requested'), payload: z.strictObject({ stagingRef: Id }) }),
  z.strictObject({ ...base, type: z.literal('deployment.confirmed'), payload: z.strictObject({ deploymentId: Id, commitSha: z.string().regex(/^[a-f0-9]{40}$/), url: Https }) }),
  z.strictObject({ ...base, type: z.literal('publication.failed'), payload: FailureSchema }),
]).superRefine((e, ctx) => {
  const planning = e.type === 'plan.created' || e.type === 'article.claimed';
  if ((!planning && e.revision === 0) || (e.revision > 0 && !e.contentDigest) || (e.revision === 0 && e.contentDigest)) {
    ctx.addIssue({ code: 'custom', message: 'Draft events require a positive revision and content digest; planning revision 0 has no content digest' });
  }
  if (e.type === 'article.claimed' && Date.parse(e.payload.leaseUntil) <= Date.parse(e.occurredAt)) ctx.addIssue({ code: 'custom', message: 'Claim lease must end after event time' });
  if (e.idempotencyKey !== operationKey(e.articleId, e.revision, e.type, e.operationId)) {
    ctx.addIssue({ code: 'custom', path: ['idempotencyKey'], message: 'Key must identify article, revision, operation type and operation ID' });
  }
});
export function operationKey(articleId: string, revision: number, operation: string, operationId: string): string {
  return hash({ schemaVersion: '2.0.0', articleId, revision, operation, operationId });
}
export type WireEvent = z.infer<typeof WireEventSchema>;
export type EditorialStatus = z.infer<typeof StatusSchema>;
/** n8n transports JSON envelopes, not native workflow JSON. No API/workflow side effects. */
export const encodeEvent = (e: unknown): string => JSON.stringify(WireEventSchema.parse(e));
export const decodeEvent = (e: string): WireEvent => WireEventSchema.parse(JSON.parse(e));
