// Static shell only. Never persist credentials/article data in localStorage or HTML.
const el = id => document.getElementById(id), api = '/api/staging/v1';
let current, actor, editKey, epoch = 0, showSequence = 0, expiryTimer;
const blobs = [], requests = new Set();
function node(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
function notify(message) { el('notice').textContent = message; }
function lock(message = 'Сеанс завершён. Для продолжения войдите через защищённый сервис доступа.') {
  epoch++; clearTimeout(expiryTimer); requests.forEach(c => c.abort()); requests.clear();
  current = undefined; actor = undefined; blobs.splice(0).forEach(URL.revokeObjectURL);
  for (const id of ['queue','images','rights','sources','history','qa-notes','blockers']) el(id).replaceChildren();
  el('editor').reset(); el('identity').textContent = ''; el('workspace').hidden = true; el('material').hidden = true;
  el('title').textContent = ''; el('review-note').value = ''; notify(message);
}
function csrf() { return document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('__Host-bloknotik_csrf='))?.split('=')[1] ?? ''; }
async function request(path, body, bytes = false) {
  const generation = epoch, controller = new AbortController(); requests.add(controller);
  try {
    const r = await fetch(api + path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: JSON.stringify(body) }) });
    if (r.status === 401) { lock(); throw Error('Сеанс завершён'); }
    if (r.status === 409) throw Error('Версия уже изменилась. Обновите материал; ваши изменения не сохранены.');
    if (!r.ok) throw Error(r.status === 429 ? 'Слишком много запросов. Повторите через минуту.' : 'Действие недоступно. Проверьте права и состояние материала.');
    const result = bytes ? await r.blob() : await r.json();
    if (generation !== epoch) throw Error('Сеанс изменился');
    return result;
  } finally { requests.delete(controller); }
}
const lines = text => text.split('\n').map(x => x.trim()).filter(Boolean);
async function show(id) {
  const sequence = ++showSequence;
  const r = await request('/articles/' + encodeURIComponent(id)); if (sequence !== showSequence) return; current = r; editKey = crypto.randomUUID();
  el('material').hidden = false; el('fields').disabled = true; el('title').textContent = r.content.content.h1;
  el('revision').textContent = 'Редакция ' + r.revision; el('blockers').textContent = 'Выпуск заблокирован: требуется актуальная независимая QA, проверка прав и личное одобрение владельца.';
  el('qa-state').textContent = r.qaState === 'stale' ? 'QA устарела после правки. Повторная проверка ещё не выполнена.' : 'C14: ' + (r.qa?.c14 ?? 'нет результата') + ' · C17: ' + (r.qa?.c17 ?? 'нет приёмки') + '. Результат исторический, материал не одобрен.';
  el('qa-notes').replaceChildren(...(r.qa?.reviewerNotes ?? []).map(text => node('li', text)));
  const canEdit = actor.role !== 'reviewer'; for (const id of ['edit','prepare','return']) el(id).disabled = !canEdit;
  el('review-note').disabled = !canEdit;
  for (const id of ['h1','seoTitle','metaDescription','introduction','conclusion']) el(id).value = r.content.content[id] ?? '';
  el('slug').value = r.content.slug; el('narrative').value = r.content.content.narrative.join('\n'); el('tips').value = r.content.content.tips.join('\n');
  el('servings').value = r.content.facts.servings?.value ?? ''; el('servings').disabled = !r.content.facts.servings;
  el('ingredients').replaceChildren(...r.content.facts.ingredients.map((ingredient, i) => {
    const row = node('div'); row.className = 'ingredient';
    for (const [key, label] of [['name','Название'],['amount','Количество'],['unit','Единица']]) {
      const field = node('label', label), input = node('input'); input.value = ingredient[key]; input.required = true; input.dataset.ingredient = i; input.dataset.key = key; field.append(input); row.append(field);
    } return row;
  }));
  el('steps').replaceChildren(...r.content.facts.steps.map((step, i) => {
    const label = node('label', 'Шаг ' + (i + 1)), input = node('textarea'); input.value = step.instruction; input.rows = 3; input.required = true; input.dataset.step = i; label.append(input); return label;
  }));
  el('sources').replaceChildren(...r.content.facts.sources.map(s => { const li = node('li'), a = node('a', s.title); if (new URL(s.url).protocol === 'https:') a.href = s.url; a.rel = 'noreferrer noopener'; a.target = '_blank'; li.append(a); return li; }));
  el('rights').replaceChildren(...r.media.filter(m => m.variant === 'master').map(m => node('p', m.kind + ': ' + m.credit + ' · основание прав ' + m.rightsDigest.slice(0, 12))));
  blobs.splice(0).forEach(URL.revokeObjectURL); el('images').replaceChildren();
  for (const m of r.media.filter(m => m.variant === 'master')) {
    const blob = await request('/articles/' + encodeURIComponent(id) + '/media/' + m.mediaId, undefined, true);
    if (sequence !== showSequence) return;
    const url = URL.createObjectURL(blob); blobs.push(url); const figure = node('figure'), img = node('img'); img.src = url; img.alt = m.alt; img.width = m.width; img.height = m.height;
    figure.append(img, node('figcaption', m.kind === 'cover' ? 'Обложка · 16:9' : 'Чистое изображение · 16:9')); el('images').append(figure);
  }
  const history = await request('/articles/' + encodeURIComponent(id) + '/history');
  if (sequence !== showSequence) return;
  el('history').replaceChildren(...history.revisions.map(v => node('p', 'Редакция ' + v.revision + ' · ' + v.issuedAt + ' · ' + v.qaState)),
    ...history.decisions.map(d => node('p', (d.action === 'prepare_qa' ? 'Подготовлена повторная проверка' : 'Возвращено на доработку') + ': ' + d.reviewerNotes.join(' '))));
}
async function start() {
  const session = await request('/session'); actor = session.actor; el('identity').textContent = actor.subjectId + ' · ' + actor.role;
  clearTimeout(expiryTimer); expiryTimer = setTimeout(() => lock(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
  const list = await request('/articles'); el('workspace').hidden = false;
  el('queue').replaceChildren(...list.map(r => { const b = node('button', r.title + ' · rev' + r.revision); b.type = 'button'; b.onclick = () => show(r.articleId).catch(e => notify(e.message)); return b; }));
  notify(list.length ? 'Материалы доступны только в этом сеансе.' : 'Очередь пока пуста.'); if (list[0]) await show(list[0].articleId);
}
el('edit').onclick = () => { el('fields').disabled = actor.role === 'reviewer'; };
el('editor').onsubmit = async event => {
  event.preventDefault(); if (!current) return; el('save').disabled = true;
  try {
    const facts = structuredClone(current.content.facts), content = structuredClone(current.content.content);
    for (const key of ['h1','seoTitle','metaDescription','introduction']) content[key] = el(key).value;
    content.narrative = lines(el('narrative').value); content.tips = lines(el('tips').value);
    if (el('conclusion').value.trim()) content.conclusion = el('conclusion').value; else delete content.conclusion;
    document.querySelectorAll('[data-ingredient]').forEach(input => { facts.ingredients[Number(input.dataset.ingredient)][input.dataset.key] = input.value; });
    document.querySelectorAll('[data-step]').forEach(input => { facts.steps[Number(input.dataset.step)].instruction = input.value; });
    if (facts.servings) facts.servings.value = Number(el('servings').value);
    // Changed facts retain source IDs for editorial reference but lose the old verification.
    if (JSON.stringify(facts) !== JSON.stringify(current.content.facts)) facts.verification = { status: 'unverified' };
    const r = await request('/articles/' + current.articleId + '/save-new-revision', { schemaVersion: 'bloknotik-staging-save/1', expectedRevision: current.revision,
      idempotencyKey: editKey, slug: el('slug').value, category: current.content.category, facts, content, mediaIds: current.media.map(m => m.mediaId) });
    await show(r.articleId); notify('Создана редакция ' + r.revision + '. Прежняя сохранена. QA устарела.');
  } catch (e) { notify(e.message); } finally { el('save').disabled = false; }
};
async function review(action) {
  if (!current) return;
  await request('/articles/' + current.articleId + '/review', { schemaVersion: 'bloknotik-staging-review/1', expectedRevision: current.revision,
    idempotencyKey: crypto.randomUUID(), action, reviewerNotes: lines(el('review-note').value) });
  notify(action === 'prepare_qa' ? 'Повторная проверка подготовлена. Реальный запуск требует отдельного допуска.' : 'Материал возвращён на доработку. Публичный выпуск заблокирован.');
}
el('prepare').onclick = () => review('prepare_qa').catch(e => notify(e.message));
el('return').onclick = () => review('return_for_changes').catch(e => notify(e.message));
el('logout').onclick = async () => { try { await request('/revoke', {}); } finally { lock(); } };
window.addEventListener('pagehide', () => lock());
window.addEventListener('pageshow', event => { if (event.persisted) start().catch(() => lock()); });
start().catch(e => lock(e.message));
