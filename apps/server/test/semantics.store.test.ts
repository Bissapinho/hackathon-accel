// SemanticStore on the migrated test database (global-setup.ts). Each test gets its own user and project.

import type { SemConstraint, SemOp, SemRecord } from '@mini/shared';
import { sql } from 'kysely';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createPool } from '../src/db/pool.js';
import { ApiError } from '../src/errors.js';
import { buildSemanticsServices, createSemanticsPort, SemanticStore } from '../src/modules/semantics/index.js';
import { TEST_DATABASE_URL } from './helpers.js';

const ops: SemOp[] = [
  { op: 'upsertRecord', record: { kind: 'term', body: { id: 'T_retour', name: 'Retour', type: 'entity', definition: 'Un document RMA, quantités négatives', scope: '2025', aliases: ['RMA'], evidence: ['E_rma'], status: 'enriched' } } },
  { op: 'upsertRecord', record: { kind: 'term', body: { id: 'T_taux_retour', name: 'Taux de retour', type: 'metric', definition: 'Retours divisés par la base choisie', scope: '2025', aliases: [], evidence: [], status: 'enriched' } } },
  { op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_rma', source: 'COMMANDES_NETSUITE_2025', query: "SELECT sign(quantite), count(*) FROM data.c WHERE no_transaction LIKE 'RMA-%' GROUP BY 1", validation_method: 'signe', timestamp: '' } } },
  { op: 'upsertRecord', record: { kind: 'constraint', body: {
    id: 'C_base', target: 'T_taux_retour', constraint_type: 'business_rule', trigger_keywords: ['taux de retour'], severity: 'block', confidence: 0.9,
    description: 'Mesuré sur les quantités commandées ou livrées', options: ['commandées', 'livrées'], evidence: ['E_rma'],
  } } },
];

describe('SemanticStore on Postgres', () => {
  let pool: pg.Pool;
  let db: Db;
  let store: SemanticStore;
  let projectId: string;
  let userId: string;

  beforeAll(() => {
    pool = createPool({ connectionString: TEST_DATABASE_URL, max: 4 });
    db = createDb(pool);
    store = new SemanticStore(db, {
      catalog: async () => undefined,
      runEvidenceQuery: async (_pid, q) => `ran ${q.length} chars`,
      now: () => new Date('2025-10-21T08:00:00Z'),
    });
  });
  afterAll(async () => { await db.destroy(); });

  beforeEach(async () => {
    const tag = Math.random().toString(36).slice(2, 10);
    const u = await sql<{ id: string }>`INSERT INTO meta.users (email, display_name) VALUES (${`ada-${tag}@test`}, 'Ada') RETURNING id`.execute(db);
    userId = u.rows[0]!.id;
    const p = await sql<{ id: string }>`INSERT INTO meta.projects (name, created_by) VALUES (${`Kumo ${tag}`}, ${userId}) RETURNING id`.execute(db);
    projectId = p.rows[0]!.id;
  });

  it('starts empty: no active version, an empty draft at revision 0', async () => {
    expect(await store.activeVersion(projectId)).toBeNull();
    const draft = await store.load(projectId, 'draft');
    expect(draft!.info).toMatchObject({ version: 'draft', status: 'draft', revision: 0 });
    expect((await store.load(projectId, 'active'))!.bank.version).toBe('uninitialized');
  });

  it('applies ops with revisions; a stale revision gets VERSION_CONFLICT and changes nothing', async () => {
    const first = await store.applyDraftOps(projectId, { expectedRevision: 0, ops }, { userId });
    expect(first.revision).toBe(1);
    expect(first.validation.warnings.map((w) => w.code)).toEqual(['SEM_OPEN_DECISION']);
    const evidence = (await store.getRecord(projectId, 'draft', 'E_rma'))!.body;
    expect(evidence).toMatchObject({ result: expect.stringMatching(/^ran \d+ chars$/), timestamp: '2025-10-21T08:00:00.000Z' });

    await expect(store.applyDraftOps(projectId, { expectedRevision: 0, ops: [{ op: 'remove', recordId: 'T_retour' }] }, { userId }))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(await store.recordExists(projectId, 'draft', 'T_retour')).toBe(true);

    await expect(store.applyDraftOps(projectId, { expectedRevision: 1, ops: [{ op: 'remove', recordId: 'T_absent' }] }, { userId }))
      .rejects.toBeInstanceOf(ApiError);
    expect((await store.load(projectId, 'draft'))!.info.revision).toBe(1);
  });

  it('S3: refuses to publish an open decision, then publishes v0 with the resolution by the current user', async () => {
    await store.applyDraftOps(projectId, { expectedRevision: 0, ops }, { userId });
    const links = { Q01: ['T_taux_retour'] };
    await store.setWorkload(projectId, { goal: 'Voir où les retours coûtent', questions: [{ id: 'Q01', text: 'Quels magasins retournent le plus ?', source: 'proposed', picked: true }] });
    await expect(store.publish(projectId, { expectedRevision: 1, summary: 'Retours', limitations: [], questionLinks: links }, { userId }))
      .rejects.toMatchObject({ code: 'SEM_OPEN_DECISION', status: 400, extra: { details: [expect.objectContaining({ path: 'records.C_base.resolution' })] } });

    await store.applyDraftOps(projectId, { expectedRevision: 1, ops: [{ op: 'resolveConstraint', recordId: 'C_base', choice: 'livrées' }] }, { userId });
    const { version, validation } = await store.publish(projectId, { expectedRevision: 2, summary: 'Retours', limitations: ['Cuisine connue à partir d’août'], questionLinks: links }, { userId });
    expect(version).toBe('v0');
    expect(validation).toEqual({ errors: [], warnings: [] });
    expect(await store.activeVersion(projectId)).toBe('v0');
    const c = (await store.getRecord(projectId, 'v0', 'C_base'))!.body as SemConstraint;
    expect(c.resolution).toEqual({ choice: 'livrées', by: userId, at: '2025-10-21T08:00:00.000Z' });
    const v0 = (await store.load(projectId, 'v0'))!.info;
    expect(v0).toMatchObject({ status: 'active', summary: 'Retours', limitations: ['Cuisine connue à partir d’août'], questionLinks: links, publishedBy: userId });
    expect(v0.counts).toMatchObject({ terms: 2, enriched: 2, constraints: 1, openDecisions: 0, evidence: 1 });
  });

  it('S5: a published version is immutable; edits go to a new draft and publish as v1', async () => {
    await store.applyDraftOps(projectId, { expectedRevision: 0, ops: [...ops, { op: 'resolveConstraint', recordId: 'C_base', choice: 'livrées' }] }, { userId });
    await store.publish(projectId, { expectedRevision: 1, summary: 'v0', limitations: [], questionLinks: {} }, { userId });
    const before = await store.load(projectId, 'v0');

    // The new draft starts as a copy of v0, at revision 0.
    expect((await store.load(projectId, 'draft'))!.info.revision).toBe(0);
    const edit = await store.applyDraftOps(projectId, { expectedRevision: 0, ops: [
      { op: 'upsertRecord', record: { kind: 'term', body: { id: 'T_retour', name: 'Retour', type: 'entity', definition: 'Nouvelle définition', scope: '2025', aliases: ['RMA', 'avoir'], evidence: ['E_rma'], status: 'enriched' } } },
      { op: 'resolveConstraint', recordId: 'C_base', choice: 'commandées' },
    ] }, { userId });
    expect(edit.revision).toBe(1);
    expect(await store.load(projectId, 'v0')).toEqual(before);

    const { version } = await store.publish(projectId, { expectedRevision: 1, summary: 'v1', limitations: [], questionLinks: {} }, { userId });
    expect(version).toBe('v1');
    expect(await store.load(projectId, 'v0')).toEqual({ ...before, info: { ...before!.info, status: 'superseded' } });
    expect(((await store.getRecord(projectId, 'v1', 'T_retour'))!.body as { definition: string }).definition).toBe('Nouvelle définition');
    expect((await store.listVersions(projectId)).map((v) => [v.version, v.status])).toEqual([['v0', 'superseded'], ['v1', 'active']]);
  });

  it('browse and resolve read the active version unless another is asked', async () => {
    await store.applyDraftOps(projectId, { expectedRevision: 0, ops: [...ops, { op: 'resolveConstraint', recordId: 'C_base', choice: 'livrées' }] }, { userId });
    await expect(store.browse(projectId, { query: 'retour' })).resolves.toEqual([]); // nothing published yet
    expect((await store.browse(projectId, { query: 'retour', version: 'draft' }))[0]!.id).toBe('T_retour');
    await store.publish(projectId, { expectedRevision: 1, summary: 'v0', limitations: [], questionLinks: {} }, { userId });
    const r = await store.resolve(projectId, { mentions: ['taux de retour', 'RMA'] });
    expect(r.version).toBe('v0');
    expect(r.mentions.map((m) => m.term?.id)).toEqual(['T_taux_retour', 'T_retour']);
    expect(r.mentions[0]!.constraints[0]!.resolution?.choice).toBe('livrées');
    await expect(store.browse(projectId, { query: 'x', version: 'v7' })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('the SemanticsPort answers Part A', async () => {
    const port = createSemanticsPort(store);
    expect(await port.activeVersion(projectId)).toBeNull();
    await store.applyDraftOps(projectId, { expectedRevision: 0, ops: [...ops, { op: 'resolveConstraint', recordId: 'C_base', choice: 'livrées' }] }, { userId });
    await store.publish(projectId, { expectedRevision: 1, summary: 'v0', limitations: [], questionLinks: {} }, { userId });
    expect(await port.activeVersion(projectId)).toBe('v0');
    expect(await port.recordExists(projectId, 'v0', 'T_retour')).toBe(true);
    expect(await port.recordExists(projectId, 'v0', 'T_absent')).toBe(false);
    expect((await port.getRecord(projectId, 'v0', 'T_retour')) as SemRecord).toMatchObject({ kind: 'term', lifecycle: 'active', body: { name: 'Retour' } });
  });

  it('rejected ops carry their field errors as details', async () => {
    const err = await store.applyDraftOps(projectId, { expectedRevision: 0, ops: [{ op: 'remove', recordId: 'T_absent' }] }, { userId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).toBody()).toMatchObject({ code: 'SEM_OPS_REJECTED', details: [expect.objectContaining({ path: 'ops[0]' })] });
    expect((err as ApiError).status).toBe(400);
  });

  it('the default catalog is the project datasets at their current version; superseded mappings are not checked', async () => {
    const real = new SemanticStore(db, { now: () => new Date('2025-10-21T08:00:00Z') });
    const shortId = Math.random().toString(36).slice(2, 10).padEnd(8, '0').slice(0, 8);
    const ds = await sql<{ id: string }>`INSERT INTO meta.datasets (project_id, short_id, name, current_version, created_by)
      VALUES (${projectId}, ${shortId}, 'COMMANDES', 2, ${userId}) RETURNING id`.execute(db);
    const datasetId = ds.rows[0]!.id;
    const cols = (names: string[]) => JSON.stringify(names.map((n) => ({ name: n, sqlName: n, type: 'string', nullable: true, sample: [] })));
    for (const [version, names] of [[1, ['no_transaction', 'ancienne']], [2, ['no_transaction']]] as const) {
      await sql`INSERT INTO meta.dataset_versions (dataset_id, version, transaction_type, table_name, row_count, columns, source_file, created_by)
        VALUES (${datasetId}, ${version}, 'SNAPSHOT', ${`data.ds_${shortId}_v${version}`}, 0, ${cols([...names])}::jsonb, 'x.csv', ${userId})`.execute(db);
    }
    const term = { id: 'T_doc', name: 'Document', type: 'entity' as const, definition: 'Un document', scope: '2025', aliases: [], evidence: [] as string[], status: 'enriched' as const };
    const map = (id: string, column: string) => ({ op: 'upsertRecord' as const, record: { kind: 'mapping' as const, body: { id, term_id: 'T_doc', database_source: datasetId, table: 'COMMANDES', column, evidence: [] } } });
    const first = await real.applyDraftOps(projectId, { expectedRevision: 0, ops: [{ op: 'upsertRecord', record: { kind: 'term', body: term } }, map('M_doc', 'no_transaction'), map('M_ancienne', 'ancienne')] }, { userId });
    expect(first.validation.errors.map((e) => e.path)).toEqual(['records.M_ancienne.column']);
    await expect(real.publish(projectId, { expectedRevision: 1, summary: 'v0', limitations: [], questionLinks: {} }, { userId }))
      .rejects.toMatchObject({ code: 'SEM_VALIDATION_FAILED' });
    await real.applyDraftOps(projectId, { expectedRevision: 1, ops: [{ op: 'setLifecycle', recordId: 'M_ancienne', lifecycle: 'superseded' }] }, { userId });
    await expect(real.publish(projectId, { expectedRevision: 2, summary: 'v0', limitations: [], questionLinks: {} }, { userId }))
      .resolves.toMatchObject({ version: 'v0' });
  });

  it('buildSemanticsServices gives the store and the port', async () => {
    const { semantics, semanticsPort } = buildSemanticsServices({ db });
    expect(semantics).toBeInstanceOf(SemanticStore);
    expect(await semanticsPort.activeVersion(projectId)).toBeNull();
  });

  it('workload and trajectories', async () => {
    const workload = await store.setWorkload(projectId, { goal: 'Retours', questions: [
      { id: 'Q02', text: 'Quelle cuisine est surchargée ?', source: 'user', picked: false },
      { id: 'Q01', text: 'Quels magasins retournent le plus ?', useCase: 'commerce', source: 'proposed', picked: true },
    ] });
    expect(workload.questions.map((q) => q.id)).toEqual(['Q01', 'Q02']);
    expect(workload.questions[0]!.useCase).toBe('commerce');

    const t = await store.appendTrajectory(projectId, {
      sessionId: '', question: 'Top 5 ?', semVersion: 'v0', answer: 'C0012', status: 'answered',
      semanticCalls: [{ tool: 'resolve_semantics', input: { mentions: ['taux de retour'] }, result: { ok: true } }], toolCalls: [],
    });
    expect(t).toMatchObject({ sessionId: '', semVersion: 'v0', status: 'answered' });
    expect(await store.countTrajectoriesSince(projectId)).toBe(1);
    expect(await store.countTrajectoriesSince(projectId, new Date(Date.now() + 60_000))).toBe(0);
    expect((await store.listTrajectories(projectId))[0]!.semanticCalls[0]!.tool).toBe('resolve_semantics');
  });
});
