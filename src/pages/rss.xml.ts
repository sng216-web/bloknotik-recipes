import { publishedRecipes } from '../lib/catalog.js';
import { rssXml } from '../lib/seo.js';
export function GET() {
  return new Response(rssXml(publishedRecipes()), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
