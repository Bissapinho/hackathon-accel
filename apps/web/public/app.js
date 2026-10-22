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
const prettyName = (n) => { const s = String(n).replace(/_/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const PROFILE = { done: ['ok', 'Analysed'], pending: ['warn', 'Analysing…'], running: ['warn', 'Analysing…'], failed: ['bad', 'Analysis failed'] };

function dataTable(columns, rows) {
  return el('div', { class: 'tw data' }, el('table', { class: 't' },
    el('thead', {}, el('tr', {}, columns.map((c) => el('th', {}, el('div', {}, c.name), el('div', { class: 'type' }, c.type))))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v, i) => v == null || v === ''
      ? el('td', { class: 'null' }, '—')
      : el('td', { class: ['integer', 'number', 'decimal'].includes(columns[i]?.type) || typeof v === 'number' ? 'num' : null, title: fmt(v) }, fmt(v))))))));
}

async function viewData(content, bar) {
  const files = el('input', { type: 'file', multiple: true, accept: '.csv,.gz', style: 'display:none', onchange: () => upload([...files.files]) });
  bar.append(files, el('button', { class: 'btn primary', onclick: () => files.click() }, icon('download'), 'Upload files'));
  const log = el('div', { class: 'stack', style: 'gap:6px' });
  const list = el('div', { class: 'ds-list' });
  const detail = el('div', { class: 'stack' });
  const drop = el('div', { class: 'drop', onclick: () => files.click(),
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); } },
    icon('file'), el('span', {}, 'Drop CSV or CSV.gz files here'));
  content.append(el('div', { class: 'split' }, el('div', { class: 'stack' }, drop, log, list), detail));
  let current = null;
  const load = async () => {
    try {
      const ds = await api('GET', `${P()}/datasets`);
      if (!ds.length) { list.replaceChildren(); return detail.replaceChildren(el('div', { class: 'empty' }, icon('db'), el('h2', {}, 'No data yet'), el('div', { class: 'muted' }, 'Upload your exports to get started.'))); }
      list.replaceChildren(...ds.map((d) => {
        const [cls, label] = PROFILE[d.current?.profileStatus] || ['', d.current?.profileStatus || 'No version'];
        return el('button', { class: `ds${current?.id === d.id ? ' on' : ''}`, 'data-id': d.id, onclick: () => preview(d) },
          el('div', { class: 'ds-name' }, prettyName(d.name)),
          el('div', { class: 'ds-meta' }, d.current ? `${d.current.rowCount.toLocaleString()} rows · ${d.current.columnCount} columns` : '—',
            el('span', { class: `ds-st ${cls}` }, label)));
      }));
      if (!current) preview(ds[0]);
    } catch (e) { list.replaceChildren(errBox(e)); }
  };
  const preview = async (d) => {
    current = d;
    list.querySelectorAll('.ds').forEach((b) => b.classList.toggle('on', b.dataset.id === d.id));
    detail.replaceChildren(el('div', { class: 'muted' }, 'Loading…'));
    try {
      const p = await api('GET', `/api/datasets/${d.id}/preview?limit=50`);
      detail.replaceChildren(
        el('div', { class: 'ds-head' }, el('div', {}, el('h1', {}, prettyName(d.name)), el('div', { class: 'mono muted' }, d.name)),
          el('div', { class: 'stats' }, [['Rows', p.total.toLocaleString()], ['Columns', p.columns.length], ['Version', d.currentVersion ?? '—']]
            .map(([k, v]) => el('div', {}, el('b', {}, v), el('span', {}, k))))),
        el('div', { class: 'xs muted' }, `Showing the first ${p.rows.length} rows`),
        dataTable(p.columns, p.rows));
    } catch (e) { detail.replaceChildren(errBox(e)); }
  };
  const upload = async (fs) => {
    for (const f of fs) {
      const line = el('div', { class: 'xs muted' }, `Uploading ${f.name}…`);
      log.append(line);
      const fd = new FormData(); fd.append('file', f);
      try { const v = await api('POST', `${P()}/datasets`, fd); line.className = 'xs ok'; line.textContent = `✓ ${f.name} · ${v.rowCount.toLocaleString()} rows`; }
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
// ER diagram of a workspace document: one box per object type, one arrow per link type (from → to).
// Layout: columns by depth along links (types that point at others on the left, referenced types on the right).
function erDiagram(doc, onPick) {
  const types = doc.objectTypes || [], links = (doc.linkTypes || []).filter((l) => l.from && l.to);
  const by = Object.fromEntries(types.map((t) => [t.apiName, t]));
  const depth = {};
  const d = (n, seen = new Set()) => {
    if (depth[n] != null) return depth[n];
    if (seen.has(n)) return 0;
    seen.add(n);
    const outs = links.filter((l) => l.from === n && l.to !== n && by[l.to]);
    return (depth[n] = outs.length ? 1 + Math.max(...outs.map((l) => d(l.to, seen))) : 0);
  };
  types.forEach((t) => d(t.apiName));
  const maxD = Math.max(0, ...Object.values(depth));
  const W = 250, HEAD = 40, ROW = 22, PAD = 10, COLW = 380, GAP = 36, MAXP = 8;
  const fks = new Set(links.flatMap((l) => (l.keys || []).map((k) => `${l.from}.${k.fromProperty}`)));
  const nodes = types.map((t) => {
    const props = [...(t.properties || [])].sort((x, y) => (y.apiName === t.primaryKey) - (x.apiName === t.primaryKey)
      || fks.has(`${t.apiName}.${y.apiName}`) - fks.has(`${t.apiName}.${x.apiName}`));
    const shown = props.slice(0, MAXP);
    return { t, col: maxD - depth[t.apiName], shown, more: props.length - shown.length,
      h: HEAD + PAD + shown.length * ROW + (props.length > MAXP ? ROW : 0) + PAD / 2 };
  });
  const cols = [...new Set(nodes.map((n) => n.col))].sort((x, y) => x - y);
  const colH = (c) => nodes.filter((n) => n.col === c).reduce((s, n) => s + n.h + GAP, -GAP);
  const H = Math.max(...cols.map(colH));
  for (const c of cols) {
    let y = 60 + (H - colH(c)) / 2;
    nodes.filter((n) => n.col === c).forEach((n) => { n.x = 40 + cols.indexOf(c) * COLW; n.y = y; y += n.h + GAP; });
  }
  const node = Object.fromEntries(nodes.map((n) => [n.t.apiName, n]));
  const rowY = (n, prop) => { const i = n.shown.findIndex((p) => p.apiName === prop); return i < 0 ? n.y + HEAD / 2 : n.y + HEAD + PAD + i * ROW + ROW / 2 - 4; };
  let edges = '';
  links.forEach((l, i) => {
    const a = node[l.from], b = node[l.to]; if (!a || !b) return;
    const k = (l.keys || [])[0] || {};
    const y1 = rowY(a, k.fromProperty), y2 = rowY(b, k.toProperty ?? b.t.primaryKey);
    let path, lx, ly;
    if (a === b) {
      const x = a.x + W; path = `M${x},${y1} C${x + 70},${y1 - 40} ${x + 70},${y1 + 40} ${x},${y1 + 12}`; lx = x + 56; ly = y1 + 6;
    } else if (b.x > a.x) {
      const x1 = a.x + W, x2 = b.x, m = (x2 - x1) / 2;
      path = `M${x1},${y1} C${x1 + m},${y1} ${x2 - m},${y2} ${x2},${y2}`; lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
    } else {
      const x1 = a.x + W, x2 = b.x + W, out = Math.max(x1, x2) + 60 + (i % 3) * 18;
      path = `M${x1},${y1} C${out},${y1} ${out},${y2} ${x2},${y2}`; lx = out - 14; ly = (y1 + y2) / 2;
    }
    const lbl = l.label || `${l.displayName || l.apiName} · ${l.cardinality === 'one-to-one' ? '1:1' : 'N:1'}`;
    edges += `<g class="er-r"><title>${esc(`${l.from} → ${l.to}: ${l.description || ''}`)}</title><path d="${path}" marker-end="url(#erArr)"/>
      <rect x="${lx - lbl.length * 3.4 - 6}" y="${ly - 10}" width="${lbl.length * 6.8 + 12}" height="20" rx="4"/><text x="${lx}" y="${ly + 4}" text-anchor="middle">${esc(lbl)}</text></g>`;
  });
  const boxes = nodes.map((n) => {
    const { t } = n;
    const rows = n.shown.map((p, i) => {
      const y = n.y + HEAD + PAD + i * ROW + ROW / 2;
      const tag = p.apiName === t.primaryKey ? 'PK' : fks.has(`${t.apiName}.${p.apiName}`) ? 'FK' : '';
      return `<text class="er-k" x="${n.x + 12}" y="${y}">${tag}</text><text class="er-f${tag === 'PK' ? ' pk' : ''}" x="${n.x + 40}" y="${y}">${esc(p.apiName)}</text>
        <text class="er-ty" x="${n.x + W - 12}" y="${y}" text-anchor="end">${esc(p.type)}</text>`;
    }).join('');
    const more = n.more > 0 ? `<text class="er-ty" x="${n.x + 40}" y="${n.y + HEAD + PAD + n.shown.length * ROW + ROW / 2}">+ ${n.more} more</text>` : '';
    return `<g class="er-e" data-t="${esc(t.apiName)}" tabindex="0"><title>${esc(t.description || '')}</title>
      <rect class="er-box" x="${n.x}" y="${n.y}" width="${W}" height="${n.h}" rx="10"/>
      <path class="er-head" d="M${n.x},${n.y + HEAD} V${n.y + 10} a10,10 0 0 1 10,-10 H${n.x + W - 10} a10,10 0 0 1 10,10 V${n.y + HEAD} Z"/>
      <text class="er-name" x="${n.x + 14}" y="${n.y + 25}">${esc(t.displayName || t.apiName)}</text>
      <text class="er-ty" x="${n.x + W - 12}" y="${n.y + 25}" text-anchor="end">${t.status === 'experimental' ? 'draft' : ''}</text>${rows}${more}</g>`;
  }).join('');
  const width = 40 + cols.length * COLW + 40, height = H + 120;
  const wrap = el('div', { class: 'er-wrap' });
  wrap.innerHTML = `<svg class="er" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs><marker id="erArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L9,5 L0,9" fill="none" stroke="#8a8b90" stroke-width="1.6"/></marker></defs>
    ${edges}${boxes}</svg>`;
  wrap.querySelectorAll('.er-e').forEach((g) => {
    g.addEventListener('click', () => onPick(g.dataset.t));
    g.addEventListener('mouseenter', () => {
      const n = g.dataset.t;
      const near = new Set([n, ...links.filter((l) => l.from === n || l.to === n).flatMap((l) => [l.from, l.to])]);
      wrap.querySelectorAll('.er-e').forEach((x) => x.classList.toggle('off', !near.has(x.dataset.t)));
      wrap.querySelectorAll('.er-r').forEach((x, i) => x.classList.toggle('on', links[i] && (links[i].from === n || links[i].to === n)));
    });
    g.addEventListener('mouseleave', () => wrap.querySelectorAll('.off, .er-r.on').forEach((x) => x.classList.remove('off', 'on')));
  });
  return wrap;
}

// Until object types exist, draw the semantic bank: terms linked by relations become boxes, relation keys become rows.
async function semanticDoc() {
  for (const version of ['active', 'draft']) {
    let recs;
    try { recs = await api('GET', `${P()}/semantics/records?version=${version}&limit=1000`); } catch { continue; }
    const rels = recs.filter((r) => r.kind === 'relation').map((r) => r.body).filter((r) => r.source && r.target);
    if (!rels.length) continue;
    const terms = Object.fromEntries(recs.filter((r) => r.kind === 'term').map((r) => [r.body.id, r.body]));
    const types = {};
    const add = (id) => (types[id] ??= { apiName: id, displayName: prettyName(terms[id]?.name || id.replace(/^T_/, '')), description: terms[id]?.definition || '', primaryKey: '', properties: [] });
    const prop = (t, name, pk) => { if (!name) return; const n = name.toLowerCase(); if (!t.properties.some((p) => p.apiName === n)) t.properties.push({ apiName: n, type: terms[t.apiName]?.type || '' }); if (pk && !t.primaryKey) t.primaryKey = n; };
    const linkTypes = rels.map((r) => {
      const a = add(r.source), b = add(r.target), k = (r.keys || [])[0];
      if (k) { prop(a, k.fromColumn); prop(b, k.toColumn, true); }
      return { apiName: r.id, from: r.source, to: r.target, displayName: r.relation_type || r.id, label: r.relation_type || 'relation', description: r.description || '',
        keys: k ? [{ fromProperty: k.fromColumn.toLowerCase(), toProperty: k.toColumn.toLowerCase() }] : [] };
    });
    return { version, doc: { objectTypes: Object.values(types), linkTypes } };
  }
  return null;
}

async function viewObjects(content, bar) {
  let doc, published = true;
  try { doc = (await api('GET', `${P()}/workspace`)).doc; }
  catch (e) {
    if (e.status !== 404) return content.append(errBox(e));
    published = false;
    try { doc = (await api('GET', `${P()}/workspace?version=draft`)).draft?.doc; } catch { /* no draft either */ }
  }
  const types = doc?.objectTypes || [];
  if (!types.length) {
    const sem = await semanticDoc();
    if (!sem) return content.append(el('div', { class: 'empty' }, icon('cube'), el('h2', {}, 'No object types yet'), el('div', { class: 'muted' }, 'Ask the assistant to build your objects.')));
    bar.append(el('span', { class: 'ds-st warn', style: 'margin:0' }, `From the meaning (${sem.version}), no objects built yet`));
    return content.append(el('div', { class: 'stack' },
      el('div', { class: 'xs muted' }, `${sem.doc.objectTypes.length} entities · ${sem.doc.linkTypes.length} relations from the semantic bank. Hover a box to see its relations.`),
      erDiagram(sem.doc, () => {})));
  }
  if (!S.objMode) S.objMode = 'diagram';
  if (S.openObject && published) S.objMode = 'records';
  const seg = el('div', { class: 'seg' }, [['diagram', 'Diagram'], ['records', 'Records']].map(([k, label]) =>
    el('button', { class: S.objMode === k ? 'on' : null, onclick: () => { S.objMode = k; renderShell(); } }, label)));
  bar.append(published ? null : el('span', { class: 'ds-st warn', style: 'margin:0' }, 'Draft, not published'), seg);
  if (S.objMode === 'diagram') {
    return content.append(el('div', { class: 'stack' },
      el('div', { class: 'xs muted' }, `${types.length} object types · ${(doc.linkTypes || []).length} links. Hover a box to see its links, click it to open its records.`),
      erDiagram(doc, (t) => { if (!published) return; S.objMode = 'records'; S.openType = t; renderShell(); })));
  }
  if (!published) return content.append(el('div', { class: 'empty' }, icon('cube'), el('h2', {}, 'Nothing published yet'),
    el('div', { class: 'muted' }, 'Approve the publish in the Assistant to browse records. The Diagram shows the drafted structure.')));
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
  const want = open?.objectType || S.openType; S.openType = null;
  await showType(types.find((t) => t.apiName === want) || types[0]);
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
