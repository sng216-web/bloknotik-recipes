export interface SearchEntry {
  title: string; description: string; category: string; categoryTitle: string;
  href: string; image: string; searchText: string;
}

/** Validate fetch data before assigning UI state; this module has no Node imports. */
export function parseSearchIndex(input: unknown, base: string): SearchEntry[] {
  if (!Array.isArray(input)) throw new Error('Invalid search index');
  const keys = ['title', 'description', 'category', 'categoryTitle', 'href', 'image', 'searchText'];
  const entries: SearchEntry[] = [];
  const seen = new Set<string>();
  for (const value of input as unknown[]) {
    if (!value || typeof value !== 'object') throw new Error('Invalid search entry');
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== keys.length || keys.some((key) => typeof record[key] !== 'string' || !record[key])) throw new Error('Invalid search fields');
    const entry = record as unknown as SearchEntry;
    const route = entry.href.slice(base.length);
    const image = entry.image.slice(base.length);
    if (!entry.href.startsWith(base) || !/^recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(route) ||
        !entry.image.startsWith(base) || !/^images\/[a-z0-9-]+\.(?:webp|jpe?g|png|avif)$/.test(image) || seen.has(entry.href)) throw new Error('Unsafe or duplicate search URL');
    seen.add(entry.href); entries.push(entry);
  }
  return entries;
}
