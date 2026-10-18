import { z } from 'zod';
import { contentDigest } from './content-digest.js';

export const XML_UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|\p{Surrogate}/u;
const text = z.string().trim().min(1).refine((value) => !XML_UNSAFE.test(value), 'Text contains characters forbidden by XML 1.0');
const timestamp = z.iso.datetime({ offset: true });
const httpsUrl = z.url({ protocol: /^https$/ }).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch { return false; }
}, 'URLs must not contain credentials');

export const CATEGORIES = {
  breakfast: { title: 'Завтраки', description: 'Для неспешного утра и хорошего начала дня.', symbol: '☀︎' },
  soups: { title: 'Супы', description: 'Тёплые, лёгкие и наваристые. Ложка за ложкой.', symbol: '◡' },
  mains: { title: 'Основные блюда', description: 'То, ради чего вся семья собирается за столом.', symbol: '♧' },
  salads: { title: 'Салаты', description: 'Свежие сочетания и щедрая горсть зелени.', symbol: '❋' },
  baking: { title: 'Выпечка', description: 'Румяная корочка и аромат домашней кухни.', symbol: '⌁' },
  desserts: { title: 'Десерты', description: 'Небольшие радости к чаю и особому случаю.', symbol: '♡' },
} as const;

export const CategorySchema = z.enum(['breakfast', 'soups', 'mains', 'salads', 'baking', 'desserts']);
const confirmedInteger = z.strictObject({ value: z.number().int().nonnegative(), confirmed: z.literal(true) });

export const RecipeImageSchema = z.strictObject({
  src: z.string().regex(/^\/images\/[a-z0-9-]+\.(?:webp|jpe?g|png|avif)$/),
  alt: text,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  kind: z.enum(['cover', 'step']),
  credit: text,
  rights: z.enum(['owned', 'licensed', 'generated']),
  sourceUrl: httpsUrl.optional(),
}).refine((image) => image.width > image.height, 'Images must be landscape');

export const ApprovalSchema = z.strictObject({
  reviewId: text,
  revision: z.number().int().positive(),
  reviewer: text,
  approvedAt: timestamp,
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.strictObject({
    completeness: z.literal(true), cookingLogic: z.literal(true), foodSafety: z.literal(true),
    originality: z.literal(true), facts: z.literal(true), mediaRights: z.literal(true),
  }),
});

/** Single source of truth for source files, imports, pages and syndication. */
export const RecipeSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  id: text.max(200),
  revision: z.number().int().positive(),
  slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: text.max(160),
  description: text.max(400),
  introduction: text,
  ingredients: z.array(z.strictObject({ name: text, quantity: text })).min(1),
  steps: z.array(z.strictObject({ text, tip: text.optional() })).min(1),
  images: z.array(RecipeImageSchema).min(1),
  dates: z.strictObject({ created: timestamp, updated: timestamp, published: timestamp.nullable() }),
  category: CategorySchema,
  status: z.enum(['draft', 'approved', 'published', 'archived']),
  demo: z.boolean(),
  tags: z.array(text.max(60)).max(12),
  sources: z.array(z.strictObject({ title: text, url: httpsUrl })),
  approval: ApprovalSchema.nullable(),
  details: z.strictObject({
    servings: confirmedInteger.refine((entry) => entry.value > 0).optional(),
    prepMinutes: confirmedInteger.optional(),
    cookMinutes: confirmedInteger.optional(),
    caloriesKcal: confirmedInteger.optional(),
  }),
}).superRefine((recipe, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (recipe.images.filter((image) => image.kind === 'cover').length !== 1) issue('Exactly one cover is required');
  if (new Set(recipe.images.map((image) => image.src)).size !== recipe.images.length) issue('Duplicate images');
  if (Date.parse(recipe.dates.updated) < Date.parse(recipe.dates.created)) issue('Updated date precedes creation');
  if (recipe.demo && recipe.status !== 'draft') issue('Demo fixtures must remain drafts');
  if (!recipe.demo && (recipe.id.startsWith('demo-') || recipe.tags.some((tag) => /^(?:demo|демонстрация)$/iu.test(tag)))) {
    issue('Reserved demo identifiers/tags cannot be turned into real content');
  }
  if (recipe.status === 'approved' || recipe.status === 'published') {
    if (!recipe.approval || recipe.approval.revision !== recipe.revision) issue('Approval must match this revision');
    if (recipe.approval && recipe.approval.contentDigest !== contentDigest(recipe)) issue('Approval content digest does not match the reviewed material');
    if (!recipe.sources.length) issue('Approved content requires sources');
    if (recipe.approval && (Date.parse(recipe.approval.approvedAt) > Date.parse(recipe.dates.updated) ||
        Date.parse(recipe.approval.approvedAt) < Date.parse(recipe.dates.created))) issue('Invalid approval chronology');
  }
  if (recipe.status === 'published' && !recipe.dates.published) issue('Published recipes need a confirmed publication date');
  if (!['published', 'archived'].includes(recipe.status) && recipe.dates.published !== null) issue('Unpublished content cannot have a publication date');
  if (recipe.dates.published && (Date.parse(recipe.dates.published) < Date.parse(recipe.dates.created) ||
      Date.parse(recipe.dates.published) > Date.parse(recipe.dates.updated))) issue('Invalid publication chronology');
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Category = z.infer<typeof CategorySchema>;

export function isPublished(input: unknown, now = new Date()): input is Recipe {
  const parsed = RecipeSchema.safeParse(input);
  if (!parsed.success || !Number.isFinite(now.getTime())) return false;
  const recipe = parsed.data;
  return recipe.status === 'published' && !recipe.demo && recipe.approval !== null &&
    recipe.approval.revision === recipe.revision && recipe.dates.published !== null &&
    Date.parse(recipe.dates.published) <= now.getTime() && Date.parse(recipe.dates.updated) <= now.getTime();
}
