import type { LogicDef, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withReadOnly } from '../src/db/readonly.js';
import { buildLogicViews } from '../src/modules/logic/service.js';
import { stubSemanticsPort } from '../src/ports.js';
import { logicTestDoc } from './fixtures/logic-doc.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// L1, L2 and the logic part of O1 (07-acceptance-tests) on small hand-made tables and ont.* views,
// standing in for what T-14 publish creates.

let t: TestApp;
let projectId: string;
let hadDraft: boolean;

const SETUP = `
  DROP VIEW IF EXISTS logic.lg_client, logic.lg_commande, logic.lg_cuisine_jour, logic.lg_lot;
  DROP VIEW IF EXISTS ont.lg_client, ont.lg_commande, ont.lg_cuisine_jour, ont.lg_lot;
  DROP TABLE IF EXISTS data.lg_client_src, data.lg_commande_src, data.lg_cuisine_jour_src, data.lg_lot_src;

  CREATE TABLE data.lg_client_src (client_id text PRIMARY KEY, nom text);
  INSERT INTO data.lg_client_src VALUES ('C001','Un'),('C002','Deux'),('C003','Trois'),('C004','Sans commande');
  CREATE TABLE data.lg_commande_src (commande_id text PRIMARY KEY, client_id text, statut text, montant double precision);
  INSERT INTO data.lg_commande_src VALUES
    ('SO-1','C001','livree',10),('SO-2','C001','livree',20),('SO-3','C001','livree',30),('RMA-1','C001','retournee',-10),
    ('SO-4','C002','livree',15),('SO-5','C002','livree',25),
    ('RMA-2','C003','retournee',-5);
  CREATE TABLE data.lg_cuisine_jour_src (cle text PRIMARY KEY, lieu text, jour date, capacite integer);
  INSERT INTO data.lg_cuisine_jour_src VALUES
    ('Frepillon|2025-10-14','Frepillon','2025-10-14',100),
    ('Gennevilliers|2025-10-14','Gennevilliers','2025-10-14',200),
    ('Gennevilliers|2025-10-15','Gennevilliers','2025-10-15',50);
  CREATE TABLE data.lg_lot_src (lot_id text PRIMARY KEY, lieu text, jour date, quantite integer);
  INSERT INTO data.lg_lot_src VALUES
    ('L1','Frepillon','2025-10-14',60),('L2','Frepillon','2025-10-14',50),('L3','Gennevilliers','2025-10-14',80);

  CREATE VIEW ont.lg_client AS SELECT client_id, nom FROM data.lg_client_src;
  CREATE VIEW ont.lg_commande AS SELECT commande_id, client_id, statut, montant FROM data.lg_commande_src;
  CREATE VIEW ont.lg_cuisine_jour AS SELECT cle, lieu, jour, capacite FROM data.lg_cuisine_jour_src;
  CREATE VIEW ont.lg_lot AS SELECT lot_id, lieu, jour, quantite FROM data.lg_lot_src;
`;

function fullDoc(logic?: LogicDef[]): WorkspaceDoc {
  const d = logicTestDoc();
  return { semanticVersion: 'v0', pipelines: [], actionTypes: [], apps: [], automations: [], ...d, logic: logic ?? d.logic };
}

beforeAll(async () => {
  t = await buildTestApp();
  await t.app.ready();
  projectId = (await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow()).id;
  // As publish does: everything in data/ont/logic owned by mini_app, so mini_reader gets SELECT by default privileges.
  await t.db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE mini_app`.execute(trx);
    await sql.raw(SETUP).execute(trx);
    await buildLogicViews(trx, logicTestDoc());
  });
  hadDraft = (await sql`SELECT 1 FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(t.db)).rows.length > 0;
});

afterAll(async () => {
  if (!hadDraft) await sql`DELETE FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(t.db);
  await t.close();
});

async function setDraft(doc: WorkspaceDoc): Promise<void> {
  await sql`
    INSERT INTO meta.workspace_drafts (project_id, sem_version, doc)
    VALUES (${projectId}, 'v0', ${JSON.stringify(doc)}::jsonb)
    ON CONFLICT (project_id) DO UPDATE SET doc = EXCLUDED.doc`.execute(t.db);
}

describe('T-18 logic views', () => {
  it('L1: tauxRetour = returned ÷ delivered, NULL without delivered orders', async () => {
    const got = await withReadOnly({ timeoutMs: 5000 }, (db) =>
      sql<{ client_id: string; taux_retour: number | null }>`
        SELECT client_id, taux_retour FROM logic.lg_client ORDER BY client_id`.execute(db),
    );
    const byHand = await sql<{ client_id: string; taux: number | null }>`
      SELECT c.client_id,
             count(*) FILTER (WHERE o.statut = 'retournee')::double precision
               / NULLIF(count(*) FILTER (WHERE o.statut = 'livree'), 0) AS taux
      FROM data.lg_client_src c LEFT JOIN data.lg_commande_src o ON o.client_id = c.client_id
      GROUP BY c.client_id ORDER BY c.client_id`.execute(t.db);
    expect(got.rows.map((r) => [r.client_id, r.taux_retour])).toEqual(byHand.rows.map((r) => [r.client_id, r.taux]));
    expect(got.rows.find((r) => r.client_id === 'C001')!.taux_retour).toBeCloseTo(1 / 3);
    expect(got.rows.find((r) => r.client_id === 'C003')!.taux_retour).toBeNull(); // returns but no deliveries
    expect(got.rows.find((r) => r.client_id === 'C004')!.taux_retour).toBeNull(); // no orders at all
  });

  it('L2: surcharge is true for Frepillon on 2025-10-14 and false for Gennevilliers', async () => {
    const rows = await withReadOnly({ timeoutMs: 5000 }, (db) =>
      sql<{ cle: string; charge: string; surcharge: boolean }>`
        SELECT cle, charge, surcharge FROM logic.lg_cuisine_jour ORDER BY cle`.execute(db),
    );
    expect(rows.rows).toEqual([
      { cle: 'Frepillon|2025-10-14', charge: '110', surcharge: true },
      { cle: 'Gennevilliers|2025-10-14', charge: '80', surcharge: false },
      { cle: 'Gennevilliers|2025-10-15', charge: '0', surcharge: false },
    ]);
  });

  it('O1 (logic part): filter on a rule and sort by a derived property', async () => {
    const rows = await withReadOnly({ timeoutMs: 5000 }, (db) =>
      sql<{ cle: string }>`SELECT cle FROM logic.lg_cuisine_jour WHERE surcharge ORDER BY charge DESC`.execute(db),
    );
    expect(rows.rows.map((r) => r.cle)).toEqual(['Frepillon|2025-10-14']);
    const sorted = await withReadOnly({ timeoutMs: 5000 }, (db) =>
      sql<{ cle: string }>`SELECT cle FROM logic.lg_cuisine_jour ORDER BY charge DESC`.execute(db),
    );
    expect(sorted.rows.map((r) => r.cle)).toEqual(['Frepillon|2025-10-14', 'Gennevilliers|2025-10-14', 'Gennevilliers|2025-10-15']);
  });

  it('logic sits on ont: an edit of a key shows up immediately', async () => {
    const rollback = new Error('rollback');
    await expect(
      t.db.transaction().execute(async (trx) => {
        await sql`UPDATE data.lg_lot_src SET lieu = 'Gennevilliers' WHERE lot_id = 'L2'`.execute(trx);
        const r = await sql<{ cle: string; surcharge: boolean }>`
          SELECT cle, surcharge FROM logic.lg_cuisine_jour WHERE lieu = 'Frepillon'`.execute(trx);
        expect(r.rows).toEqual([{ cle: 'Frepillon|2025-10-14', surcharge: false }]);
        throw rollback; // undo the change
      }),
    ).rejects.toBe(rollback);
    const after = await sql<{ lieu: string }>`SELECT lieu FROM data.lg_lot_src WHERE lot_id = 'L2'`.execute(t.db);
    expect(after.rows[0]!.lieu).toBe('Frepillon');
  });

  it('refuses to build views from invalid logic', async () => {
    const doc = logicTestDoc();
    doc.logic.push({ apiName: 'oops', objectType: 'LgLot', displayName: 'o', description: 'o', kind: 'derived', type: 'integer', expr: { property: 'nope' } });
    await expect(t.db.transaction().execute((trx) => buildLogicViews(trx, doc))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('test_logic on the draft', () => {
  it('POST …/draft/logic/test evaluates draft logic on published objects', async () => {
    // Draft differs from what's published: the threshold of retoursEleves is lower.
    const logic = logicTestDoc().logic.map((l) =>
      l.apiName === 'retoursEleves' ? { ...l, condition: { kind: 'cmp' as const, property: 'tauxRetour', op: 'gt' as const, value: 0.2 } } : l,
    );
    await setDraft(fullDoc(logic));
    const cookie = await loginAs(t.app, 'ben@kumo.test'); // viewers may test (read-only)
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/workspace/draft/logic/test`,
      headers: { cookie },
      payload: { objectType: 'LgClient', apiNames: ['tauxRetour', 'retoursEleves', 'nom'], primaryKeys: ['C001', 'C004'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toEqual([]);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].ref).toEqual({ objectType: 'LgClient', primaryKey: 'C001' });
    expect(body.rows[0].values.tauxRetour).toBeCloseTo(1 / 3);
    expect(body.rows[0].values.retoursEleves).toBe(true);
    expect(body.rows[1].values).toEqual({ tauxRetour: null, retoursEleves: false, nom: 'Sans commande' });
  });

  it('reports draft errors instead of running', async () => {
    const logic: LogicDef[] = [
      ...logicTestDoc().logic,
      { apiName: 'cassé', objectType: 'LgClient', displayName: 'c', description: 'c', kind: 'derived', type: 'integer', expr: { property: 'nope' } },
    ];
    await setDraft(fullDoc(logic));
    const cookie = await loginAs(t.app, 'ada@kumo.test');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/workspace/draft/logic/test`,
      headers: { cookie },
      payload: { objectType: 'LgClient', apiNames: ['cassé'] },
    });
    expect(res.json().errors.map((e: { code: string }) => e.code)).toEqual(['BAD_API_NAME', 'UNKNOWN_REFERENCE']);
    // Unrelated logic still tests fine.
    const ok = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/workspace/draft/logic/test`,
      headers: { cookie },
      payload: { objectType: 'LgCuisineJour', apiNames: ['charge', 'surcharge'], limit: 5 },
    });
    expect(ok.json().errors).toEqual([]);
    expect(ok.json().rows).toHaveLength(3);
  });

  it('the test_logic tool returns rows, or the error as a result', async () => {
    await setDraft(fullDoc());
    const tool = t.ctx.tools.get('test_logic')!;
    expect(tool.risk).toBe('draft');
    const user = (await t.ctx.services.resources.getUserByEmail('ada@kumo.test'))!;
    const toolCtx = { user, projectId, sessionId: '00000000-0000-4000-8000-000000000001', mode: 'build' as const, services: t.ctx.services, semantics: stubSemanticsPort };
    const input = tool.input.parse({
      objectType: 'LgCuisineJour',
      apiNames: ['surcharge'],
      primaryKeys: ['Frepillon|2025-10-14'],
      rationale: { title: 'Check the over-capacity rule', why: 'Make sure Frepillon is flagged on 14 October.' },
    });
    const res = await tool.run(input, toolCtx);
    expect(res).toMatchObject({ ok: true, result: [{ ref: { primaryKey: 'Frepillon|2025-10-14' }, values: { surcharge: true } }] });

    const bad = await tool.run({ ...input, objectType: 'Nope' }, toolCtx);
    expect(bad).toMatchObject({ ok: false, code: 'UNKNOWN_REFERENCE' });
  });
});
