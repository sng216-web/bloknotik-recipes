import { defineConfig } from 'astro/config';
import { resolveSite } from './src/lib/site-config.ts';

const site = resolveSite(process.env.SITE_URL);

export default defineConfig({
  site: site.origin,
  base: site.base,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
