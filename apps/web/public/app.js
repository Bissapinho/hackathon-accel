// Mini-Foundry web client: login, project, agent chat (SSE, approvals, questions, chat blocks), data upload and
// preview, semantic bank, objects. Plain JS, no build. Talks only to /api (proxied by serve.mjs).
'use strict';

const S = {
  me: null, pid: localStorage.getItem('pid'), view: localStorage.getItem('view') || 'agent',
  session: null, items: [], stream: '', thinking: '', status: null, mode: null, progress: null, tokens: null, es: null,
};

// ── helpers ──
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
  return n;
}
const icon = (id) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'icon'); s.innerHTML = `<use href="#i-${id}"/>`; return s; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? v.toLocaleString() : String(v);
const errBox = (e) => el('div', { class: 'err' }, e.message || String(e), e.hint ? el('div', { class: 'xs' }, e.hint) : null);

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) { const e = new Error(data?.message || `HTTP ${r.status}`); Object.assign(e, data, { status: r.status }); throw e; }
  return data;
}
const P = () => `/api/projects/${S.pid}`;

// Tiny markdown: paragraphs, bullet lists, **bold**, `code`.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  let out = '', list = false;
  for (const line of String(text || '').split('\n')) {
    const li = line.match(/^\s*[-*•]\s+(.*)/) || line.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const h = line.match(/^#+\s+(.*)/);
    if (h) out += `<p><b>${inline(h[1])}</b></p>`;
    else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  return out + (list ? '</ul>' : '');
}

function table(columns, rows, onRow) {
  return el('div', { class: 'tw' }, el('table', { class: 't' },
    el('thead', {}, el('tr', {}, columns.map((c) => el('th', {}, c)))),
    el('tbody', {}, rows.map((r, i) => el('tr', { class: onRow ? 'click' : null, onclick: onRow ? () => onRow(i) : null },
      r.map((v) => el('td', { class: typeof v === 'number' ? 'num' : null, title: fmt(v) }, fmt(v))))))));
}

// ── boot / shell ──
async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch (e) { if (e.status === 401) return renderLogin(); return mount(errBox(e)); }
  if (!S.me.projects.some((p) => p.id === S.pid)) S.pid = S.me.projects[0]?.id || null;
  if (S.pid) localStorage.setItem('pid', S.pid);
  renderShell();
}
const mount = (...n) => { const r = document.getElementById('root'); r.replaceChildren(...n); };

async function renderLogin() {
  const box = el('div', { class: 'login card stack' }, el('div', { class: 'row' }, el('div', { class: 'logo' }), el('h1', {}, 'Swain')),
    el('div', { class: 'muted' }, 'Choose who you are.'));
  mount(box);
  try {
    const users = await api('GET', '/api/users');
    for (const u of users) box.append(el('button', { class: 'btn user', onclick: async () => { await api('POST', '/api/login', { email: u.email }); boot(); } },
      icon('user'), el('span', {}, el('b', {}, u.name || u.email), ' ', el('span', { class: 'muted xs' }, u.email))));
  } catch (e) { box.append(errBox(e)); }
}

const VIEWS = [['agent', 'Assistant', 'chat'], ['data', 'Data', 'db'], ['meaning', 'Meaning', 'layers'], ['objects', 'Objects', 'cube'], ['history', 'History', 'history']];

function renderShell() {
  const project = S.me.projects.find((p) => p.id === S.pid);
  const content = el('main', { class: 'content', id: 'view' });
  const bar = el('header', { class: 'appbar', id: 'appbar' });
  mount(el('div', { class: 'app' },
    el('aside', { class: 'gnav' },
      el('div', { class: 'gnav-top' }, el('div', { class: 'logo' }), el('b', {}, 'Swain')),
      el('nav', {}, VIEWS.map(([k, label, ic]) => el('button', { class: `nav-item${S.view === k ? ' active' : ''}`, onclick: () => { S.view = k; localStorage.setItem('view', k); renderShell(); } }, icon(ic), label))),
      el('div', { class: 'gnav-foot' },
        el('select', { onchange: (e) => { S.pid = e.target.value; localStorage.setItem('pid', S.pid); closeStream(); S.session = null; renderShell(); } },
          S.me.projects.map((p) => el('option', { value: p.id, selected: p.id === S.pid }, p.name))),
        el('div', { class: 'row xs muted' }, icon('user'), S.me.user.name || S.me.user.email,
          el('button', { class: 'link xs', onclick: async () => { await api('POST', '/api/logout'); closeStream(); boot(); } }, 'Sign out')))),
    el('div', { class: 'main' }, bar, content)));
  bar.append(el('h2', {}, VIEWS.find((v) => v[0] === S.view)[1]), el('span', { class: 'muted' }, project ? `· ${project.name}` : ''), el('span', { class: 'spacer' }));
  if (!S.pid) return content.append(el('div', { class: 'muted' }, 'You have no project yet. Run pnpm db:seed.'));
  if (S.view !== 'agent') closeStream();
  ({ agent: viewAgent, data: viewData, meaning: viewMeaning, objects: viewObjects, history: viewHistory })[S.view](content, bar);
}

// ── agent ──
function closeStream() { if (S.es) { S.es.close(); S.es = null; } }
const sidKey = () => `sid:${S.pid}`;

async function viewAgent(content, bar) {
  bar.append(el('span', { class: 'pill', id: 'status' }), el('button', { class: 'btn', onclick: () => newSession() }, icon('reset'), 'New conversation'));
  content.style.paddingBottom = '16px';
  const items = el('div', { class: 'items', id: 'items' });
  const input = el('textarea', { rows: 2, placeholder: 'Ask the assistant… (Enter to send, Shift+Enter for a new line)',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const send = async () => {
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    try { await api('POST', `/api/agent/sessions/${S.session.id}/messages`, { text }); } catch (e) { input.value = text; items.append(errBox(e)); }
  };
  content.append(el('div', { class: 'chat' }, items, el('div', { class: 'composer' },
    el('div', { class: 'row' }, input, el('button', { class: 'btn primary', onclick: send }, icon('send'), 'Send'),
      el('button', { class: 'btn', title: 'Stop the assistant', onclick: () => S.session && api('POST', `/api/agent/sessions/${S.session.id}/stop`).catch(() => {}) }, icon('x'))),
    el('div', { class: 'xs muted', id: 'meta' }))));
  const sid = localStorage.getItem(sidKey());
  try {
    if (sid) { const r = await api('GET', `/api/agent/sessions/${sid}`); S.session = r.session; S.items = r.items; }
    else await newSession(true);
  } catch { await newSession(true); }
  if (S.session) { S.status = S.session.status; S.mode = S.session.mode; openStream(); renderItems(); }
}

async function newSession(quiet) {
  try {
    S.session = await api('POST', `${P()}/agent/sessions`, {});
    localStorage.setItem(sidKey(), S.session.id);
    S.items = []; S.stream = ''; S.thinking = ''; S.status = S.session.status; S.mode = S.session.mode;
    if (!quiet) { closeStream(); openStream(); renderItems(); }
  } catch (e) { document.getElementById('items')?.append(errBox(e)); }
}

function openStream() {
  closeStream();
  const last = S.items.at(-1)?.seq ?? 0;
  const es = new EventSource(`/api/agent/sessions/${S.session.id}/events?after=${last}`);
  S.es = es;
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'item') {
      if (S.items.some((i) => i.seq === e.item.seq)) return;
      S.items.push(e.item);
      if (e.item.kind === 'assistant_message') S.stream = '';
      S.thinking = '';
    } else if (e.type === 'delta') S.stream += e.text;
    else if (e.type === 'thinking') S.thinking = e.summary;
    else if (e.type === 'status') { S.status = e.status; S.mode = e.mode; if (e.status !== 'running') { S.stream = ''; S.thinking = ''; S.progress = null; } }
    else if (e.type === 'progress') S.progress = e;
    else if (e.type === 'tokens') S.tokens = e;
    renderItems();
  };
}

function renderItems() {
  const box = document.getElementById('items'); if (!box) return;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const decided = new Set(S.items.filter((i) => i.kind === 'approval_decision').map((i) => i.approvalId));
  const answered = new Set(S.items.filter((i) => i.kind === 'answer').map((i) => i.questionId));
  const resultsByCall = new Map();
  for (const i of S.items) if (i.kind === 'tool_results') for (const r of i.results) resultsByCall.set(r.callSeq, r);
  const nodes = [];
  if (!S.items.length) nodes.push(el('div', { class: 'card muted' }, 'Start by saying what you want to understand about your data, for example: “I uploaded our 2025 exports. Help me make sense of orders and customers.”'));
  for (const it of S.items) {
    if (it.kind === 'user_message') nodes.push(el('div', { class: 'msg-user' }, it.text));
    else if (it.kind === 'assistant_message') nodes.push(el('div', { class: 'msg-ai' }, el('div', { html: md(it.text) }), (it.blocks || []).map(renderBlock)));
    else if (it.kind === 'tool_call') {
      const r = resultsByCall.get(it.seq);
      nodes.push(el('div', {}, el('div', { class: 'tool' }, r ? (r.ok ? el('span', { class: 'ok' }, '✓') : el('span', { class: 'bad' }, '✕')) : el('span', { class: 'dot running' }),
        el('b', {}, it.title || it.tool), it.why ? el('span', {}, '— ', it.why) : null),
        r ? el('details', { class: 'res' }, el('summary', {}, r.summary), el('pre', {}, JSON.stringify({ args: it.args, details: r.details }, null, 2))) : null));
    } else if (it.kind === 'approval_request') nodes.push(renderApproval(it, decided.has(it.approvalId)));
    else if (it.kind === 'approval_decision') nodes.push(el('div', { class: 'tool' }, el('span', { class: it.decision === 'allowed' ? 'ok' : 'bad' }, it.decision === 'allowed' ? '✓ Approved' : '✕ Rejected'), it.note || ''));
    else if (it.kind === 'question') nodes.push(renderQuestion(it, answered.has(it.questionId)));
    else if (it.kind === 'answer') nodes.push(el('div', { class: 'msg-user' }, Object.values(it.answers).map((v) => [].concat(v).join(', ')).join('\n')));
    else if (it.kind === 'mode_change') nodes.push(el('div', { class: 'tool' }, icon('arrow'), `Mode: ${it.from} → ${it.to}`));
    else if (it.kind === 'note') nodes.push(el('div', { class: 'tool' }, icon('info'), it.text));
  }
  if (S.stream) nodes.push(el('div', { class: 'msg-ai', html: md(S.stream) }));
  if (S.status === 'running') nodes.push(el('div', { class: 'thinking' }, S.thinking || 'Working…',
    S.progress ? ` (${S.progress.operation}: ${S.progress.step} ${S.progress.done}${S.progress.total ? '/' + S.progress.total : ''})` : ''));
  box.replaceChildren(...nodes);
  if (stick) box.scrollTop = box.scrollHeight;
  const st = document.getElementById('status');
  if (st) st.replaceChildren(el('span', { class: `dot ${S.status}` }), `${S.status || ''} · ${S.mode || ''}`);
  const meta = document.getElementById('meta');
  if (meta && S.tokens) meta.textContent = `Context: ${S.tokens.used.toLocaleString()} / ${S.tokens.budget.toLocaleString()} tokens`;
}

function renderApproval(it, done) {
  const note = el('input', { type: 'text', placeholder: 'Note (optional)' });
  const decide = (decision) => api('POST', `/api/agent/sessions/${S.session.id}/approvals/${it.approvalId}`, { decision, note: note.value || undefined })
    .catch((e) => card.append(errBox(e)));
  const d = it.diff;
  const card = el('div', { class: 'card decision stack' },
    el('div', { class: 'row' }, icon('check-circle'), el('b', {}, 'Approval needed'), el('span', { class: 'muted xs' }, it.tool)),
    el('div', { html: md(it.summary) }),
    d ? el('div', { class: 'diff' },
      d.added.map((x) => el('div', { class: 'add' }, `+ ${x.kind} ${x.apiName} — ${x.summary}`)),
      d.changed.map((x) => el('div', { class: 'chg' }, `~ ${x.kind} ${x.apiName} — ${x.summary}`)),
      d.removed.map((x) => el('div', { class: 'rm' }, `− ${x.kind} ${x.apiName} — ${x.summary}`))) : null,
    el('details', { class: 'res' }, el('summary', {}, 'Details'), el('pre', {}, JSON.stringify(it.args, null, 2))),
    done ? null : el('div', { class: 'row' }, note, el('button', { class: 'btn primary', onclick: () => decide('allow') }, icon('check'), 'Approve'),
      el('button', { class: 'btn danger', onclick: () => decide('reject') }, icon('x'), 'Reject')));
  return card;
}

function renderQuestion(it, done) {
  const getters = {};
  const card = el('div', { class: 'card decision stack' }, el('div', { class: 'row' }, icon('question'), el('b', {}, 'The assistant asks')));
  for (const q of it.questions) {
    const name = `${it.questionId}:${q.id}`;
    const opts = (q.choices || []).map((c) => el('label', { class: 'row' }, el('input', { type: q.multiple ? 'checkbox' : 'radio', name, value: c, disabled: done }), c));
    const free = q.allowFreeText || !q.choices?.length ? el('input', { type: 'text', placeholder: 'Your answer', disabled: done }) : null;
    getters[q.id] = () => {
      const picked = [...card.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map((x) => x.value);
      if (free?.value.trim()) picked.push(free.value.trim());
      return q.multiple ? picked : (picked[0] ?? '');
    };
    card.append(el('div', { class: 'stack', style: 'gap:6px' }, el('div', { html: md(q.text) }), opts, free));
  }
  if (!done) card.append(el('div', {}, el('button', { class: 'btn primary', onclick: () => {
    const answers = Object.fromEntries(Object.entries(getters).map(([k, g]) => [k, g()]));
    api('POST', `/api/agent/sessions/${S.session.id}/answers/${it.questionId}`, { answers }).catch((e) => card.append(errBox(e)));
  } }, icon('send'), 'Answer')));
  return card;
}

function renderBlock(b) {
  const wrap = (...k) => el('div', { class: 'block' }, ...k);
  switch (b.kind) {
    case 'plan': return wrap(el('ul', { class: 'plan' }, b.steps.map((s) => el('li', { class: s.status === 'done' ? 'ok' : s.status === 'doing' ? '' : 'muted' },
      ({ done: '✓ ', doing: '▸ ', todo: '○ ', skipped: '– ' })[s.status] || '', s.text, el('span', { class: 'xs muted' }, ` · ${s.stage}`)))));
    case 'proposal': return wrap(table(['Item', 'What it does', 'Rows'], b.rows.map((r) => [r.item, r.whatItDoes, r.rows ?? ''])),
      b.caveats?.length ? el('ul', { class: 'xs warn' }, b.caveats.map((c) => el('li', {}, c))) : null);
    case 'verification': return wrap(b.checks.map((c) => el('div', {}, el('span', { class: c.ok ? 'ok' : 'bad' }, c.ok ? '✓ ' : '✕ '), el('b', {}, c.label), ' ', el('span', { class: 'muted' }, c.detail))));
    case 'definition': return wrap(el('div', { class: 'card' }, el('b', {}, b.name), ' ', el('span', { class: 'mono muted' }, b.termId), el('div', {}, b.definition),
      b.evidence?.map((e) => el('div', { class: 'xs muted' }, `${e.what}: ${e.result}`))));
    case 'decision': return wrap(el('div', { class: 'card' }, el('div', { class: 'muted xs' }, b.question), el('b', {}, b.choice)));
    case 'table': return wrap(table(b.columns, b.rows));
    case 'barChart': {
      const max = Math.max(1, ...b.data.map((d) => Number(d[b.y]) || 0));
      return wrap(b.data.map((d) => el('div', { class: 'bar' }, el('span', {}, fmt(d[b.x])), el('i', { style: `width:${(100 * (Number(d[b.y]) || 0)) / max}%` }), el('span', { class: 'xs' }, fmt(d[b.y])))));
    }
    case 'objectLink': return wrap(el('button', { class: 'link', onclick: () => { S.view = 'objects'; S.openObject = b.ref; renderShell(); } }, icon('cube'), ' ', b.label));
    case 'appLink': return wrap(el('span', { class: 'muted' }, b.label));
    default: return wrap(el('pre', { class: 'xs' }, JSON.stringify(b, null, 2)));
  }
}

// ── data ──
async function viewData(content, bar) {
  const files = el('input', { type: 'file', multiple: true, accept: '.csv,.gz', style: 'display:none', onchange: () => upload([...files.files]) });
  bar.append(files, el('button', { class: 'btn primary', onclick: () => files.click() }, icon('download'), 'Upload CSV'));
  const log = el('div', { class: 'stack' });
  const list = el('div');
  const detail = el('div');
  content.append(el('div', { class: 'stack' }, log, list, detail));
  const load = async () => {
    try {
      const ds = await api('GET', `${P()}/datasets`);
      if (!ds.length) return list.replaceChildren(el('div', { class: 'card muted' }, 'No data yet. Upload your CSV or CSV.gz exports.'));
      list.replaceChildren(table(['Name', 'Rows', 'Columns', 'Version', 'Profile'],
        ds.map((d) => [d.name, d.current?.rowCount ?? '', d.current?.columnCount ?? '', d.current?.version ?? '', d.current?.profileStatus ?? '']),
        (i) => preview(ds[i])));
    } catch (e) { list.replaceChildren(errBox(e)); }
  };
  const preview = async (d) => {
    detail.replaceChildren(el('div', { class: 'muted' }, 'Loading…'));
    try {
      const p = await api('GET', `/api/datasets/${d.id}/preview?limit=50`);
      detail.replaceChildren(el('div', { class: 'stack' }, el('h2', {}, d.name, ' ', el('span', { class: 'muted xs' }, `first ${p.rows.length} of ${p.total.toLocaleString()} rows`)),
        table(p.columns.map((c) => `${c.name} · ${c.type}`), p.rows)));
    } catch (e) { detail.replaceChildren(errBox(e)); }
  };
  const upload = async (fs) => {
    for (const f of fs) {
      const line = el('div', { class: 'muted' }, `Uploading ${f.name}…`);
      log.append(line);
      const fd = new FormData(); fd.append('file', f);
      try { const v = await api('POST', `${P()}/datasets`, fd); line.className = 'ok'; line.textContent = `✓ ${f.name}: ${v.rowCount.toLocaleString()} rows (version ${v.version})${v.parseErrors?.length ? `, ${v.parseErrors.length} values not read` : ''}`; }
      catch (e) { line.replaceWith(errBox(e)); }
      await load();
    }
    files.value = '';
  };
  load();
}

// ── meaning (semantic bank) ──
async function viewMeaning(content, bar) {
  let version = 'active';
  const pick = el('select', { onchange: () => { version = pick.value; load(); } }, el('option', { value: 'active' }, 'Published'), el('option', { value: 'draft' }, 'Draft'));
  const q = el('input', { type: 'text', placeholder: 'Search', style: 'width:220px', onkeydown: (e) => e.key === 'Enter' && load() });
  bar.append(q, pick);
  const out = el('div', { class: 'stack' });
  content.append(out);
  const load = async () => {
    out.replaceChildren(el('div', { class: 'muted' }, 'Loading…'));
    try {
      const [ov, recs] = await Promise.all([api('GET', `${P()}/semantics?version=${version}`),
        api('GET', `${P()}/semantics/records?version=${version}&limit=500${q.value ? `&q=${encodeURIComponent(q.value)}` : ''}`)]);
      const list = Array.isArray(recs) ? recs : recs.records || recs.items || [];
      out.replaceChildren(
        el('div', { class: 'card' }, el('div', { class: 'row' }, el('b', {}, `Version ${ov.version ?? '—'}`), el('span', { class: 'muted' }, ov.status || ''),
          ...Object.entries(ov.counts || {}).map(([k, v]) => el('span', { class: 'pill' }, `${k}: ${v}`))),
          ov.summary ? el('div', { class: 'muted', html: md(ov.summary) }) : null),
        list.length ? table(['Id', 'Kind', 'Name', 'Meaning'], list.map((r) => {
          const b = r.record || r.body || r;
          return [r.id || b.id, r.kind || b.kind || '', b.name || b.label || b.term || '', b.definition || b.description || b.statement || b.text || ''];
        }), (i) => out.append(el('details', { class: 'res', open: true }, el('summary', {}, list[i].id), el('pre', {}, JSON.stringify(list[i], null, 2)))))
          : el('div', { class: 'muted' }, 'Nothing here yet. Ask the assistant to build the meaning of your data.'));
    } catch (e) { out.replaceChildren(errBox(e), el('div', { class: 'muted' }, version === 'active' ? 'Try the Draft view.' : '')); }
  };
  load();
}

// ── objects ──
async function viewObjects(content) {
  let doc;
  try { doc = (await api('GET', `${P()}/workspace`)).doc; }
  catch (e) { return content.append(errBox(e), el('div', { class: 'muted' }, 'Objects appear once the assistant publishes a workspace.')); }
  const types = doc.objectTypes || [];
  if (!types.length) return content.append(el('div', { class: 'muted' }, 'No object types published yet.'));
  const nav = el('div', { class: 'list' });
  const main = el('div', { class: 'stack' });
  content.append(el('div', { class: 'split' }, nav, main));
  const showType = async (t) => {
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t.apiName));
    main.replaceChildren(el('h2', {}, t.pluralDisplayName || t.apiName), el('div', { class: 'muted' }, t.description), el('div', { class: 'muted' }, 'Loading…'));
    try {
      const r = await api('POST', `${P()}/objects/query`, { set: { kind: 'all', objectType: t.apiName }, pageSize: 100 });
      const props = [...new Set(r.rows.flatMap((x) => Object.keys(x.properties)))].slice(0, 12);
      main.lastChild.replaceWith(el('div', { class: 'xs muted' }, `${r.total.toLocaleString()} objects`),
        table(['', ...props], r.rows.map((x) => [x.title, ...props.map((p) => x.properties[p])]), (i) => showObject(r.rows[i].ref)));
    } catch (e) { main.lastChild.replaceWith(errBox(e)); }
  };
  const showObject = async (ref) => {
    const box = el('div', { class: 'card stack' }, el('div', { class: 'muted' }, 'Loading…'));
    main.prepend(box);
    try {
      const o = await api('GET', `${P()}/objects/${encodeURIComponent(ref.objectType)}/${encodeURIComponent(ref.primaryKey)}`);
      const props = o.properties || o.object?.properties || {};
      box.replaceChildren(el('div', { class: 'row' }, el('h2', {}, o.title || o.object?.title || ref.primaryKey), el('span', { class: 'muted mono' }, ref.objectType),
        el('span', { class: 'spacer', style: 'flex:1' }), el('button', { class: 'link', onclick: () => box.remove() }, 'Close')),
        el('dl', { class: 'kv' }, Object.entries(props).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, fmt(v))])),
        el('details', { class: 'res' }, el('summary', {}, 'Links and rules'), el('pre', {}, JSON.stringify({ rules: o.rules, links: o.links }, null, 2))));
    } catch (e) { box.replaceChildren(errBox(e)); }
  };
  for (const t of types) nav.append(el('button', { 'data-t': t.apiName, onclick: () => showType(t) }, t.pluralDisplayName || t.apiName));
  const open = S.openObject; S.openObject = null;
  await showType(types.find((t) => t.apiName === open?.objectType) || types[0]);
  if (open) showObject(open);
}

// ── history: workspace publishes + action log ──
async function viewHistory(content) {
  const out = el('div', { class: 'stack' });
  content.append(out);
  const [h, a] = await Promise.allSettled([api('GET', `${P()}/workspace/history`), api('GET', `${P()}/actions/log`)]);
  const rows = (v) => Array.isArray(v) ? v : v?.items || v?.versions || v?.entries || [];
  const tbl = (r) => { const list = rows(r.value); if (!list.length) return el('div', { class: 'muted' }, 'Nothing yet.'); const cols = Object.keys(list[0]).slice(0, 8); return table(cols, list.map((x) => cols.map((c) => x[c]))); };
  out.append(el('h2', {}, 'Published versions'), h.status === 'fulfilled' ? tbl(h) : errBox(h.reason),
    el('h2', {}, 'Actions run'), a.status === 'fulfilled' ? tbl(a) : errBox(a.reason));
}

boot();
