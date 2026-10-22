// Chat blocks parser tests (T-25, G9): every block kind, mixed text and blocks, fallbacks to text.

import { describe, expect, it } from 'vitest';
import type { ChatBlock } from '@mini/shared';
import { CHAT_BLOCK_KINDS, parseAssistantText, parseBlockJson } from '../src/modules/agent/blocks.js';

const fence = (json: string): string => '```block\n' + json + '\n```';

const examples: ChatBlock[] = [
  { kind: 'plan', steps: [{ text: 'Vérifier les fichiers', status: 'done', stage: 'ingest' }, { text: 'Définir le taux de retour', status: 'doing', stage: 'semantics' }] },
  { kind: 'proposal', rows: [{ item: 'orders_clean', whatItDoes: 'Une ligne par commande', rows: 72677 }, { item: 'Kitchen', whatItDoes: 'Une cuisine' }], caveats: ['Capacités simulées'] },
  { kind: 'verification', checks: [{ label: 'Commandes chargées', ok: true, detail: '72 677 sur 72 677 documents SO' }] },
  { kind: 'definition', termId: 'T_return_rate', name: 'Taux de retour', definition: 'Retours / livraisons', evidence: [{ what: 'Signe des quantités retournées', result: '100 % négatives' }] },
  { kind: 'decision', constraintId: 'C_return_base', question: 'Le taux de retour se mesure par rapport à quoi ?', choice: 'Aux livraisons' },
  { kind: 'table', columns: ['Mois', 'Commandes'], rows: [['2025-01', 6012], ['2025-02', null]] },
  { kind: 'barChart', x: 'month', y: 'orders', data: [{ month: '2025-01', orders: 6012 }] },
  { kind: 'objectLink', ref: { objectType: 'Order', primaryKey: 'SO-1001' }, label: 'Commande SO-1001' },
  { kind: 'appLink', appId: 'app_1', label: 'Suivi des retours' },
];

describe('parseBlockJson', () => {
  it('has one example per ChatBlock kind', () => {
    expect(examples.map((e) => e.kind).sort()).toEqual([...CHAT_BLOCK_KINDS].sort());
  });

  for (const block of examples) {
    it(`parses a ${block.kind} block`, () => {
      expect(parseBlockJson(JSON.stringify(block))).toEqual({ ok: true, block });
    });
  }

  it('reports invalid JSON, unknown kinds and wrong fields', () => {
    expect(parseBlockJson('{"kind":"plan",')).toEqual({ ok: false, reason: 'invalid_json' });
    expect(parseBlockJson('{"kind":"pieChart","data":[]}')).toEqual({ ok: false, reason: 'invalid_block' });
    expect(parseBlockJson('{"kind":"decision","constraintId":"C_x","question":"q"}')).toEqual({ ok: false, reason: 'invalid_block' });
    expect(parseBlockJson('[1,2]')).toEqual({ ok: false, reason: 'invalid_block' });
    expect(parseBlockJson('null')).toEqual({ ok: false, reason: 'invalid_block' });
  });

  it('drops unknown extra fields', () => {
    expect(parseBlockJson('{"kind":"appLink","appId":"a","label":"L","extra":1}')).toEqual({
      ok: true,
      block: { kind: 'appLink', appId: 'a', label: 'L' },
    });
  });
});

describe('parseAssistantText', () => {
  it('returns plain text unchanged when there are no blocks', () => {
    expect(parseAssistantText('Bonjour.\n\nVoici le plan.')).toEqual({
      text: 'Bonjour.\n\nVoici le plan.',
      blocks: [],
      segments: [{ type: 'text', text: 'Bonjour.\n\nVoici le plan.' }],
    });
  });

  it('parses a definition and a decision block between text, in order', () => {
    const definition = examples[3]!;
    const decision = examples[4]!;
    const input = [
      "J'ai défini le taux de retour :",
      '',
      fence(JSON.stringify(definition)),
      '',
      'Et votre choix est enregistré :',
      fence(JSON.stringify(decision, null, 2)),
      'Fin.',
    ].join('\n');
    const out = parseAssistantText(input);
    expect(out.blocks).toEqual([definition, decision]);
    expect(out.text).toBe("J'ai défini le taux de retour :\n\nEt votre choix est enregistré :\n\nFin.");
    expect(out.segments.map((s) => s.type)).toEqual(['text', 'block', 'text', 'block', 'text']);
  });

  it('parses adjacent blocks and a message made only of a block', () => {
    const input = fence(JSON.stringify(examples[0])) + '\n' + fence(JSON.stringify(examples[2])) + '\n';
    const out = parseAssistantText(input);
    expect(out.blocks).toEqual([examples[0], examples[2]]);
    expect(out.text).toBe('');
    expect(out.segments).toHaveLength(2);
  });

  it('accepts CRLF line endings', () => {
    const out = parseAssistantText('Avant\r\n```block\r\n' + JSON.stringify(examples[8]) + '\r\n```\r\nAprès');
    expect(out.blocks).toEqual([examples[8]]);
    expect(out.text).toBe('Avant\n\nAprès');
  });

  it('G9: keeps a block with invalid JSON as text, verbatim', () => {
    const bad = fence('{"kind":"verification","checks":[{"label":"x",}]}');
    const out = parseAssistantText('Résultat :\n' + bad + '\nVoilà.');
    expect(out.blocks).toEqual([]);
    expect(out.text).toBe('Résultat :\n' + bad + '\nVoilà.');
    expect(out.segments).toEqual([{ type: 'text', text: out.text }]);
  });

  it('G9: keeps a block of unknown kind as text, and still parses the valid ones', () => {
    const unknown = fence('{"kind":"pieChart","data":[]}');
    const input = unknown + '\n' + fence(JSON.stringify(examples[4]));
    const out = parseAssistantText(input);
    expect(out.blocks).toEqual([examples[4]]);
    expect(out.segments).toEqual([{ type: 'text', text: unknown }, { type: 'block', block: examples[4] }]);
  });

  it('G9: keeps a block with wrong fields as text', () => {
    const wrong = fence('{"kind":"definition","termId":"T_x","name":"X","definition":"d","evidence":"none"}');
    expect(parseAssistantText(wrong)).toEqual({ text: wrong, blocks: [], segments: [{ type: 'text', text: wrong }] });
  });

  it('leaves an unclosed fence and other code fences as text', () => {
    const unclosed = 'Voici :\n```block\n{"kind":"appLink","appId":"a","label":"L"}';
    expect(parseAssistantText(unclosed)).toMatchObject({ text: unclosed, blocks: [] });
    const sql = 'Requête :\n```sql\nSELECT 1\n```';
    expect(parseAssistantText(sql)).toMatchObject({ text: sql, blocks: [] });
  });

  it('ignores ```block that is not at the start of a line', () => {
    const inline = 'Utilisez ```block\n{"kind":"appLink","appId":"a","label":"L"}\n``` pour les blocs.';
    expect(parseAssistantText(inline).blocks).toEqual([]);
  });
});
