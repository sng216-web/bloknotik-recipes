import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { normalizeEditorialImport } from '../src/lib/editorial-contract.js';
import { importApprovedContent } from '../src/lib/import-content.js';

const { values } = parseArgs({ options: { file: { type: 'string' }, 'github-event': { type: 'string' } } });
if (Boolean(values.file) === Boolean(values['github-event'])) throw new Error('Use exactly one of --file or --github-event');
const file = values.file ?? values['github-event']!;
if (fs.statSync(file).size > 512 * 1024) throw new Error('Import input exceeds 512 KiB');
const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
let payload: unknown = data;
if (values['github-event']) {
  const event = data as { inputs?: { payload?: string }; client_payload?: unknown };
  payload = event.inputs?.payload ? JSON.parse(event.inputs.payload) : event.client_payload;
}
console.log(JSON.stringify(await importApprovedContent(normalizeEditorialImport(payload))));
