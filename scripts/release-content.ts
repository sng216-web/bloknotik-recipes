import { parseArgs } from 'node:util';
import { prepareRelease } from '../src/lib/publish-content.js';

const { values } = parseArgs({ options: { slug: { type: 'string' }, 'published-at': { type: 'string' } } });
if (!values.slug || !values['published-at']) throw new Error('Use --slug <permanent-slug> --published-at <confirmed-ISO-timestamp>');
const result = await prepareRelease(values.slug, values['published-at']);
console.log(JSON.stringify({ ...result, deployed: false }));
