import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== '2.0.0') throw new Error('Unsupported contract artifact version');
for (const [file, expected] of Object.entries(manifest.files)) {
  if (!/^(?:v2\/[a-z-]+\.ts|test-support\/[a-z-]+\.ts|check-artifact\.mjs)$/.test(file)) throw new Error('Invalid manifest path');
  const actual = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== expected) throw new Error(`Contract drift: ${file}`);
}
console.log(`Verified public contract ${manifest.schemaVersion}: ${Object.keys(manifest.files).length} files`);
