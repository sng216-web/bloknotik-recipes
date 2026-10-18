import { publishedRecipes } from '../lib/catalog.js';
import { sitemapXml } from '../lib/seo.js';
export function GET() {
  return new Response(sitemapXml(publishedRecipes()), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
