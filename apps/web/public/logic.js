// Logic screen (simulated): relations between business entities and derived properties / rules.
// Hard-coded synthetic data, no API calls. Helpers (el, icon, table, md) come from app.js, used only at render time.
'use strict';
window.SWAIN_VIEWS = window.SWAIN_VIEWS || {};

(function () {
  const RELATIONS = [
    { from: 'Commande', to: 'Client', card: 'N:1', verb: 'passée par', desc: 'Each order is placed by exactly one client.', rate: 99.9 },
    { from: 'Commande', to: 'Article', card: 'N:N', verb: 'contient', desc: 'An order contains one or more articles, through its order lines.', rate: 99.4 },
    { from: 'Retour', to: 'Commande', card: 'N:1', verb: 'concerne', desc: 'Each return refers back to the order it came from.', rate: 96.2 },
    { from: 'Cuisine', to: 'Article', card: '1:N', verb: 'produit', desc: 'Each kitchen produces a set of articles every day.', rate: 98.7 },
    { from: 'Magasin', to: 'Client', card: 'is a', verb: 'est un', desc: 'A store is a kind of client, with an address and opening hours.', rate: 100 },
    { from: 'Client prioritaire', to: 'Client', card: '⊂', verb: 'sous-ensemble de', desc: 'Priority clients are clients with a signed service agreement.', rate: 91.5 },
  ];
  const LOGIC = [
    { name: 'Taux de retour', kind: 'derived', type: 'Article', formula: 'Returned quantity ÷ ordered quantity, over the last 30 days.', summary: 'computed on 412 of 412 articles',
      samples: [['ART-0012 Salade César', '2.1 %'], ['ART-0047 Wrap poulet', '6.8 %'], ['ART-0103 Soupe potiron', '0.9 %'], ['ART-0150 Bowl quinoa', '3.4 %'], ['ART-0211 Tarte citron', '11.2 %']] },
    { name: 'Client à risque', kind: 'rule', type: 'Client', formula: 'A client is at risk when their return rate is above 8 % or they have not ordered for 21 days.', summary: '23 of 340 clients match',
      samples: [['CLI-0007 Magasin Lyon 3', 'yes'], ['CLI-0019 Bureau Nexa', 'no'], ['CLI-0044 Magasin Lille', 'yes'], ['CLI-0081 Café Rivoli', 'no'], ['CLI-0102 Magasin Nantes', 'no']] },
    { name: 'Surcharge cuisine', kind: 'rule', type: 'Cuisine', formula: 'A kitchen is overloaded on a day when planned production exceeds 110 % of its capacity.', summary: '12 of 340 kitchen-days match',
      samples: [['CUI-01 Rungis · 03/03', 'yes'], ['CUI-01 Rungis · 04/03', 'no'], ['CUI-02 Lyon · 03/03', 'no'], ['CUI-03 Lille · 05/03', 'yes'], ['CUI-02 Lyon · 06/03', 'no']] },
    { name: 'Marge estimée', kind: 'derived', type: 'Commande', formula: 'Order amount minus article cost minus returns credited.', summary: 'computed on 8,120 of 8,124 orders',
      samples: [['CMD-10021', '€ 142.30'], ['CMD-10022', '€ 38.90'], ['CMD-10023', '€ -4.10'], ['CMD-10024', '€ 210.75'], ['CMD-10025', '€ 67.00']] },
    { name: 'Délai de livraison', kind: 'derived', type: 'Commande', formula: 'Hours between the order and its delivery to the store.', summary: 'computed on 7,960 of 8,124 orders',
      samples: [['CMD-10021', '14 h'], ['CMD-10022', '22 h'], ['CMD-10023', '9 h'], ['CMD-10024', '31 h'], ['CMD-10025', '16 h']] },
    { name: 'Article en fin de vie', kind: 'rule', type: 'Article', formula: 'An article is ending when it has not been produced for 30 days and sales are falling.', summary: '17 of 412 articles match',
      samples: [['ART-0012 Salade César', 'no'], ['ART-0047 Wrap poulet', 'no'], ['ART-0088 Gaspacho', 'yes'], ['ART-0150 Bowl quinoa', 'no'], ['ART-0199 Taboulé', 'yes']] },
  ];

  window.SWAIN_VIEWS.logic = function (content, bar) {
    bar.append(el('span', { class: 'pill ds-st warn', style: 'margin:0' }, 'Simulated'));
    let sel = 0;
    const left = el('div', { class: 'stack' });
    const right = el('div', { class: 'stack' });
    content.append(el('div', { class: 'split' }, left, right));

    function renderLeft() {
      left.replaceChildren(
        el('h3', {}, 'Relations'),
        el('div', { class: 'ds-list' }, RELATIONS.map((r) => el('div', { class: 'ds' },
          el('div', { class: 'ds-name' }, `${r.from} → ${r.to}`),
          el('div', { class: 'ds-meta' }, el('span', {}, `${r.card} · ${r.verb}`),
            el('span', { class: `ds-st ${r.rate >= 98 ? 'ok' : 'warn'}` }, `${r.rate.toLocaleString(undefined, { minimumFractionDigits: 1 })} % match`)),
          el('div', { class: 'xs muted' }, r.desc)))),
        el('h3', {}, 'Derived properties & rules'),
        el('div', { class: 'ds-list' }, LOGIC.map((l, i) => el('button', { class: `ds${i === sel ? ' on' : ''}`, onclick: () => { sel = i; renderLeft(); renderRight(); } },
          el('div', { class: 'ds-name' }, `${l.name} (${l.type})`),
          el('div', { class: 'ds-meta' }, el('span', {}, l.kind === 'rule' ? 'Rule' : 'Derived property'), el('span', { class: 'ds-st ok' }, l.summary))))));
    }

    function renderRight() {
      const l = LOGIC[sel];
      const result = el('span', { class: 'pill' });
      const btn = el('button', { class: 'btn primary', onclick: () => {
        btn.disabled = true; result.className = 'pill muted'; result.textContent = 'Running…';
        setTimeout(() => { btn.disabled = false; result.className = 'pill ok'; result.textContent = `✓ ${l.samples.length} / ${l.samples.length} computed`; }, 400);
      } }, 'Test on sample');
      right.replaceChildren(el('div', { class: 'card stack' },
        el('h3', {}, l.name),
        el('div', { class: 'row' }, el('span', { class: 'pill' }, l.kind === 'rule' ? 'Rule' : 'Derived property'), el('span', { class: 'pill' }, `on ${l.type}`)),
        el('div', {}, el('b', {}, 'How it is computed: '), l.formula),
        el('div', { class: 'xs muted' }, l.summary),
        table([l.type, l.kind === 'rule' ? 'Matches' : 'Value'], l.samples),
        el('div', { class: 'row' }, btn, result)));
    }

    renderLeft();
    renderRight();
  };
})();
