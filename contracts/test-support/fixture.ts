import { PublicArticleSchema } from '../v2/model.js';
/** Shared synthetic test object. Never a real recipe and never a production catalog entry. */
export function sharedArticleFixture() {
  return PublicArticleSchema.parse({
    schemaVersion: '2.0.0', articleId: 'synthetic-contract-article', slug: 'synthetic-contract-recipe', revision: 1,
    createdAt: '2026-10-18T08:00:00Z', category: 'salads', demo: false,
    facts: { schemaVersion: '2.0.0', verification: { status: 'verified', verifiedAt: '2026-10-18T08:15:00Z', evidence: 'Synthetic evidence for automated tests only.' },
      sources: [{ id: 'test-source', title: 'Synthetic test source', url: 'https://example.org/test-source', accessedAt: '2026-10-18T08:00:00Z' }],
      ingredients: [{ id: 'test-ingredient', name: 'Тестовый ингредиент', amount: '100', unit: 'г', sourceIds: ['test-source'] }],
      steps: [{ id: 'test-step', instruction: 'Синтетическая инструкция, не предназначенная для приготовления.', sourceIds: ['test-source'], safety: [],
        temperatureC: { value: 100, sourceIds: ['test-source'] }, durationMinutes: { value: 5, sourceIds: ['test-source'] },
        doneness: { value: 'Синтетический признак готовности.', sourceIds: ['test-source'] } }], safety: [],
    },
    content: { schemaVersion: '2.0.0', h1: 'Синтетический контрактный тест', seoTitle: 'Тест контракта', metaDescription: 'Только тест совместимости.',
      introduction: 'Не рецепт для приготовления.', narrative: ['Синтетический текст.'], tips: ['Синтетический совет.'], conclusion: 'Конец теста.',
      zenTitle: 'Заголовок тестового макета', tags: ['synthetic-test-only'] },
    media: ['cover', 'clean'].map(kind => ({ schemaVersion: '2.0.0', id: `test-${kind}`, kind, src: `/images/test-${kind}.png`, mimeType: 'image/png',
      width: 160, height: 90, alt: `Синтетическое изображение ${kind}`, rights: 'generated', credit: 'Synthetic fixture',
      sourceUrl: 'https://example.org/test-image', hasTextOverlay: kind === 'cover' })),
  });
}
