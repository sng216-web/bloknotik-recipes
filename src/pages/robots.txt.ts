import { absoluteUrl } from '../lib/site-config.js';
export function GET() {
  // Demo/search pages must remain crawlable so their noindex directive is seen.
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl('sitemap.xml')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
