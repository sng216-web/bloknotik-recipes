import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/** Bind review to immutable editorial content, not workflow/publication timestamps. */
export function contentDigest(input: Record<string, unknown>): string {
  const { approval: _approval, status: _status, dates, ...content } = input;
  const created = dates && typeof dates === 'object' ? (dates as { created?: string }).created : undefined;
  return createHash('sha256').update(JSON.stringify(canonical({ ...content, created }))).digest('hex');
}
