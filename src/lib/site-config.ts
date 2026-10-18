export function resolveSite(value = 'https://sng216-web.github.io/bloknotik-recipes/') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(url.pathname)) {
    throw new Error('SITE_URL must be an HTTPS origin with an optional slash-terminated base path');
  }
  return { origin: url.origin, base: url.pathname, url: url.href };
}

const site = resolveSite(process.env.SITE_URL);
export const SITE = {
  name: 'Блокнотик',
  description: 'Кулинарный блокнотик: понятные рецепты, сезонные продукты и внимание к деталям.',
  ...site,
};

export function pathFor(path = ''): string {
  return `${SITE.base}${path.replace(/^\//, '')}`;
}

export function absoluteUrl(path = ''): string {
  return new URL(pathFor(path), SITE.origin).href;
}
