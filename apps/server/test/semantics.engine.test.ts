import { describe, expect, it } from 'vitest';
import {
  applyOps, bankFromRecords, browse, counts, fromMessageTrace, looksProcedural, nextVersionName, resolve,
  toBrowseResult, toResolveResult, tokens, validateBank, type OpsContext, type SemBank,
} from '../src/modules/semantics/engine/index.js';
import type { SemConstraint, SemEvidence, SemMapping, SemOp, SemRecord, SemRelation, SemTerm } from '@mini/shared';

// A small Kumo-shaped bank, in French like the real one.
const term = (id: string, name: string, extra: Partial<SemTerm> = {}): SemRecord => ({
  kind: 'term', lifecycle: 'active',
  body: { id, name, type: 'entity', definition: `Définition de ${name}`, scope: '2025', aliases: [], evidence: [], status: 'enriched', ...extra },
});
const mapping = (id: string, termId: string, column: string, extra: Partial<SemMapping> = {}): SemRecord => ({
  kind: 'mapping', lifecycle: 'active',
  body: { id, term_id: termId, database_source: 'ds_commandes', table: 'COMMANDES_NETSUITE_2025', column, evidence: [], ...extra },
});
const constraint = (id: string, target: string, extra: Partial<SemConstraint> = {}): SemRecord => ({
  kind: 'constraint', lifecycle: 'active',
  body: { id, target, constraint_type: 'data_quality', trigger_keywords: ['retour'], severity: 'warning', confidence: 0.9, description: 'Une règle', evidence: [], ...extra },
});
const ev = (id: string, extra: Partial<SemEvidence> = {}): SemRecord => ({
  kind: 'evidence', lifecycle: 'active',
  body: { id, source: 'COMMANDES_NETSUITE_2025', query: 'SELECT 1', result: 'ok', validation_method: 'profil', timestamp: '2025-10-20T09:00:00Z', ...extra },
});
const relation = (id: string, source: string, target: string, extra: Partial<SemRelation> = {}): SemRecord => ({
  kind: 'relation', lifecycle: 'active',
  body: { id, source, relation_type: 'association', target, description: 'lien', evidence: [], ...extra },
});

function kumoBank(): SemBank {
  return bankFromRecords('v0', [
    term('T_client', 'Client (magasin)', { aliases: ['magasin', 'client'] }),
    term('T_commande', 'Commande', { aliases: ['SO', 'bon de commande'], evidence: ['E_prefixes'] }),
    term('T_quantite', 'Quantité livrée', { type: 'metric' }),
    term('T_retour', 'Retour', { aliases: ['RMA', 'avoir'], definition: 'Un document de retour RMA, quantités négatives', evidence: ['E_prefixes', 'E_rma_negatif'] }),
    term('T_taux_retour', 'Taux de retour', { type: 'metric', definition: 'Quantités retournées divisées par la base choisie, par client', evidence: ['E_rma_negatif'] }),
    mapping('M_commande', 'T_commande', 'no_transaction', { semantic_filter: 'documents commençant par SO-', evidence: ['E_prefixes'] }),
    mapping('M_retour', 'T_retour', 'no_transaction', { semantic_filter: 'documents commençant par RMA-', evidence: ['E_prefixes'] }),
    mapping('M_taux_retour', 'T_taux_retour', 'quantite', { aggregation_semantics: 'somme des quantités retournées / somme de la base', evidence: ['E_rma_negatif'] }),
    constraint('C_rma_negatif', 'T_retour', { trigger_keywords: ['retour', 'RMA'], description: 'Les documents RMA portent des quantités négatives', evidence: ['E_rma_negatif'] }),
    constraint('C_base_taux', 'M_taux_retour', {
      constraint_type: 'business_rule', severity: 'block', trigger_keywords: ['taux de retour'],
      description: 'Le taux de retour se mesure sur les quantités commandées ou livrées', options: ['commandées', 'livrées'],
      resolution: { choice: 'livrées', by: 'u-ada', at: '2025-10-20T10:00:00Z' }, evidence: ['E_rma_negatif'],
    }),
    relation('R_commande_client', 'T_commande', 'T_client', { keys: [{ fromColumn: 'id_interne_client_netsuite', toColumn: 'id_interne' }], evidence: ['E_jointure'] }),
    ev('E_prefixes', { query: 'SELECT left(no_transaction, 3) AS p, count(DISTINCT no_transaction) FROM data.commandes GROUP BY 1' }),
    ev('E_rma_negatif', { query: "SELECT sign(quantite), count(*) FROM data.commandes WHERE no_transaction LIKE 'RMA-%' GROUP BY 1" }),
    ev('E_jointure', { query: 'SELECT count(*) FROM data.commandes c JOIN data.clients k ON k.id_interne = c.id_interne_client_netsuite' }),
  ]);
}

const ctx = (extra: Partial<OpsContext> = {}): OpsContext => ({ userId: 'u-ada', now: () => '2025-10-21T08:00:00.000Z', ...extra });
const codesOf = (bank: SemBank) => {
  const v = validateBank(bank);
  return { errors: v.errors.map((e) => `${e.code} ${e.path}`), warnings: v.warnings.map((e) => `${e.code} ${e.path}`) };
};

describe('text', () => {
  it('folds accents and drops French stopwords', () => {
    expect([...tokens('Quantités livrées par cuisine')]).toEqual(['quantite', 'livree', 'cuisine']);
    expect([...tokens('taux de retour')]).toEqual(['taux', 'retour']);
  });
});

describe('validation (S1)', () => {
  it('the Kumo bank is valid', () => {
    expect(validateBank(kumoBank())).toEqual({ errors: [], warnings: [] });
  });

  it('a relation to an unknown term → SEM_BAD_REFERENCE', () => {
    const bank = kumoBank();
    bank.records.set('R_x', relation('R_x', 'T_commande', 'T_inconnu'));
    expect(codesOf(bank).errors).toEqual(['SEM_BAD_REFERENCE records.R_x.target']);
  });

  it('relation type belongs_to → SEM_BAD_VOCABULARY', () => {
    const bank = kumoBank();
    bank.records.set('R_x', relation('R_x', 'T_commande', 'T_client', { relation_type: 'belongs_to' as never }));
    expect(codesOf(bank).errors).toEqual(['SEM_BAD_VOCABULARY records.R_x.relation_type']);
  });

  it('a term definition containing SELECT → SEM_PROCEDURAL_CONTENT', () => {
    const bank = kumoBank();
    bank.records.set('T_x', term('T_x', 'Chiffre', { definition: 'SELECT sum(quantite) FROM commandes' }));
    expect(codesOf(bank).errors).toEqual(['SEM_PROCEDURAL_CONTENT records.T_x.definition']);
  });

  it('detects SQL and instructions, not ordinary words', () => {
    expect(looksProcedural('quantity grouped by store, ordered by date')).toBeNull();
    expect(looksProcedural('Les documents dont le numéro commence par SO-')).toBeNull();
    expect(looksProcedural('compte des lignes: count(*) par client')).toBe('SQL');
    expect(looksProcedural('The agent should always use the SO- filter')).toBe('instructions');
    expect(looksProcedural('vous devez filtrer les RMA')).toBe('instructions');
  });

  it('other vocabularies and required fields', () => {
    const bank = kumoBank();
    bank.records.set('C_x', constraint('C_x', 'T_retour', { constraint_type: 'rule' as never, severity: 'warn' as never, trigger_keywords: [] }));
    bank.records.set('T_x', term('T_x', 'Cuisine', { type: 'place' as never, definition: 'to be defined' }));
    bank.records.set('E_x', ev('E_x', { query: '', result: '' }));
    expect(codesOf(bank).errors.sort()).toEqual([
      'SEM_BAD_VOCABULARY records.C_x.constraint_type',
      'SEM_BAD_VOCABULARY records.C_x.severity',
      'SEM_BAD_VOCABULARY records.T_x.type',
      'SEM_MISSING_FIELD records.C_x.trigger_keywords',
      'SEM_MISSING_FIELD records.E_x.query',
      'SEM_MISSING_FIELD records.T_x.definition',
    ]);
  });

  it('a minimal card may keep "to be defined" and evidence from the profile without a query', () => {
    const bank = kumoBank();
    bank.records.set('T_x', term('T_x', 'Algo_Manu', { status: 'card', definition: 'to be defined', type: 'metric' }));
    bank.records.set('E_x', ev('E_x', { query: undefined, result: 'integer, 989 nulls, 7 distinct' }));
    expect(codesOf(bank).errors).toEqual([]);
  });

  it('relation keys without a join evidence → SEM_RELATION_KEYS_UNCHECKED warning', () => {
    const bank = kumoBank();
    bank.records.set('R_commande_client', relation('R_commande_client', 'T_commande', 'T_client', { keys: [{ fromColumn: 'a', toColumn: 'b' }], evidence: ['E_prefixes'] }));
    expect(codesOf(bank)).toEqual({ errors: [], warnings: ['SEM_RELATION_KEYS_UNCHECKED records.R_commande_client.keys'] });
  });

  it('an open block decision warns in the draft and blocks publication', () => {
    const bank = kumoBank();
    const c = bank.records.get('C_base_taux')!;
    bank.records.set('C_base_taux', { ...c, body: { ...(c.body as SemConstraint), resolution: undefined } } as SemRecord);
    expect(validateBank(bank).warnings.map((w) => w.code)).toEqual(['SEM_OPEN_DECISION']);
    expect(validateBank(bank, { forPublish: true }).errors.map((w) => w.code)).toEqual(['SEM_OPEN_DECISION']);
    expect(counts(bank).openDecisions).toBe(1);
  });

  it('checks mappings against the dataset catalog', () => {
    const catalog = { datasets: [{ id: 'ds_commandes', name: 'COMMANDES_NETSUITE_2025', columns: ['no_transaction', 'date'] }] };
    expect(validateBank(kumoBank(), { catalog }).errors.map((e) => `${e.code} ${e.path}`)).toEqual(['SEM_BAD_REFERENCE records.M_taux_retour.column']);
  });

  it('checks only active mappings against the catalog: a superseded mapping to a vanished column does not block', () => {
    const catalog = { datasets: [{ id: 'ds_commandes', name: 'COMMANDES_NETSUITE_2025', columns: ['no_transaction', 'date', 'quantite'] }] };
    const bank = kumoBank();
    bank.records.set('M_ancienne_colonne', { ...mapping('M_ancienne_colonne', 'T_quantite', 'colonne_disparue'), lifecycle: 'superseded' });
    expect(validateBank(bank, { catalog, forPublish: true }).errors).toEqual([]);
    bank.records.set('M_ancienne_colonne', mapping('M_ancienne_colonne', 'T_quantite', 'colonne_disparue'));
    expect(validateBank(bank, { catalog }).errors.map((e) => `${e.code} ${e.path}`)).toEqual(['SEM_BAD_REFERENCE records.M_ancienne_colonne.column']);
  });

  it('question links: unknown question or record are errors, an uncovered picked question warns', () => {
    const workload = [
      { id: 'Q01', text: 'Quels magasins retournent le plus ?', source: 'proposed' as const, picked: true },
      { id: 'Q02', text: 'Quelle cuisine est surchargée ?', source: 'proposed' as const, picked: true },
      { id: 'Q03', text: 'Non retenue', source: 'proposed' as const, picked: false },
    ];
    const v = validateBank(kumoBank(), { workload, questionLinks: { Q01: ['T_taux_retour', 'T_absent'], Q09: ['T_client'] } });
    expect(v.errors.map((e) => `${e.code} ${e.path}`)).toEqual(['SEM_BAD_REFERENCE questionLinks.Q01[1]', 'SEM_BAD_REFERENCE questionLinks.Q09']);
    expect(v.warnings.map((e) => `${e.code} ${e.path}`)).toEqual(['SEM_UNCOVERED_QUESTION questionLinks.Q02']);
  });
});

describe('browse and resolve (S4)', () => {
  it('browse "retour" ranks the Retour term first (alias RMA)', () => {
    const bank = kumoBank();
    const out = browse(bank, { query: 'retour' });
    expect(out.status).toBe('ok');
    const result = toBrowseResult(bank, out);
    expect(result[0]).toMatchObject({ id: 'T_retour', kind: 'term', name: 'Retour' });
    expect(result[0]!.why).toContain('contains the whole query');
    expect(toBrowseResult(bank, browse(bank, { query: 'rma' }))[0]!.id).toBe('T_retour');
  });

  it('resolve "taux de retour" returns its mapping, the resolved constraint and its evidence', () => {
    const bank = kumoBank();
    const out = toResolveResult(bank, resolve(bank, { mentions: ['taux de retour'] }));
    const m = out.mentions[0]!;
    expect(m.term?.id).toBe('T_taux_retour');
    expect(m.mappings.map((x) => x.id)).toEqual(['M_taux_retour']);
    // The constraint targets the mapping (ours): it still comes back, with its decision.
    expect(m.constraints.map((c) => [c.id, c.resolution?.choice])).toEqual([['C_base_taux', 'livrées']]);
    expect(m.evidence.map((e) => e.id)).toEqual(['E_rma_negatif']);
  });

  it('resolve finds terms by alias and accents, and reports ambiguity', () => {
    const bank = kumoBank();
    bank.records.set('T_cuisine', term('T_cuisine', 'Cuisine'));
    bank.records.set('T_cuisine_jour', term('T_cuisine_jour', 'Cuisine-jour', { aliases: ['capacité cuisine'] }));
    const out = toResolveResult(bank, resolve(bank, { mentions: ['RMA', 'quantite livree', 'cuisine', 'capacite cuisine'] }));
    expect(out.mentions.map((m) => m.term?.id ?? m.ambiguous?.candidates.map((c) => c.id).join('|'))).toEqual([
      'T_retour', 'T_quantite', 'T_cuisine', 'T_cuisine_jour',
    ]);
    const amb = toResolveResult(bank, resolve(bank, { mentions: ['cuisine jour'] }));
    expect(amb.mentions[0]!.term?.id).toBe('T_cuisine_jour');
  });

  it('superseded records are invisible to browse and resolve', () => {
    const bank = kumoBank();
    const r = bank.records.get('T_retour')!;
    bank.records.set('T_retour', { ...r, lifecycle: 'superseded' });
    expect(browse(bank, { query: 'RMA', kind: 'term' }).items).toEqual([]);
    expect(resolve(bank, { mentions: ['RMA'] }).results[0]!.status).toBe('unresolved');
    const r2 = resolve(bank, { mentions: ['retour'] }).results[0]!; // falls back to the active "Taux de retour"
    expect(r2.status === 'resolved' && r2.term.id).toBe('T_taux_retour');
  });
});

describe('draft operations', () => {
  it('resolveConstraint records the user and the time', async () => {
    const bank = kumoBank();
    const out = await applyOps(bank, [{ op: 'resolveConstraint', recordId: 'C_base_taux', choice: 'commandées', note: 'demande du contrôle de gestion' }], ctx());
    expect(out.ok && (out.bank.records.get('C_base_taux')!.body as SemConstraint).resolution).toEqual({
      choice: 'commandées', note: 'demande du contrôle de gestion', by: 'u-ada', at: '2025-10-21T08:00:00.000Z',
    });
    // The input bank is not modified.
    expect((bank.records.get('C_base_taux')!.body as SemConstraint).resolution?.choice).toBe('livrées');
  });

  it('is all or nothing', async () => {
    const ops: SemOp[] = [
      { op: 'upsertRecord', record: term('T_cuisine', 'Cuisine') },
      { op: 'resolveConstraint', recordId: 'C_base_taux', choice: 'facturées' },
      { op: 'remove', recordId: 'T_absent' },
    ];
    const out = await applyOps(kumoBank(), ops, ctx());
    expect(out).toEqual({ ok: false, errors: [
      { path: 'ops[1]', code: 'SEM_BAD_VOCABULARY', message: expect.stringContaining('commandées / livrées') },
      { path: 'ops[2]', code: 'SEM_BAD_REFERENCE', message: expect.any(String) },
    ] });
  });

  it('the server writes Evidence results; the agent cannot', async () => {
    const withQuery = await applyOps(kumoBank(), [{ op: 'upsertRecord', record: ev('E_new', { query: 'SELECT count(*) FROM data.clients', result: 'made up' }) }],
      ctx({ runEvidenceQuery: async (q) => `ran: ${q}` }));
    expect(withQuery.ok && withQuery.bank.records.get('E_new')!.body).toMatchObject({ result: 'ran: SELECT count(*) FROM data.clients', timestamp: '2025-10-21T08:00:00.000Z' });

    const noRunner = await applyOps(kumoBank(), [{ op: 'upsertRecord', record: ev('E_new', { result: 'made up', query: undefined }) }], ctx());
    expect(noRunner.ok && (noRunner.bank.records.get('E_new')!.body as SemEvidence).result).toBeUndefined();

    const trusted = await applyOps(kumoBank(), [{ op: 'upsertRecord', record: ev('E_card', { query: undefined, result: 'integer, 0 nulls' }) }], ctx({ trusted: true }));
    expect(trusted.ok && (trusted.bank.records.get('E_card')!.body as SemEvidence).result).toBe('integer, 0 nulls');
  });

  it('upsert keeps the lifecycle and refuses changing a record kind', async () => {
    const bank = kumoBank();
    const step1 = await applyOps(bank, [{ op: 'setLifecycle', recordId: 'T_client', lifecycle: 'proposed' }], ctx());
    const step2 = step1.ok ? await applyOps(step1.bank, [{ op: 'upsertRecord', record: { kind: 'term', body: term('T_client', 'Client').body as SemTerm } }], ctx()) : step1;
    expect(step2.ok && step2.bank.records.get('T_client')!.lifecycle).toBe('proposed');
    const clash = await applyOps(bank, [{ op: 'upsertRecord', record: { kind: 'mapping', body: (mapping('T_client', 'T_client', 'x').body as SemMapping) } }], ctx());
    expect(clash.ok).toBe(false);
  });
});

describe('trajectories and versions', () => {
  it('keeps semantic results whole and cuts other tool results', () => {
    const t = fromMessageTrace({
      sessionId: 's1', question: 'Top 5 des magasins par taux de retour ?', semVersion: 'v0', answer: 'C0012…', status: 'answered',
      messages: [
        { tool_call: { tool: 'resolve_semantics', arguments: { mentions: ['taux de retour'] } } },
        { tool_result: { version: 'v0', mentions: [] } },
        { tool_call: { tool: 'run_sql', arguments: { sql: 'SELECT …' } } },
        { tool_result: 'x'.repeat(5000) },
        { tool_call: { tool: 'aggregate_objects', arguments: {} } },
      ],
    });
    expect(t.semanticCalls).toEqual([{ tool: 'resolve_semantics', input: { mentions: ['taux de retour'] }, result: { version: 'v0', mentions: [] } }]);
    expect(t.toolCalls).toHaveLength(1);
    expect(t.toolCalls[0]!.resultSummary.length).toBeLessThan(2200);
    expect(t.toolCalls[0]!.resultSummary).toContain('1 lines, 5000 chars');
  });

  it('names versions v0, v1, …', () => {
    expect(nextVersionName([])).toBe('v0');
    expect(nextVersionName(['v0', 'v1', 'v10', 'v2'])).toBe('v11');
  });
});
