import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishDraftTool } from '../src/agent/tools/publish_draft.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { withReadOnly } from '../src/db/readonly.js';
import { createPublishService, editsSql, PUBLISH_LOCK_KEY, type PublishProgress } from '../src/modules/workspace/publish.js';
import { docToOps } from '../src/modules/workspace/ops.js';
import { stubSemanticsPort } from '../src/ports.js';
import { DS, kumoWorkspace } from './fixtures/workspace-kumo.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// T-14: publish (W4, W5, W6) on a small Kumo-shaped world, through the API and the agent tool.

let t: TestApp;
let pid: string;
let adaId: string;
let ada: string;
let ben: string;
const rationale = { title: 'Test', why: 'Test' };
const TABLES = ['data.ds_pubt_lines_v1', 'data.ds_pubt_lines_v2', 'data.ds_pubt_clients_v1', 'data.ds_pubt_cap_v1'];
const TYPES = ['commande', 'client', 'lot_production', 'cuisine_jour'];

// 4 orders (SO-1..SO-4), 2 returns; lots are lines with a kitchen. Kitchen-days: 2 kitchens x 2 days.
const LINES = `
  ('SO-1','C1','2025-08-01',2,'Frepillon','A'), ('SO-1','C1','2025-08-01',1,'Frepillon','B'),
  ('SO-2','C2','2025-08-01',5,'Gennevilliers','A'), ('SO-3','C1','2025-08-02',3,'Frepillon','A'),
  ('SO-4','C2','2025-08-02',4,'Gennevilliers','B'), ('RMA-1','C1','2025-08-03',-1,NULL,'A'), ('RMA-2','C2','2025-08-03',-2,NULL,'A')`;
const LINE_COLS =
  'no_transaction text, id_interne_client_netsuite text, date date, quantite integer, lieu_production text, article text';

const LINE_TYPES: [string, string][] = [['no_transaction', 'string'], ['id_interne_client_netsuite', 'string'], ['date', 'date'], ['quantite', 'integer'], ['lieu_production', 'string'], ['article', 'string']];

async function dropAll() {
  for (const v of TYPES) {
    await sql.raw(`DROP VIEW IF EXISTS logic.${v} CASCADE`).execute(t.db);
    await sql.raw(`DROP VIEW IF EXISTS ont.${v} CASCADE`).execute(t.db);
    await sql.raw(`DROP TABLE IF EXISTS edits.${v} CASCADE`).execute(t.db);
  }
  const pl = await sql<{ table_name: string }>`SELECT table_name FROM meta.pipeline_builds WHERE project_id = ${pid}`.execute(t.db);
  for (const r of pl.rows) await sql.raw(`DROP TABLE IF EXISTS ${r.table_name}`).execute(t.db);
  await t.db.deleteFrom('meta.pipeline_builds').where('project_id', '=', pid).execute();
  await t.db.deleteFrom('meta.workspace_versions').where('project_id', '=', pid).execute();
  await t.db.deleteFrom('meta.workspace_drafts').where('project_id', '=', pid).execute();
  await t.db.deleteFrom('meta.datasets').where('id', 'in', Object.values(DS)).execute();
  for (const tb of TABLES) await sql.raw(`DROP TABLE IF EXISTS ${tb}`).execute(t.db);
}

async function addDataset(id: string, name: string, shortId: string, tables: { version: number; table: string; columns: string; rows: string; cols: [string, string][] }[]) {
  await t.db
    .insertInto('meta.datasets')
    .values({ id, project_id: pid, short_id: shortId, name, current_version: 1, created_by: adaId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  for (const v of tables) {
    // As the upload code creates them: under mini_app, so the default privileges give mini_reader access.
    await t.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL ROLE mini_app`.execute(trx);
      await sql.raw(`CREATE TABLE ${v.table} (${v.columns})`).execute(trx);
      await sql.raw(`INSERT INTO ${v.table} VALUES ${v.rows}`).execute(trx);
    });
    await t.db
      .insertInto('meta.dataset_versions')
      .values({
        dataset_id: id,
        version: v.version,
        transaction_type: 'SNAPSHOT',
        table_name: v.table,
        row_count: 12,
        columns: JSON.stringify(v.cols.map(([c, type]) => ({ name: c, sqlName: c, type, nullable: true, sample: [] }))),
        source_file: 'test',
        created_by: adaId,
      })
      .execute();
  }
}


beforeAll(async () => {
  t = await buildTestApp();
  const p = await t.db.selectFrom('meta.projects').select(['id', 'created_by']).where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  pid = p.id;
  adaId = p.created_by;
  await dropAll();
  await addDataset(DS.commandes, 'pubt_lines', 'pubtline', [
    { version: 1, table: 'data.ds_pubt_lines_v1', columns: LINE_COLS, rows: LINES, cols: LINE_TYPES },
    { version: 2, table: 'data.ds_pubt_lines_v2', columns: LINE_COLS, rows: `${LINES}, ('SO-5','C1','2025-08-02',7,'Frepillon','A')`, cols: LINE_TYPES },
  ]);
  await addDataset(DS.clients, 'pubt_clients', 'pubtclie', [
    { version: 1, table: 'data.ds_pubt_clients_v1', columns: 'id_interne text, nom text, zone text, actif boolean', rows: `('C1','Magasin A','Nord',true), ('C2','Magasin B','Sud',true), ('C3','Magasin C','Sud',false)`, cols: [['id_interne', 'string'], ['nom', 'string'], ['zone', 'string'], ['actif', 'boolean']] },
  ]);
  await addDataset(DS.capacite, 'pubt_cap', 'pubtcapa', [
    { version: 1, table: 'data.ds_pubt_cap_v1', columns: 'cle text, cuisine text, date date, service text, capacite integer', rows: `('F|08-01','Frepillon','2025-08-01','midi',20), ('F|08-02','Frepillon','2025-08-02','midi',20), ('G|08-01','Gennevilliers','2025-08-01','midi',20), ('G|08-02','Gennevilliers','2025-08-02','midi',20)`, cols: [['cle', 'string'], ['cuisine', 'string'], ['date', 'date'], ['service', 'string'], ['capacite', 'integer']] },
  ]);
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
  // The draft is the Kumo document, valid on this data.
  const draft = await t.ctx.services.workspace.getDraft(pid);
  const patched = await t.ctx.services.workspace.patchDraft(pid, adaId, draft.revision, docToOps(kumoWorkspace()));
  expect(patched.validation.errors).toEqual([]);
});

afterAll(async () => {
  await dropAll();
  await t.close();
});

const revision = async () => (await t.ctx.services.workspace.getDraft(pid)).revision;
const publishHttp = (cookie: string, body: object) =>
  t.app.inject({ method: 'POST', url: `/api/projects/${pid}/workspace/publish`, headers: { cookie }, payload: body });
const count = async (q: string) => Number((await sql<{ n: string }>`${sql.raw(q)}`.execute(t.db)).rows[0]!.n);

describe('publish (W4, W5, W6)', () => {
  it('refuses a viewer', async () => {
    const res = await publishHttp(ben, { expectedRevision: await revision(), message: 'no' });
    expect(res.statusCode).toBe(403);
  });

  it('W5: a stale expectedRevision is VERSION_CONFLICT and nothing changes', async () => {
    const before = await revision();
    const res = await publishHttp(ada, { expectedRevision: before - 1, message: 'stale' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('VERSION_CONFLICT');
    expect(await revision()).toBe(before);
    expect(await count(`SELECT count(*) AS n FROM meta.workspace_versions WHERE project_id = '${pid}'`)).toBe(0);
  });

  it('refuses a draft with validation errors (nothing built)', async () => {
    const doc = kumoWorkspace();
    doc.objectTypes[0]!.description = '';
    const rev = await revision();
    await t.ctx.services.workspace.patchDraft(pid, adaId, rev, docToOps(doc));
    const res = await publishHttp(ada, { expectedRevision: rev + 1, message: 'broken' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ code: 'MISSING_DESCRIPTION' })] });
    expect(await count(`SELECT count(*) AS n FROM meta.pipeline_builds WHERE project_id = '${pid}'`)).toBe(0);
    await t.ctx.services.workspace.patchDraft(pid, adaId, rev + 1, docToOps(kumoWorkspace()));
  });

  it('a running publish makes the next one fail with PUBLISH_IN_PROGRESS', async () => {
    const client = await t.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [PUBLISH_LOCK_KEY]);
      const res = await publishHttp(ada, { expectedRevision: await revision(), message: 'locked' });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('PUBLISH_IN_PROGRESS');
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [PUBLISH_LOCK_KEY]);
      client.release();
    }
    expect(await count(`SELECT count(*) AS n FROM meta.workspace_versions WHERE project_id = '${pid}'`)).toBe(0);
  });

  it('W4: builds tables, creates ont and logic views, indexes, comments; reports progress', async () => {
    const events: PublishProgress[] = [];
    const unsubscribe = t.ctx.services.publish.onProgress((p, ev) => p === pid && events.push(ev));
    const res = await publishHttp(ada, { expectedRevision: await revision(), message: 'First publish' });
    unsubscribe();
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.version).toBe(1);
    expect(body.builds).toHaveLength(2); // one per pipeline output
    expect(body.builds.map((b: { status: string }) => b.status)).toEqual(['built', 'built']);
    expect(events.map((e) => e.step)).toEqual(expect.arrayContaining(['Building pipeline commandes', 'Published']));

    expect(await count('SELECT count(*) AS n FROM ont.commande')).toBe(4);
    expect(await count('SELECT count(*) AS n FROM ont.client')).toBe(3);
    expect(await count(`SELECT count(*) AS n FROM meta.pipeline_builds WHERE project_id = '${pid}' AND status = 'built'`)).toBe(2);
    // derived property and rule exist and are right: Client C1 has 2 orders; Frepillon on 08-01 carries 3 meals.
    expect(await count(`SELECT nb_commandes AS n FROM logic.client WHERE client_id = 'C1'`)).toBe(2);
    expect(await count(`SELECT charge AS n FROM logic.cuisine_jour WHERE cle = 'F|08-01'`)).toBe(3);
    // indexes on the primary key of a pipeline output
    expect(await count(`SELECT count(*) AS n FROM pg_indexes WHERE schemaname = 'data' AND tablename LIKE 'pl_commandes_commandes_v%'`)).toBeGreaterThan(0);
    // comments carry the description
    const c = await sql<{ d: string }>`SELECT obj_description('ont.commande'::regclass) AS d`.execute(t.db);
    expect(c.rows[0]!.d).toContain('sales order');
    // mini_reader can read what was created
    const rows = await withReadOnly({ timeoutMs: 5000 }, (db) => sql<{ n: string }>`SELECT count(*) AS n FROM logic.cuisine_jour`.execute(db));
    expect(Number(rows.rows[0]!.n)).toBe(4);
  });

  it('W5: history lists the version with message, user, via and semantic version', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace/history`, headers: { cookie: ben } });
    expect(res.json()).toEqual([expect.objectContaining({ version: 1, message: 'First publish', semVersion: 'v0', via: 'ui', publishedBy: expect.any(String) })]);
    const draft = await t.ctx.services.workspace.getDraft(pid);
    expect(draft.baseVersion).toBe(1);
  });

  it('W6: the two-key link joins every production lot to one kitchen-day', async () => {
    const lots = await count('SELECT count(*) AS n FROM ont.lot_production');
    const joined = await count(
      'SELECT count(*) AS n FROM ont.lot_production l JOIN ont.cuisine_jour c ON c.cuisine = l.lieu_production AND c.date = l.date_production',
    );
    expect(lots).toBeGreaterThan(0);
    expect(joined).toBe(lots);
  });

  it('W4: publishing again with unchanged inputs builds nothing (up to date)', async () => {
    const res = await publishHttp(ada, { expectedRevision: await revision(), message: 'Again' });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(2);
    expect(res.json().builds.map((b: { status: string }) => b.status)).toEqual(['upToDate', 'upToDate']);
    expect(await count(`SELECT count(DISTINCT table_name) AS n FROM meta.pipeline_builds WHERE project_id = '${pid}'`)).toBe(2);
  });

  it('edits survive a rebuild on a new dataset version; big old versions are dropped (retention)', async () => {
    // an action-like edit: lot SO-1 moves to Gennevilliers
    await sql`INSERT INTO edits.lot_production (pk, lieu_production, _edited_by) VALUES ('SO-1', 'Gennevilliers', 'test')`.execute(t.db);
    expect(await count(`SELECT count(*) AS n FROM ont.lot_production WHERE lot_id = 'SO-1' AND lieu_production = 'Gennevilliers'`)).toBe(1);

    await t.db.updateTable('meta.datasets').set({ current_version: 2 }).where('id', '=', DS.commandes).execute();
    const publish = createPublishService({
      db: t.db,
      config: t.ctx.config,
      workspace: t.ctx.services.workspace,
      pipelines: t.ctx.services.pipelines,
      semantics: stubSemanticsPort,
      retentionRows: 5, // the test datasets have 12 rows
    });
    const res = await publish.publish({ projectId: pid, userId: adaId, via: 'ui', expectedRevision: await revision(), message: 'New upload' });
    expect(res.builds.map((b) => b.status)).toEqual(['built', 'built']);
    expect(await count('SELECT count(*) AS n FROM ont.commande')).toBe(5);
    expect(await count(`SELECT count(*) AS n FROM ont.lot_production WHERE lot_id = 'SO-1' AND lieu_production = 'Gennevilliers'`)).toBe(1);

    // the previous version of the big dataset is gone, its metadata row stays
    const gone = await sql<{ t: string | null }>`SELECT to_regclass('data.ds_pubt_lines_v1')::text AS t`.execute(t.db);
    expect(gone.rows[0]!.t).toBeNull();
    const meta = await t.db.selectFrom('meta.dataset_versions').select('dropped_at').where('dataset_id', '=', DS.commandes).where('version', '=', 1).executeTakeFirstOrThrow();
    expect(meta.dropped_at).not.toBeNull();
  });
});

describe('edits tables', () => {
  it('converts an edited column when its property changes type, keeping the edits', async () => {
    const type = (t2: 'string' | 'integer') => ({
      apiName: 'EditsTypeProbe',
      primaryKey: 'id',
      properties: [
        { apiName: 'id', type: 'string', column: 'id' },
        { apiName: 'qty', type: t2, column: 'qty', editable: true },
      ],
    }) as never;
    await sql`DROP TABLE IF EXISTS edits.edits_type_probe`.execute(t.db);
    try {
      for (const s of editsSql(type('string'))) await sql.raw(s).execute(t.db);
      await sql`INSERT INTO edits.edits_type_probe (pk, _edited_by, qty) VALUES ('a', 'test', '42')`.execute(t.db);
      for (const s of editsSql(type('integer'))) await sql.raw(s).execute(t.db);
      const col = await sql<{ t: string }>`SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute
        WHERE attrelid = 'edits.edits_type_probe'::regclass AND attname = 'qty'`.execute(t.db);
      expect(col.rows[0]?.t).toBe('bigint');
      const row = await sql<{ qty: string }>`SELECT qty FROM edits.edits_type_probe WHERE pk = 'a'`.execute(t.db);
      expect(Number(row.rows[0]?.qty)).toBe(42);
      // Same type again: nothing to convert.
      for (const s of editsSql(type('integer'))) await sql.raw(s).execute(t.db);
    } finally {
      await sql`DROP TABLE IF EXISTS edits.edits_type_probe`.execute(t.db);
    }
  });
});

describe('publish_draft tool', () => {
  const ctx = (): ToolContext => ({
    user: { id: adaId, email: 'ada@kumo.test', displayName: 'Ada' },
    projectId: pid,
    sessionId: 's',
    mode: 'build',
    services: t.ctx.services,
    semantics: stubSemanticsPort,
  });

  it('is gated, build mode only, with a plain-language approval summary', async () => {
    expect(publishDraftTool).toMatchObject({ name: 'publish_draft', risk: 'gated', modes: ['build'] });
    const text = await publishDraftTool.summarize!({ rationale, expectedRevision: 0, message: 'x' }, ctx());
    expect(text).toMatch(/^Publish 2 pipelines, 4 object types, 2 links, 3 logic items and 1 action/);
  });

  it('publishes via the agent and records via=agent; a stale revision comes back as a tool error', async () => {
    const stale = await publishDraftTool.run({ rationale, expectedRevision: 0, message: 'stale' }, ctx());
    expect(stale).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });

    const ok = await publishDraftTool.run({ rationale, expectedRevision: await revision(), message: 'By the agent' }, ctx());
    expect(ok).toMatchObject({ ok: true, summary: expect.stringMatching(/^Published version 4/) });
    const last = await t.db.selectFrom('meta.workspace_versions').select(['published_via', 'message']).where('project_id', '=', pid).orderBy('version', 'desc').executeTakeFirstOrThrow();
    expect(last).toEqual({ published_via: 'agent', message: 'By the agent' });
  });
});
