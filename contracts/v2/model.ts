import { createHash } from 'node:crypto';
import { z } from 'zod';

export const VERSION = '2.0.0' as const;
export const Version = z.literal(VERSION);
export const Text = z.string().trim().min(1).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|\p{Surrogate}/u.test(v), 'Invalid XML text');
export const Id = Text.max(200);
export const Timestamp = z.iso.datetime({ offset: true });
export const Digest = z.string().regex(/^[a-f0-9]{64}$/);
export const Slug = z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const Https = z.url({ protocol: /^https$/ }).refine(v => {
  const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash;
}, 'Use a permanent HTTPS URL without credentials, query or fragment');
export const Category = z.enum(['breakfast', 'soups', 'mains', 'salads', 'baking', 'desserts']);
export const SourceSchema = z.strictObject({ id: Id, title: Text, url: Https, accessedAt: Timestamp });
const refs = z.array(Id).min(1);
const confirmedNumber = z.strictObject({ value: z.number().nonnegative(), sourceIds: refs });
const confirmedTemperature = z.strictObject({ value: z.number().min(-273.15), sourceIds: refs });
const confirmedText = z.strictObject({ value: Text, sourceIds: refs });

export const RecipeFactsSchema = z.strictObject({
  schemaVersion: Version,
  verification: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('unverified') }),
    z.strictObject({ status: z.literal('verified'), verifiedAt: Timestamp, evidence: Text }),
  ]),
  sources: z.array(SourceSchema).min(1),
  ingredients: z.array(z.strictObject({ id: Id, name: Text, amount: Text, unit: Text, sourceIds: refs })).min(1),
  servings: confirmedNumber.refine(v => Number.isInteger(v.value) && v.value > 0).optional(),
  prepMinutes: confirmedNumber.refine(v => Number.isInteger(v.value)).optional(),
  cookMinutes: confirmedNumber.refine(v => Number.isInteger(v.value)).optional(),
  steps: z.array(z.strictObject({
    id: Id, instruction: Text, sourceIds: refs,
    temperatureC: confirmedTemperature.optional(), durationMinutes: confirmedNumber.optional(),
    doneness: confirmedText.optional(), safety: z.array(confirmedText),
  })).min(1),
  safety: z.array(confirmedText),
}).superRefine((f, ctx) => {
  const known = new Set(f.sources.map(s => s.id));
  for (const list of [f.sources, f.ingredients, f.steps]) {
    if (new Set(list.map(x => x.id)).size !== list.length) ctx.addIssue({ code: 'custom', message: 'Duplicate fact/source IDs' });
  }
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if ('sourceIds' in v && Array.isArray(v.sourceIds) && v.sourceIds.some(id => !known.has(id))) {
      ctx.addIssue({ code: 'custom', message: 'Unknown fact source reference' });
    }
    Object.values(v).forEach(visit);
  };
  visit(f);
});

/** Literary agents accept this object only; facts are outside their input/output port. */
export const ArticleContentSchema = z.strictObject({
  schemaVersion: Version, h1: Text.max(160), seoTitle: Text.max(160), metaDescription: Text.max(400),
  introduction: Text, narrative: z.array(Text), tips: z.array(Text), conclusion: Text.optional(),
  zenTitle: Text, tags: z.array(Text.max(60)).max(12),
}).superRefine((c, ctx) => {
  if (/[—«»]/u.test(JSON.stringify(c))) ctx.addIssue({ code: 'custom', message: 'Use short dashes and straight quotes in editorial text' });
});

export const MediaAssetSchema = z.strictObject({
  schemaVersion: Version, id: Id, kind: z.enum(['cover', 'clean', 'step']),
  src: z.string().regex(/^\/images\/[a-z0-9-]+\.(?:webp|jpe?g|png|avif)$/),
  mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  width: z.number().int().positive(), height: z.number().int().positive(),
  alt: Text, rights: z.enum(['owned', 'licensed', 'generated']), credit: Text,
  sourceUrl: Https, hasTextOverlay: z.boolean(),
}).superRefine((a, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (a.width <= a.height) issue('Images must be landscape');
  if (a.kind === 'cover' && a.width * 9 !== a.height * 16) issue('Cover must have a 16:9 aspect ratio');
  if (a.kind === 'cover' && !a.hasTextOverlay) issue('Cover requires a reviewed text overlay');
  if (a.kind === 'clean' && a.hasTextOverlay) issue('Clean dish image cannot contain text overlays');
  const ext = a.src.split('.').pop();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  if (a.mimeType !== mime) issue('Image extension and MIME type differ');
});

export const PublicArticleSchema = z.strictObject({
  schemaVersion: Version, articleId: Id, slug: Slug, revision: z.number().int().positive(),
  createdAt: Timestamp, category: Category, demo: z.boolean(),
  facts: RecipeFactsSchema, content: ArticleContentSchema, media: z.array(MediaAssetSchema),
}).superRefine((a, ctx) => {
  if (new Set(a.media.map(m => m.id)).size !== a.media.length || new Set(a.media.map(m => m.src)).size !== a.media.length) {
    ctx.addIssue({ code: 'custom', path: ['media'], message: 'Duplicate media IDs or paths' });
  }
});

/** JSON canonicalization v2: UTF-16 code-unit key sort, array order retained, no normalization.
 * Call schemas first. Reject non-JSON values rather than silently dropping significant data. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('Canonicalization accepts JSON data only');
}
export const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
export const articleDigest = (input: unknown): string => hash(PublicArticleSchema.parse(input));
export type PublicArticle = z.infer<typeof PublicArticleSchema>;
export type RecipeFacts = z.infer<typeof RecipeFactsSchema>;
export type ArticleContent = z.infer<typeof ArticleContentSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export function assertReleaseContent(a: PublicArticle): void {
  if (a.demo || a.facts.verification.status !== 'verified') throw new Error('Release requires real content with verified facts');
  if (a.media.filter(m => m.kind === 'cover').length !== 1 || a.media.filter(m => m.kind === 'clean').length !== 1) {
    throw new Error('Release requires one 16:9 cover and one separate clean dish image');
  }
}
