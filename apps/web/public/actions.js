// Actions screen (simulated): action types on objects, parameter form, dry-run preview, apply, action log.
// Synthetic data only, no API calls. Loaded before app.js: helpers (el, table, fmt) are used inside functions only.
'use strict';
(function () {
  const ACTIONS = [
    { id: 'priority', name: 'Mark client as priority', type: 'Client', desc: 'Serve this client first when stock is short.',
      ids: ['CL-1042', 'CL-1187', 'CL-2203', 'CL-3310'],
      fields: [{ key: 'reason', label: 'Reason', kind: 'text', def: 'Key account' }],
      before: (pk) => ({ priority: 'normal', note: '' }),
      after: (b, p) => ({ priority: 'high', note: p.reason }),
      rules: (p) => [['Reason is given', !!p.reason.trim()], ['Client is active', true]] },
    { id: 'qty', name: 'Adjust order quantity', type: 'Commande', desc: 'Change the quantity of an open order before it ships.',
      ids: ['SO-58211', 'SO-58230', 'SO-58247', 'SO-58302'],
      fields: [{ key: 'quantity', label: 'New quantity', kind: 'number', def: 12 }],
      before: (pk) => ({ quantity: 10 + (pk.length % 7), status: 'Pending fulfillment' }),
      after: (b, p) => ({ quantity: Number(p.quantity), status: b.status }),
      rules: (p) => [['Quantity is above 0', Number(p.quantity) > 0], ['Quantity is at most 500', Number(p.quantity) <= 500], ['Order is not shipped yet', true]] },
    { id: 'damaged', name: 'Flag return as damaged', type: 'Retour', desc: 'Mark returned goods as damaged so they are not restocked.',
      ids: ['RA-7710', 'RA-7724', 'RA-7731', 'RA-7765'],
      fields: [{ key: 'reason', label: 'Damage reason', kind: 'select', options: ['Broken packaging', 'Cold chain break', 'Past use-by date'] }],
      before: () => ({ condition: 'unchecked', restock: 'yes' }),
      after: (b, p) => ({ condition: `damaged (${p.reason})`, restock: 'no' }),
      rules: () => [['Return is received', true], ['A reason is chosen', true]] },
    { id: 'kitchen', name: 'Reassign kitchen', type: 'Commande', desc: 'Move an order to another kitchen to balance the load.',
      ids: ['SO-58211', 'SO-58230', 'SO-58247', 'SO-58302'],
      fields: [{ key: 'kitchen', label: 'New kitchen', kind: 'select', options: ['Paris Nord', 'Paris Sud', 'Lyon Centre'] }],
      before: () => ({ kitchen: 'Paris Nord' }),
      after: (b, p) => ({ kitchen: p.kitchen }),
      rules: (p) => [['Kitchen is different from the current one', p.kitchen !== 'Paris Nord'], ['Kitchen has capacity today', p.kitchen !== 'Lyon Centre']] },
    { id: 'pause', name: 'Pause article', type: 'Article', desc: 'Stop selling an article in stores until further notice.',
      ids: ['ART-301', 'ART-318', 'ART-422', 'ART-509'],
      fields: [{ key: 'until', label: 'Paused until', kind: 'date', def: '2025-12-31' }, { key: 'reason', label: 'Reason', kind: 'text', def: 'Supplier shortage' }],
      before: () => ({ status: 'on sale', pausedUntil: '' }),
      after: (b, p) => ({ status: 'paused', pausedUntil: p.until }),
      rules: (p) => [['End date is set', !!p.until], ['Reason is given', !!p.reason.trim()]] },
  ];

  // Module-level state: survives tab switches.
  const LOG = [
    { when: '2025-10-20 16:42', user: 'Ada', action: 'Adjust order quantity', object: 'Commande SO-58190', change: 'quantity 24 → 18' },
    { when: '2025-10-19 09:15', user: 'Ada', action: 'Flag return as damaged', object: 'Retour RA-7702', change: 'condition unchecked → damaged' },
    { when: '2025-10-17 11:03', user: 'Ada', action: 'Pause article', object: 'Article ART-287', change: 'status on sale → paused' },
  ];
  let selected = null;

  const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
  const diffText = (b, a) => Object.keys(a).filter((k) => fmt(b[k]) !== fmt(a[k])).map((k) => `${k} ${fmt(b[k]) || '(empty)'} → ${fmt(a[k])}`);

  function render(content) {
    content.innerHTML = '';
    const left = el('div', { class: 'ds-list' }, ACTIONS.map((a) => el('button', {
      class: 'ds' + (selected === a.id ? ' on' : ''), onclick: () => { selected = a.id; render(content); } },
    el('div', { class: 'ds-name' }, a.name),
    el('div', { class: 'ds-meta' }, el('span', { class: 'pill' }, a.type)),
    el('div', { class: 'xs muted' }, a.desc))));
    const act = ACTIONS.find((a) => a.id === selected);
    const right = act ? form(act, content) : el('div', { class: 'empty muted' }, 'Choose an action on the left to fill it in and preview its effect.');
    content.append(el('div', { class: 'stack' },
      el('div', { class: 'split' }, left, right),
      el('h3', {}, 'Action log'),
      table(['When', 'User', 'Action', 'Object', 'Change'], LOG.map((r) => [r.when, r.user, r.action, r.object, r.change]))));
  }

  function form(act, content) {
    const target = el('select', {}, act.ids.map((id) => el('option', { value: id }, id)));
    const inputs = act.fields.map((f) => {
      const i = f.kind === 'select' ? el('select', {}, f.options.map((o) => el('option', { value: o }, o)))
        : el('input', { type: f.kind, value: f.def ?? '' });
      return [f, i];
    });
    const params = () => Object.fromEntries(inputs.map(([f, i]) => [f.key, i.value]));
    const out = el('div', {});
    const preview = () => {
      out.innerHTML = '';
      const p = params(), pk = target.value, b = act.before(pk), a = act.after(b, p);
      const checks = act.rules(p), okAll = checks.every((c) => c[1]), changes = diffText(b, a);
      const apply = el('button', { class: 'btn primary', disabled: !okAll, onclick: () => {
        apply.disabled = true; apply.textContent = 'Applying…';
        setTimeout(() => {
          LOG.unshift({ when: now(), user: 'Ada', action: act.name, object: `${act.type} ${pk}`, change: changes.join('; ') });
          render(content);
        }, 500);
      } }, 'Apply');
      out.append(el('div', { class: 'card stack decision' },
        el('div', { class: 'row' }, el('b', {}, 'Preview (dry run)'), el('span', { class: 'muted xs' }, `${act.type} ${pk}`)),
        el('div', { class: 'diff' }, changes.length ? changes.map((c) => el('div', { class: 'chg' }, '~ ' + c)) : el('div', { class: 'muted' }, 'No change.')),
        el('div', { class: 'stack' }, checks.map(([label, ok]) => el('div', { class: ok ? 'ok' : 'bad' }, `${ok ? '✓' : '✕'} ${label}`))),
        el('div', { class: 'row' }, apply, okAll ? null : el('span', { class: 'bad xs' }, 'Fix the failing checks before applying.'))));
    };
    return el('div', { class: 'card stack' },
      el('h3', {}, act.name), el('div', { class: 'muted' }, act.desc),
      el('label', { class: 'stack' }, el('span', { class: 'xs muted' }, `${act.type} (target)`), target),
      inputs.map(([f, i]) => el('label', { class: 'stack' }, el('span', { class: 'xs muted' }, f.label), i)),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: preview }, 'Preview')),
      out);
  }

  window.SWAIN_VIEWS = window.SWAIN_VIEWS || {};
  window.SWAIN_VIEWS.actions = function (content, bar) {
    bar.append(el('span', { class: 'pill warn' }, 'Simulated'));
    render(content);
  };
})();
