import type { PublicArticle } from './model.js';

/** Lossless source stays in recipe.editorial; visible ingredients/instructions come only from facts. */
export function recipeProjection(a: PublicArticle) {
  const details = Object.fromEntries((['servings', 'prepMinutes', 'cookMinutes'] as const)
    .flatMap(k => a.facts[k] ? [[k, { value: a.facts[k].value, confirmed: true as const }]] : []));
  return {
    schemaVersion: '1' as const, id: a.articleId, slug: a.slug, revision: a.revision,
    title: a.content.h1, description: a.content.metaDescription, introduction: a.content.introduction,
    ingredients: a.facts.ingredients.map(i => ({ name: i.name, quantity: `${i.amount} ${i.unit}` })),
    steps: a.facts.steps.map(s => ({ text: [s.instruction,
      ...(s.temperatureC ? [`Температура: ${s.temperatureC.value} °C.`] : []),
      ...(s.durationMinutes ? [`Время: ${s.durationMinutes.value} мин.`] : []),
      ...(s.doneness ? [s.doneness.value] : []), ...s.safety.map(v => v.value),
    ].join(' ') })),
    images: a.media.map(m => ({ src: m.src, alt: m.alt, width: m.width, height: m.height,
      kind: m.kind, credit: m.credit, rights: m.rights, sourceUrl: m.sourceUrl })),
    category: a.category, demo: a.demo, tags: a.content.tags,
    sources: a.facts.sources.map(s => ({ title: s.title, url: s.url })), details,
  };
}
