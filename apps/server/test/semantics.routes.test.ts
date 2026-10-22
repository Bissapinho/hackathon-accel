import type { SemOp } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// T-09: semantics routes (04-api §1 "Semantics (stage 2)"), S1–S5 through the API.
// The access tests use the seeded project "Kumo 2025" (ada owner, ben viewer); the bank flows each get a
// fresh project with the same two members and one dataset, so publishing never touches the seeded
// project and tests don't depend on each other's order.

let t: TestApp;
let ada: string;
let ben: string;
let adaId: string;
let benId: string;
let seededId: string;

type Fresh = { pid: string; datasetId: string };

async function freshProject(): Promise<Fresh> {
  const tag = Math.random().toString(36).slice(2, 10).padEnd(8, '0').slice(0, 8);
  const p = await sql<{ id: string }>`INSERT INTO meta.projects (name, created_by) VALUES (${`t09 ${tag}`}, ${adaId}) RETURNING id`.execute(t.db);
  const pid = p.rows[0]!.id;
  await sql`INSERT INTO meta.project_members (project_id, user_id, role) VALUES (${pid}, ${adaId}, 'owner'), (${pid}, ${benId}, 'viewer')`.execute(t.db);
  const ds = await sql<{ id: string }>`INSERT INTO meta.datasets (project_id, short_id, name, current_version, created_by)
    VALUES (${pid}, ${tag}, 'COMMANDES', 1, ${adaId}) RETURNING id`.execute(t.db);
  const datasetId = ds.rows[0]!.id;
  const columns = JSON.stringify(['no_transaction', 'quantite'].map((n) => ({ name: n, sqlName: n, type: 'string', nullable: true, sample: [] })));
  await sql`INSERT INTO meta.dataset_versions (dataset_id, version, transaction_type, table_name, row_count, columns, source_file, created_by)
    VALUES (${datasetId}, 1, 'SNAPSHOT', ${`data.ds_${tag}_v1`}, 0, ${columns}::jsonb, 'x.csv', ${adaId})`.execute(t.db);
  return { pid, datasetId };
}

const url = (pid: string, path = '') => `/api/projects/${pid}/semantics${path}`;
const get = (pid: string, path: string, cookie = ada) => t.app.inject({ method: 'GET', url: url(pid, path), headers: { cookie } });
const send = (method: 'POST' | 'PUT' | 'PATCH', pid: string, path: string, body: unknown, cookie = ada) =>
  t.app.inject({ method, url: url(pid, path), payload: body as object, headers: { cookie } });
const patch = (pid: string, expectedRevision: number, ops: SemOp[], cookie = ada) => send('PATCH', pid, '/draft', { expectedRevision, ops }, cookie);

const EVIDENCE_QUERY = 'SELECT count(*) AS n FROM generate_series(1, 3)';

/** A small publishable bank (once its decision is resolved): Retour (alias RMA), Taux de retour, mappings, evidence, an open decision. */
function bankOps(datasetId: string): SemOp[] {
  const term = (id: string, name: string, definition: string, aliases: string[]) =>
    ({ op: 'upsertRecord', record: { kind: 'term', body: { id, name, type: 'metric', definition, scope: '2025', aliases, evidence: ['E_rma'], status: 'enriched' } } }) as SemOp;
  const mapping = (id: string, termId: string, column: string) =>
    ({ op: 'upsertRecord', record: { kind: 'mapping', body: { id, term_id: termId, database_source: datasetId, table: 'COMMANDES', column, grain: 'one row per order line', evidence: ['E_rma'] } } }) as SemOp;
  return [
    { op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_rma', source: 'COMMANDES', query: EVIDENCE_QUERY, validation_method: 'count of rows', timestamp: '' } } },
    term('T_retour', 'Retour', 'A returned order line, with a negative quantity', ['RMA']),
    term('T_taux_retour', 'Taux de retour', 'Returned quantities divided by the chosen base', []),
    mapping('M_retour_no', 'T_retour', 'no_transaction'),
    mapping('M_taux_retour_qte', 'T_taux_retour', 'quantite'),
    { op: 'upsertRecord', record: { kind: 'constraint', body: {
      id: 'C_base', target: 'T_taux_retour', constraint_type: 'business_rule', trigger_keywords: ['taux de retour'], severity: 'block',
      confidence: 0.9, description: 'Measured on ordered or delivered quantities', options: ['ordered', 'delivered'], evidence: ['E_rma'],
    } } },
  ];
}

beforeAll(async () => {
  t = await buildTestApp();
  seededId = (await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow()).id;
  adaId = (await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow()).id;
  benId = (await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ben@kumo.test').executeTakeFirstOrThrow()).id;
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
});

afterAll(async () => {
  // Fresh projects (and their bank, by cascade) are removed so other files still see Ada with one project.
  await sql`DELETE FROM meta.projects WHERE name LIKE 't09 %'`.execute(t.db);
  await t.close();
});

describe('access (seeded project)', () => {
  it('needs a login', async () => {
    const res = await t.app.inject({ method: 'GET', url: url(seededId) });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('lets a viewer read but not write', async () => {
    for (const path of ['', '/records', '/workload', '/versions', '/trajectories']) {
      expect((await get(seededId, path, ben)).statusCode, path).toBe(200);
    }
    expect((await send('POST', seededId, '/browse', { query: 'retour' }, ben)).statusCode).toBe(200);
    expect((await send('POST', seededId, '/resolve', { mentions: ['retour'] }, ben)).statusCode).toBe(200);
    expect((await send('POST', seededId, '/draft/validate', {}, ben)).statusCode).toBe(200);

    const writes = [
      await patch(seededId, 0, [{ op: 'remove', recordId: 'T_t09_none' }], ben),
      await send('PUT', seededId, '/workload', { goal: 'x', questions: [] }, ben),
      await send('POST', seededId, '/publish', { expectedRevision: 0, summary: 'x', limitations: [] }, ben),
    ];
    for (const res of writes) {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN');
    }
  });

  it('validates inputs with zod', async () => {
    const res = await send('POST', seededId, '/browse', { query: 'retour', limit: 7 });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    expect((await get(seededId, '?version=latest')).json().code).toBe('VALIDATION_FAILED');
    expect((await send('POST', seededId, '/resolve', { mentions: ['a', 'b', 'c', 'd', 'e', 'f'] })).statusCode).toBe(400);
  });
});

describe('bank flows (fresh project each)', () => {
  let p: Fresh;
  beforeEach(async () => {
    p = await freshProject();
  });

  it('S1: reports SEM_BAD_REFERENCE, SEM_BAD_VOCABULARY and SEM_PROCEDURAL_CONTENT in the draft validation', async () => {
    const res = await patch(p.pid, 0, [
      { op: 'upsertRecord', record: { kind: 'term', body: { id: 'T_cmd', name: 'Commande', type: 'entity', definition: 'SELECT * FROM commandes', scope: '2025', aliases: [], evidence: [], status: 'enriched' } } },
      { op: 'upsertRecord', record: { kind: 'relation', body: { id: 'R_cmd_ghost', source: 'T_cmd', relation_type: 'association', target: 'T_ghost', description: 'An order has a ghost', evidence: [] } } },
      // A vocabulary error is reported by the engine, not refused by the route schema.
      { op: 'upsertRecord', record: { kind: 'relation', body: { id: 'R_cmd_self', source: 'T_cmd', relation_type: 'belongs_to', target: 'T_cmd', description: 'An order belongs to an order', evidence: [] } } } as unknown as SemOp,
    ]);
    expect(res.statusCode).toBe(200);
    const { revision, validation } = res.json();
    expect(revision).toBe(1);
    const byCode = (code: string) => validation.errors.filter((e: { code: string }) => e.code === code).map((e: { path: string }) => e.path);
    expect(byCode('SEM_BAD_REFERENCE')).toContain('records.R_cmd_ghost.target');
    expect(byCode('SEM_BAD_VOCABULARY')).toContain('records.R_cmd_self.relation_type');
    expect(byCode('SEM_PROCEDURAL_CONTENT')).toContain('records.T_cmd.definition');

    const again = await send('POST', p.pid, '/draft/validate', {});
    expect(again.statusCode).toBe(200);
    const sorted = (errs: { path: string }[]) => [...errs].sort((a, b) => a.path.localeCompare(b.path));
    expect(sorted(again.json().errors)).toEqual(sorted(validation.errors));
  });

  it('S2: stores the server-computed result of an evidence query; a write query is refused with SQL_REJECTED', async () => {
    const res = await patch(p.pid, 0, [{ op: 'upsertRecord', record: { kind: 'evidence', body: {
      id: 'E_count', source: 'COMMANDES', query: EVIDENCE_QUERY, validation_method: 'count', timestamp: '', result: 'written by the agent',
    } } }]);
    expect(res.statusCode).toBe(200);
    const records = (await get(p.pid, '/records?version=draft&kind=evidence')).json();
    expect(records).toHaveLength(1);
    expect(records[0].body.result).not.toBe('written by the agent');
    expect(records[0].body.result).toContain('3');
    expect(records[0].body.result).not.toMatch(/Query failed/);
    expect(records[0].body.timestamp).not.toBe('');

    const refused = await patch(p.pid, 1, [{ op: 'upsertRecord', record: { kind: 'evidence', body: {
      id: 'E_delete', source: 'COMMANDES', query: 'DELETE FROM meta.sem_records', validation_method: 'none', timestamp: '',
    } } }]);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'SQL_REJECTED', details: [{ path: 'ops[0].record.body.query', code: 'SQL_REJECTED' }] });
    expect((await get(p.pid, '?version=draft')).json()).toMatchObject({ revision: 1, counts: { evidence: 1 } });
  });

  it('S3: refuses an open block decision, then publishes v0 with resolution.by = the current user', async () => {
    expect((await patch(p.pid, 0, bankOps(p.datasetId))).json().validation.errors).toEqual([]);
    const open = await send('POST', p.pid, '/publish', { expectedRevision: 1, summary: 'Returns', limitations: [] });
    expect(open.statusCode).toBe(400);
    expect(open.json()).toMatchObject({ code: 'SEM_OPEN_DECISION', details: [expect.objectContaining({ path: 'records.C_base.resolution' })] });
    expect((await get(p.pid, '?version=draft')).json().counts.openDecisions).toBe(1);

    const resolved = await patch(p.pid, 1, [{ op: 'resolveConstraint', recordId: 'C_base', choice: 'delivered', note: 'Kumo bills on delivery' }]);
    expect(resolved.statusCode).toBe(200);
    const pub = await send('POST', p.pid, '/publish', { expectedRevision: 2, summary: 'Returns', limitations: ['Kitchen known from August'] });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().version).toBe('v0');

    const constraint = (await get(p.pid, '/records?version=v0&kind=constraint')).json()[0];
    expect(constraint.body.resolution).toMatchObject({ choice: 'delivered', by: adaId, at: expect.any(String) });
    expect((await get(p.pid, '')).json()).toMatchObject({
      version: 'v0', status: 'active', summary: 'Returns', limitations: ['Kitchen known from August'], publishedBy: adaId,
      counts: { terms: 2, mappings: 2, constraints: 1, openDecisions: 0, evidence: 1 },
    });
    expect((await get(p.pid, '/versions', ben)).json()).toEqual([
      { version: 'v0', status: 'active', summary: 'Returns', limitations: ['Kitchen known from August'], publishedBy: adaId, at: expect.any(String) },
    ]);
  });

  it('S4: browse ranks Retour first for "retour"; resolve returns mappings, the resolved constraint and its evidence', async () => {
    await patch(p.pid, 0, [...bankOps(p.datasetId), { op: 'resolveConstraint', recordId: 'C_base', choice: 'delivered' }]);
    expect((await send('POST', p.pid, '/publish', { expectedRevision: 1, summary: 'Returns', limitations: [] })).statusCode).toBe(200);

    const browse = await send('POST', p.pid, '/browse', { query: 'retour' }, ben);
    expect(browse.statusCode).toBe(200);
    expect(browse.json()[0]).toMatchObject({ id: 'T_retour', kind: 'term', name: 'Retour' });
    expect((await send('POST', p.pid, '/browse', { query: 'RMA', limit: 3 })).json()[0].id).toBe('T_retour');

    const resolve = await send('POST', p.pid, '/resolve', { mentions: ['taux de retour'], context: 'Which stores return the most?' }, ben);
    expect(resolve.statusCode).toBe(200);
    const [m] = resolve.json().mentions;
    expect(m.term.id).toBe('T_taux_retour');
    expect(m.mappings.map((x: { id: string }) => x.id)).toEqual(['M_taux_retour_qte']);
    expect(m.constraints).toEqual([expect.objectContaining({ id: 'C_base', resolution: expect.objectContaining({ choice: 'delivered', by: adaId }) })]);
    expect(m.evidence.map((x: { id: string }) => x.id)).toEqual(['E_rma']);

    // The draft can be read too, and an unknown version is NOT_FOUND.
    expect((await send('POST', p.pid, '/browse', { query: 'retour', version: 'draft' })).json()[0].id).toBe('T_retour');
    const missing = await send('POST', p.pid, '/resolve', { mentions: ['retour'], version: 'v9' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('NOT_FOUND');
  });

  it('S5: a published version is immutable; editing after publish starts a new draft', async () => {
    await patch(p.pid, 0, [...bankOps(p.datasetId), { op: 'resolveConstraint', recordId: 'C_base', choice: 'ordered' }]);
    await send('POST', p.pid, '/publish', { expectedRevision: 1, summary: 'First', limitations: [] });
    expect((await get(p.pid, '?version=draft')).json()).toMatchObject({ version: 'draft', status: 'draft', revision: 0 });

    const edit = await patch(p.pid, 0, [{ op: 'upsertRecord', record: { kind: 'term', body: {
      id: 'T_retour', name: 'Retour', type: 'metric', definition: 'A returned line, as recorded on the RMA', scope: '2025', aliases: ['RMA'], evidence: ['E_rma'], status: 'enriched',
    } } }]);
    expect(edit.statusCode).toBe(200);
    expect(edit.json().revision).toBe(1);

    const def = async (version: string) => (await get(p.pid, `/records?version=${version}&kind=term&q=T_retour`)).json()
      .find((r: { body: { id: string } }) => r.body.id === 'T_retour').body.definition;
    expect(await def('v0')).toBe('A returned order line, with a negative quantity');
    expect(await def('draft')).toBe('A returned line, as recorded on the RMA');
    expect(await def('active')).toBe('A returned order line, with a negative quantity');

    const v1 = await send('POST', p.pid, '/publish', { expectedRevision: 1, summary: 'Second', limitations: [] });
    expect(v1.json().version).toBe('v1');
    expect(await def('v0')).toBe('A returned order line, with a negative quantity');
    expect((await get(p.pid, '/versions')).json().map((v: { version: string; status: string }) => [v.version, v.status]))
      .toEqual([['v0', 'superseded'], ['v1', 'active']]);
  });

  it('refuses stale revisions with VERSION_CONFLICT and changes nothing', async () => {
    expect((await patch(p.pid, 0, bankOps(p.datasetId))).statusCode).toBe(200);
    const stale = await patch(p.pid, 0, [{ op: 'remove', recordId: 'T_retour' }]);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', hint: expect.stringContaining('revision 1') });
    const stalePublish = await send('POST', p.pid, '/publish', { expectedRevision: 5, summary: 'x', limitations: [] });
    expect(stalePublish.statusCode).toBe(409);
    expect((await get(p.pid, '/records?version=draft&kind=term')).json()).toHaveLength(2);

    const rejected = await patch(p.pid, 1, [{ op: 'remove', recordId: 'T_absent' }]);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().code).toBe('SEM_OPS_REJECTED');
    expect((await get(p.pid, '?version=draft')).json().revision).toBe(1);
  });

  it('NOT_FOUND for an unknown version; empty active bank before the first publish', async () => {
    for (const path of ['?version=v3', '/records?version=v3']) {
      const res = await get(p.pid, path);
      expect(res.statusCode, path).toBe(404);
      expect(res.json().code).toBe('NOT_FOUND');
    }
    expect((await send('POST', p.pid, '/browse', { query: 'retour', version: 'v0' })).statusCode).toBe(404);
    expect((await get(p.pid, '')).json().counts.terms).toBe(0);
    expect((await get(p.pid, '/records')).json()).toEqual([]);
  });

  it('records filters by kind, text and limit', async () => {
    await patch(p.pid, 0, bankOps(p.datasetId));
    const all = (await get(p.pid, '/records?version=draft')).json();
    expect(all).toHaveLength(6);
    expect((await get(p.pid, '/records?version=draft&kind=mapping')).json().map((r: { kind: string }) => r.kind)).toEqual(['mapping', 'mapping']);
    expect((await get(p.pid, '/records?version=draft&q=rma')).json().map((r: { body: { id: string } }) => r.body.id)).toEqual(['E_rma', 'T_retour']);
    expect((await get(p.pid, '/records?version=draft&limit=2')).json()).toHaveLength(2);
  });

  it('workload: PUT replaces it, GET reads it; links to picked questions drive SEM_UNCOVERED_QUESTION', async () => {
    const workload = {
      goal: 'See where returns cost money',
      questions: [
        { id: 'Q01', text: 'Which stores return the most?', source: 'proposed', picked: true },
        { id: 'Q02', text: 'Which products?', useCase: 'buying', source: 'user', picked: false },
      ],
    };
    const put = await send('PUT', p.pid, '/workload', workload);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(workload);
    expect((await get(p.pid, '/workload', ben)).json()).toEqual(workload);

    const dup = await send('PUT', p.pid, '/workload', { goal: 'x', questions: [workload.questions[0], workload.questions[0]] });
    expect(dup.statusCode).toBe(400);

    await patch(p.pid, 0, [...bankOps(p.datasetId), { op: 'resolveConstraint', recordId: 'C_base', choice: 'delivered' }]);
    const uncovered = (await send('POST', p.pid, '/draft/validate', {})).json();
    expect(uncovered.warnings.map((w: { code: string }) => w.code)).toContain('SEM_UNCOVERED_QUESTION');
    const covered = (await send('POST', p.pid, '/draft/validate', { questionLinks: { Q01: ['T_taux_retour'] } })).json();
    expect(covered.warnings.map((w: { code: string }) => w.code)).not.toContain('SEM_UNCOVERED_QUESTION');

    const pub = await send('POST', p.pid, '/publish', { expectedRevision: 1, summary: 'Returns', limitations: [], questionLinks: { Q01: ['T_taux_retour'] } });
    expect(pub.statusCode).toBe(200);
    expect((await get(p.pid, '')).json().questionLinks).toEqual({ Q01: ['T_taux_retour'] });
  });

  it('trajectories: newest first, limited', async () => {
    for (const question of ['first', 'second']) {
      await t.ctx.services.semantics.appendTrajectory(p.pid, {
        sessionId: '', question, semVersion: 'v0', semanticCalls: [], toolCalls: [], answer: 'ok', status: 'answered',
      });
    }
    const res = await get(p.pid, '/trajectories?limit=1', ben);
    expect(res.statusCode).toBe(200);
    expect(res.json().map((x: { question: string }) => x.question)).toEqual(['second']);
    expect((await get(p.pid, '/trajectories')).json()).toHaveLength(2);
    expect((await get(p.pid, '/trajectories?limit=0')).statusCode).toBe(400);
  });
});
