// Minimal cards (T-07, acceptance D5). Pure planning tests, then the hook on the migrated test database
// (global-setup.ts), with dataset rows inserted by hand as 09 §4.2 says. Each test gets its own user and project.

import type { ColumnInfo, ColumnProfile, SemConstraint, SemEvidence, SemOp, SemTerm } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createPool } from '../src/db/pool.js';
import type { OnProfileDone } from '../src/ports.js';
import {
  CardsError, cardIds, createOnProfileDone, createProfileCards, guessTermType, planCardOps, profileSummary, slugify,
  type DatasetSnapshot,
} from '../src/modules/semantics/cards.js';
import { emptyBank, validateBank, type DatasetCatalog } from '../src/modules/semantics/engine/index.js';
import { SemanticStore } from '../src/modules/semantics/store.js';
import { TEST_DATABASE_URL } from './helpers.js';

// ---------- fixtures modelled on the Kumo files ----------

const col = (name: string, sqlName: string, type: ColumnInfo['type'], sample: ColumnInfo['sample'], nullable = false): ColumnInfo =>
  ({ name, sqlName, type, nullable, sample });
const prof = (column: string, type: ColumnProfile['type'], p: Partial<ColumnProfile>): ColumnProfile => ({
  column, type, rowCount: 1500, nullCount: 0, distinctCount: 1500, isUnique: false, topValues: [], ...p,
});

const COMMANDES_COLUMNS: ColumnInfo[] = [
  col('No_Transaction', 'no_transaction', 'string', ['SO-000123', 'SO-000123', 'RMA-000045']),
  col('Quantite', 'quantite', 'integer', [12, 4, -3]),
  col('Date', 'date', 'date', ['2025-03-02', '2025-08-14']),
  col('Lieu_Production', 'lieu_production', 'string', [null, 'Gennevilliers', 'Frépillon'], true),
  col('Commentaire', 'commentaire', 'string', ['livré en retard', null], true),
];
const COMMANDES_PROFILE: ColumnProfile[] = [
  prof('no_transaction', 'string', {
    distinctCount: 180, topValues: [{ value: 'SO-000123', count: 14 }, { value: 'RMA-000045', count: 9 }],
    patterns: [{ pattern: 'SO-…', count: 1000 }, { pattern: 'RMA-…', count: 500 }], min: 'RMA-000001', max: 'SO-000120',
  }),
  prof('quantite', 'integer', { distinctCount: 61, min: -40, max: 250, topValues: [{ value: '1', count: 300 }, { value: '-1', count: 120 }] }),
  prof('date', 'date', { distinctCount: 300, min: '2025-01-02', max: '2025-12-30', topValues: [{ value: '2025-08-14', count: 22 }] }),
  prof('lieu_production', 'string', {
    nullCount: 900, distinctCount: 3,
    topValues: [{ value: null, count: 900 }, { value: 'Gennevilliers', count: 350 }, { value: 'Frépillon', count: 250 }],
  }),
  prof('commentaire', 'string', { nullCount: 1200, distinctCount: 260, topValues: [{ value: null, count: 1200 }] }),
];
const CAPACITE_COLUMNS: ColumnInfo[] = [
  col('Cuisine', 'cuisine', 'string', ['Gennevilliers', 'Frépillon', 'Wissous']),
  col('Date', 'date', 'date', ['2025-10-14']),
  col('Shift', 'shift', 'string', ['matin', 'soir']),
  col('Capacité_Unités', 'capacite_unites', 'double', [120.5, 98]),
];
const CAPACITE_PROFILE: ColumnProfile[] = [
  prof('cuisine', 'string', { rowCount: 180, distinctCount: 3, topValues: [{ value: 'Gennevilliers', count: 60 }] }),
  prof('date', 'date', { rowCount: 180, distinctCount: 30, min: '2025-10-01', max: '2025-10-30' }),
  prof('shift', 'string', { rowCount: 180, distinctCount: 2, topValues: [{ value: 'matin', count: 90 }, { value: 'soir', count: 90 }] }),
  prof('capacite_unites', 'double', { rowCount: 180, distinctCount: 140, min: 40, max: 310.5 }),
];

const snapshot = (over: Partial<DatasetSnapshot> = {}): DatasetSnapshot => ({
  id: '00000000-0000-0000-0000-000000000001', name: 'COMMANDES_NETSUITE_2025', shortId: 'k3f9a2qx', simulated: false,
  currentVersion: 1, version: 1, tableName: 'data.ds_k3f9a2qx_v1', rowCount: 1500, createdBy: 'u1',
  columns: COMMANDES_COLUMNS, profile: COMMANDES_PROFILE, ...over,
});

describe('minimal cards: planning', () => {
  it('slugs are lower-case ascii with accents folded', () => {
    expect(slugify('Capacité_Unités')).toBe('capacite_unites');
    expect(slugify('  COMMANDES NetSuite-2025 ')).toBe('commandes_netsuite_2025');
    expect(slugify('***')).toBe('x');
    expect(cardIds('commandes_netsuite_2025', 'no_transaction')).toEqual({
      term: 'T_commandes_netsuite_2025__no_transaction', mapping: 'M_commandes_netsuite_2025__no_transaction',
      evidence: 'E_commandes_netsuite_2025__no_transaction', constraint: 'C_commandes_netsuite_2025__no_transaction__simulated',
    });
  });

  it('guesses term types per 03-data-model §6', () => {
    const guess = (i: number) => guessTermType(COMMANDES_COLUMNS[i]!, COMMANDES_PROFILE[i]);
    expect([0, 1, 2, 3, 4].map(guess)).toEqual(['entity', 'metric', 'dimension', 'category', 'concept']);
    expect(guessTermType(col('ID_Interne_Client', 'id_interne_client', 'integer', []))).toBe('entity');
    expect(guessTermType(col('Actif', 'actif', 'boolean', []))).toBe('category');
    expect(guessTermType(col('Email', 'email', 'string', []), prof('email', 'string', { isUnique: true }))).toBe('entity');
  });

  it('summarizes the profile in under 2 KB, with prefixes and nulls', () => {
    const s = profileSummary(snapshot(), COMMANDES_COLUMNS[0]!, COMMANDES_PROFILE[0]);
    expect(s).toContain('Prefixes: SO-… 1 000, RMA-… 500.');
    expect(s).toContain('180 distinct values');
    expect(profileSummary(snapshot(), COMMANDES_COLUMNS[3]!, COMMANDES_PROFILE[3])).toContain('900 empty (60.0 %)');
    const huge = prof('x', 'string', { topValues: Array.from({ length: 10 }, (_, i) => ({ value: `${i}`.repeat(500), count: i })) });
    expect(profileSummary(snapshot(), col('X', 'x', 'string', ['y'.repeat(900)]), huge).length).toBeLessThanOrEqual(2000);
  });

  it('a dataset whose name slugs like another one gets its short id in the ids', () => {
    const first = planCardOps(emptyBank(), snapshot());
    const bank = { version: 'draft', records: new Map(first.map((o) => {
      const r = (o as Extract<SemOp, { op: 'upsertRecord' }>).record;
      return [r.body.id, { ...r, lifecycle: 'active' as const }] as const;
    })) } as ReturnType<typeof emptyBank>;
    const other = planCardOps(bank, snapshot({ id: '00000000-0000-0000-0000-000000000002', name: 'commandes netsuite 2025', shortId: 'zz11yy22' }));
    expect((other[0] as Extract<SemOp, { op: 'upsertRecord' }>).record.body.id).toBe('T_commandes_netsuite_2025_zz11yy22__no_transaction');
  });
});

describe('minimal cards: the onProfileDone hook on Postgres', () => {
  let db: Db;
  let store: SemanticStore;
  let projectId: string;
  let userId: string;
  let commandesId: string;
  let capaciteId: string;
  const log = vi.fn();

  const shortId = () => Math.random().toString(36).slice(2).padEnd(8, '0').slice(0, 8);

  async function addDataset(name: string, simulated: boolean): Promise<string> {
    const r = await sql<{ id: string }>`INSERT INTO meta.datasets (project_id, short_id, name, simulated, created_by)
      VALUES (${projectId}, ${shortId()}, ${name}, ${simulated}, ${userId}) RETURNING id`.execute(db);
    return r.rows[0]!.id;
  }
  async function addVersion(datasetId: string, version: number, columns: ColumnInfo[], profile: ColumnProfile[] | null) {
    await sql`INSERT INTO meta.dataset_versions (dataset_id, version, transaction_type, table_name, row_count, columns, profile, profile_status, source_file, created_by)
      VALUES (${datasetId}, ${version}, 'SNAPSHOT', ${`data.ds_test_v${version}`}, ${profile?.[0]?.rowCount ?? 0}, ${JSON.stringify(columns)}::jsonb,
              ${profile ? JSON.stringify(profile) : null}::jsonb, ${profile ? 'done' : 'running'}, 'x.csv', ${userId})`.execute(db);
    await sql`UPDATE meta.datasets SET current_version = ${version} WHERE id = ${datasetId}`.execute(db);
  }
  const catalog = (): DatasetCatalog => ({ datasets: [
    { id: commandesId, name: 'COMMANDES_NETSUITE_2025', columns: COMMANDES_COLUMNS.map((c) => c.sqlName) },
    { id: capaciteId, name: 'CAPACITE_CUISINES_JOUR_2025', columns: CAPACITE_COLUMNS.map((c) => c.sqlName) },
  ] });
  const draft = async () => (await store.load(projectId, 'draft'))!;
  const hook = (s: CardsStore = store, maxAttempts?: number) => createProfileCards({ db, store: s, log, maxAttempts });
  type CardsStore = Pick<SemanticStore, 'load' | 'applyDraftOps'>;

  beforeAll(() => {
    db = createDb(createPool({ connectionString: TEST_DATABASE_URL, max: 4 }));
    store = new SemanticStore(db, { now: () => new Date('2025-10-21T08:00:00Z') });
  });
  afterAll(async () => { await db.destroy(); });

  beforeEach(async () => {
    log.mockClear();
    const tag = Math.random().toString(36).slice(2, 10);
    userId = (await sql<{ id: string }>`INSERT INTO meta.users (email, display_name) VALUES (${`cards-${tag}@test`}, 'Ada') RETURNING id`.execute(db)).rows[0]!.id;
    projectId = (await sql<{ id: string }>`INSERT INTO meta.projects (name, created_by) VALUES (${`Kumo cards ${tag}`}, ${userId}) RETURNING id`.execute(db)).rows[0]!.id;
    commandesId = await addDataset('COMMANDES_NETSUITE_2025', false);
    capaciteId = await addDataset('CAPACITE_CUISINES_JOUR_2025', true);
    await addVersion(commandesId, 1, COMMANDES_COLUMNS, COMMANDES_PROFILE);
    await addVersion(capaciteId, 1, CAPACITE_COLUMNS, CAPACITE_PROFILE);
  });

  it('D5: one term, mapping and evidence per column; simulated columns carry a scope constraint; the draft validates', async () => {
    const onProfileDone: OnProfileDone = createOnProfileDone({ db, store, log }); // the contract type of 09 §4.2
    await expect(onProfileDone({ projectId, datasetId: commandesId, version: 1 })).resolves.toBeUndefined();
    const second = await hook()({ projectId, datasetId: capaciteId, version: 1 });
    expect(second).toMatchObject({ ok: true, ops: 16, revision: 2, validationErrors: 0 });

    const { bank, info } = await draft();
    expect(info.counts).toMatchObject({ terms: 9, enriched: 0, mappings: 9, evidence: 9, constraints: 4, openDecisions: 0 });
    for (const [dsId, name, columns] of [[commandesId, 'commandes_netsuite_2025', COMMANDES_COLUMNS], [capaciteId, 'capacite_cuisines_jour_2025', CAPACITE_COLUMNS]] as const) {
      for (const c of columns) {
        const ids = cardIds(name, slugify(c.sqlName));
        expect(bank.records.get(ids.term)).toMatchObject({ kind: 'term', lifecycle: 'active', body: { name: c.name, definition: 'to be defined', status: 'card', evidence: [ids.evidence] } });
        expect(bank.records.get(ids.mapping)?.body).toMatchObject({ term_id: ids.term, database_source: dsId, column: c.sqlName });
        expect((bank.records.get(ids.evidence)?.body as SemEvidence).result).toMatch(/^Profile of /);
      }
    }
    const nt = bank.records.get('T_commandes_netsuite_2025__no_transaction')!.body as SemTerm;
    expect(nt).toMatchObject({ type: 'entity', scope: 'COMMANDES_NETSUITE_2025', aliases: [] });
    expect((bank.records.get('T_capacite_cuisines_jour_2025__capacite_unites')?.body as SemTerm).aliases).toEqual([]); // folded header == sqlName: no alias needed
    expect((bank.records.get('E_commandes_netsuite_2025__no_transaction')!.body as SemEvidence)).toMatchObject({
      source: 'COMMANDES_NETSUITE_2025', timestamp: '2025-10-21T08:00:00.000Z', result: expect.stringContaining('RMA-… 500'),
    });
    expect(bank.records.has('C_commandes_netsuite_2025__no_transaction__simulated')).toBe(false);
    const c = bank.records.get('C_capacite_cuisines_jour_2025__capacite_unites__simulated')!.body as SemConstraint;
    expect(c).toMatchObject({
      target: 'T_capacite_cuisines_jour_2025__capacite_unites', constraint_type: 'scope', severity: 'warning', confidence: 1,
      trigger_keywords: expect.arrayContaining(['capacite cuisines jour', 'capacité unités', 'simulated']),
      description: expect.stringContaining('simulated dataset'),
    });
    expect((bank.records.get('T_capacite_cuisines_jour_2025__capacite_unites')!.body as SemTerm).scope).toBe('CAPACITE_CUISINES_JOUR_2025 (simulated data)');

    expect(validateBank(bank, { catalog: catalog() }).errors).toEqual([]);
    const r = await store.resolve(projectId, { mentions: ['Capacité_Unités'], version: 'draft' });
    expect(r.mentions[0]!.constraints.map((x) => x.id)).toEqual(['C_capacite_cuisines_jour_2025__capacite_unites__simulated']);
  });

  it('re-running for the same version changes nothing', async () => {
    await hook()({ projectId, datasetId: commandesId, version: 1 });
    const before = await draft();
    expect(await hook()({ projectId, datasetId: commandesId, version: 1 })).toEqual({ ok: true, ops: 0, revision: 1, validationErrors: 0 });
    expect(await draft()).toEqual(before);
  });

  it('a new version: enriched cards untouched, new columns added, removed ones retired, card evidence refreshed', async () => {
    await hook()({ projectId, datasetId: commandesId, version: 1 });
    // The agent enriches No_Transaction and links the Commentaire card from a relation of its own.
    const enriched: SemTerm = {
      id: 'T_commandes_netsuite_2025__no_transaction', name: 'Document', type: 'entity', definition: 'Un document NetSuite : commande SO- ou retour RMA-',
      scope: '2025', aliases: ['No_Transaction'], evidence: ['E_commandes_netsuite_2025__no_transaction'], status: 'enriched',
    };
    await store.applyDraftOps(projectId, { expectedRevision: 1, ops: [
      { op: 'upsertRecord', record: { kind: 'term', body: enriched } },
      { op: 'upsertRecord', record: { kind: 'relation', body: { id: 'R_document_commentaire', source: enriched.id, relation_type: 'association', target: 'T_commandes_netsuite_2025__commentaire', description: 'Un document porte un commentaire', evidence: [] } } },
    ] }, { userId });
    const enrichedBefore = (await draft()).bank.records.get(enriched.id);

    const v2Columns = [...COMMANDES_COLUMNS.filter((c) => c.sqlName !== 'commentaire' && c.sqlName !== 'date'), col('Montant_HT', 'montant_ht', 'double', [12.5])];
    const v2Profile = [
      ...COMMANDES_PROFILE.filter((p) => p.column !== 'commentaire' && p.column !== 'date').map((p) => (p.column === 'quantite' ? { ...p, rowCount: 1600, max: 300 } : { ...p, rowCount: 1600 })),
      prof('montant_ht', 'double', { rowCount: 1600, distinctCount: 900, min: -80, max: 4200 }),
    ];
    await addVersion(commandesId, 2, v2Columns, v2Profile);
    const out = await hook()({ projectId, datasetId: commandesId, version: 2 });
    expect(out).toMatchObject({ ok: true, validationErrors: 0 });

    const { bank } = await draft();
    expect(bank.records.get(enriched.id)).toEqual(enrichedBefore);
    expect((bank.records.get('E_commandes_netsuite_2025__no_transaction')!.body as SemEvidence).result).toContain('version 1');
    expect((bank.records.get('E_commandes_netsuite_2025__quantite')!.body as SemEvidence).result).toMatch(/version 2[\s\S]*to 300/);
    expect(bank.records.get('T_commandes_netsuite_2025__montant_ht')?.body).toMatchObject({ type: 'metric', status: 'card' });
    // Date: nothing points at it, so its cards leave the draft.
    for (const k of ['T', 'M', 'E']) expect(bank.records.has(`${k}_commandes_netsuite_2025__date`)).toBe(false);
    // Commentaire: the agent's relation still points at the term, so the term and its evidence are superseded, the mapping removed.
    expect(bank.records.get('T_commandes_netsuite_2025__commentaire')?.lifecycle).toBe('superseded');
    expect(bank.records.get('E_commandes_netsuite_2025__commentaire')?.lifecycle).toBe('superseded');
    expect(bank.records.has('M_commandes_netsuite_2025__commentaire')).toBe(false);
    expect(validateBank(bank, { catalog: { datasets: [{ id: commandesId, name: 'COMMANDES_NETSUITE_2025', columns: v2Columns.map((c) => c.sqlName) }] } }).errors).toEqual([]);

    // A late run for the old version is skipped; a second run for v2 changes nothing.
    expect(await hook()({ projectId, datasetId: commandesId, version: 1 })).toMatchObject({ ok: true, ops: 0, skipped: expect.stringContaining('older') });
    expect(await hook()({ projectId, datasetId: commandesId, version: 2 })).toMatchObject({ ok: true, ops: 0 });
  });

  it('retries when the agent edits the draft at the same time', async () => {
    let calls = 0;
    const racing: CardsStore = {
      load: (...a) => store.load(...a),
      applyDraftOps: async (pid, input, actor, opts) => {
        if (++calls === 1) {
          const rev = (await draft()).info.revision ?? 0;
          await store.applyDraftOps(pid, { expectedRevision: rev, ops: [{ op: 'upsertRecord', record: { kind: 'term', body: {
            id: 'T_retour', name: 'Retour', type: 'entity', definition: 'Un document RMA', scope: '2025', aliases: ['RMA'], evidence: [], status: 'enriched',
          } } }] }, { userId });
        }
        return store.applyDraftOps(pid, input, actor, opts);
      },
    };
    expect(await hook(racing)({ projectId, datasetId: capaciteId, version: 1 })).toMatchObject({ ok: true, revision: 2 });
    expect(calls).toBe(2);
    const { bank } = await draft();
    expect(bank.records.has('T_retour')).toBe(true);
    expect(bank.records.has('T_capacite_cuisines_jour_2025__cuisine')).toBe(true);

    calls = 0;
    await addVersion(capaciteId, 2, CAPACITE_COLUMNS.slice(0, 3), CAPACITE_PROFILE.slice(0, 3));
    const out = await hook(racing, 1)({ projectId, datasetId: capaciteId, version: 2 });
    expect(out).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect(log).toHaveBeenCalledOnce();
  });

  it('failures are logged; createOnProfileDone rejects with a CardsError for the job, createProfileCards returns ok: false', async () => {
    const onProfileDone = createOnProfileDone({ db, store, log });
    await expect(onProfileDone({ projectId, datasetId: commandesId, version: 9 })).rejects.toBeInstanceOf(CardsError);
    log.mockClear();
    await expect(hook()({ projectId, datasetId: commandesId, version: 9 })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('no version 9') });
    const other = await addDataset('ARTICLES', false);
    await addVersion(other, 1, [col('Code', 'code', 'string', [])], null);
    await expect(hook()({ projectId, datasetId: other, version: 1 })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not done') });
    expect(log).toHaveBeenCalledTimes(2);
    expect((await draft()).info.revision).toBe(0);
  });
});
