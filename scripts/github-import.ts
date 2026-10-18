import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { importApprovedContent, ImportEnvelopeSchema } from '../src/lib/import-content.js';
import { ensureImportPullRequest, type ImportPullRequest } from './import-pr.js';

const eventFile = process.env['GITHUB_EVENT_PATH'];
if (!eventFile || process.env['GITHUB_REPOSITORY'] !== 'sng216-web/bloknotik-recipes') throw new Error('This command is for the site repository Actions job only');
if (fs.statSync(eventFile).size > 512 * 1024) throw new Error('Event exceeds import size limit');
const event = JSON.parse(fs.readFileSync(eventFile, 'utf8')) as { inputs?: { payload?: string }; client_payload?: unknown };
const envelope = ImportEnvelopeSchema.parse(event.inputs?.payload ? JSON.parse(event.inputs.payload) : event.client_payload);
const result = await importApprovedContent(envelope);
const branch = `content/import-${envelope.importId}`;
const marker = `content/imports/${envelope.importId}.json`;
const staged = `content/incoming/${result.slug}.json`;
const run = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
if (remote) {
  run('git', ['fetch', 'origin', branch]);
  const prior = JSON.parse(run('git', ['show', `FETCH_HEAD:${marker}`])) as { digest: string };
  const current = JSON.parse(fs.readFileSync(marker, 'utf8')) as { digest: string };
  if (prior.digest !== current.digest) throw new Error('An existing import branch has a conflicting payload');
} else {
  run('git', ['switch', '-c', branch]);
  run('git', ['add', '--', marker, staged]);
  run('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `content: stage approved recipe ${result.slug}`]);
  run('git', ['push', '--set-upstream', 'origin', branch]);
}
const pullRequest = await ensureImportPullRequest(
  async () => JSON.parse(run('gh', ['pr', 'list', '--repo', 'sng216-web/bloknotik-recipes', '--base', 'main', '--head', branch,
    '--state', 'all', '--json', 'url,state,mergedAt'])) as ImportPullRequest[],
  async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloknotik-pr-'));
  const body = path.join(directory, 'body.md');
  try {
    fs.writeFileSync(body, `Утверждённый материал сохранён в staging.\n\nImport ID: ${envelope.importId}\nSlug: ${result.slug}\nRevision: ${envelope.recipe.revision}\n\nПубликация не выполнялась. Проверьте источники, QA и права на изображения. Материал не входит в публичные индексы. Для выпуска используйте отдельный редакционный шаг content:publish с подтверждённой датой.\n\nПеред созданием PR import job выполняет полную проверку и браузерные тесты. PR, созданный GITHUB_TOKEN, сам не запускает новые workflows; при необходимости запустите CI вручную на этой ветке.\n`);
    return run('gh', ['pr', 'create', '--repo', 'sng216-web/bloknotik-recipes', '--base', 'main', '--head', branch,
      '--title', `Контент на проверку: ${result.slug}`, '--body-file', body]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  },
);
console.log(JSON.stringify(pullRequest));
