import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatasetVersion } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDataset } from '../src/agent/tools/get_dataset.js';
import { listDatasets } from '../src/agent/tools/list_datasets.js';
import { previewDataset } from '../src/agent/tools/preview_dataset.js';
import { profileColumns } from '../src/agent/tools/profile_columns.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { stubSemanticsPort, type OnProfileDone } from '../src/ports.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';
import { multipartBody, writeKumoLike, type KumoLike } from './kumo-like.js';

const rationale = { title: 'Test', why: 'Test' };

let t: TestApp;
let kumo: KumoLike;
let projectId: string;
let ada: string;
let ben: string;
let adaId: string;
const hookCalls: Parameters<OnProfileDone>[0][] = [];
let hookShouldFail = false;
const ids: Record<string, string> = {};

async function upload(file: string, fields: Record<string, string> = {}, cookie = ada) {
  const { payload, headers } = multipartBody({ name: path.basename(file), content: readFileSync(file) }, fields);
  return t.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/datasets`,
    payload,
    headers: { ...headers, cookie },
  });
}

function toolCtx(): ToolContext {
  return {
    user: { id: adaId, email: 'ada@kumo.test', displayName: 'Ada' },
    projectId,
    sessionId: randomUUID(),
    mode: 'explore',
    services: t.ctx.services,
    semantics: stubSemanticsPort,
  };
}

beforeAll(async () => {
  t = await buildTestApp({
    dataDir: mkdtempSync(path.join(tmpdir(), 'mini-uploads-')),
    onProfileDone: async (ctx) => {
      hookCalls.push(ctx);
      if (hookShouldFail) throw new Error('cards exploded');
    },
  });
  await t.app.ready();
  kumo = writeKumoLike();

  // A fresh project per run: dataset names are unique per project and the test DB persists.
  const users = await t.db.selectFrom('meta.users').select(['id', 'email']).where('email', 'like', '%@kumo.test').execute();
  adaId = users.find((u) => u.email === 'ada@kumo.test')!.id;
  const benId = users.find((u) => u.email === 'ben@kumo.test')!.id;
  const p = await t.db
    .insertInto('meta.projects')
    .values({ name: `Datasets test ${randomUUID().slice(0, 8)}`, created_by: adaId })
    .returning('id')
    .executeTakeFirstOrThrow();
  projectId = p.id;
  await t.db
    .insertInto('meta.project_members')
    .values([
      { project_id: projectId, user_id: adaId, role: 'owner' },
      { project_id: projectId, user_id: benId, role: 'viewer' },
    ])
    .execute();
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
});

afterAll(async () => {
  await t?.close();
});

describe('T-05 upload', () => {
  it('D1: the orders .csv.gz loads as version 1 with typed columns and no parse errors', async () => {
    const res = await upload(kumo.files.orders);
    expect(res.statusCode).toBe(201);
    const v = res.json() as DatasetVersion;
    ids.orders = v.datasetId;
    expect(v.version).toBe(1);
    expect(v.rowCount).toBe(kumo.facts.orderLines);
    expect(v.profileStatus).toBe('pending');
    expect(v.parseErrors).toEqual([]);
    const col = (n: string) => v.columns.find((c) => c.name === n)!;
    expect(col('Quantite').type).toBe('integer');
    expect(col('Date').type).toBe('date');
    expect(col('No_Transaction').type).toBe('string');
    expect(col('Lieu_Production').nullable).toBe(true);
    expect(col('ID_Interne_Client_Netsuite').sqlName).toBe('id_interne_client_netsuite');

    const nulls = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM ${sql.table(`data.ds_${await shortId(v.datasetId)}_v1`)} WHERE lieu_production IS NULL`.execute(t.db);
    expect(nulls.rows[0]!.n).toBe(kumo.facts.lieuProductionNulls);
  });

  it('D2: articles: French timestamp, True/False boolean, DLC stays string (semicolon file)', async () => {
    const res = await upload(kumo.files.articles);
    expect(res.statusCode).toBe(201);
    const v = res.json() as DatasetVersion;
    ids.articles = v.datasetId;
    const col = (n: string) => v.columns.find((c) => c.name === n)!;
    expect(col('Date_de_cr_ation').type).toBe('timestamp');
    expect(col('Article_Actif').type).toBe('boolean');
    expect(col('DLC').type).toBe('string');
    expect(col('Article_Actif').sample).toEqual(expect.arrayContaining([true, false]));
  });

  it('accepts lowercase true/false (the real files and kumo-mini)', async () => {
    const res = await upload(kumo.files.clients);
    expect(res.statusCode).toBe(201);
    const v = res.json() as DatasetVersion;
    ids.clients = v.datasetId;
    expect(v.columns.find((c) => c.name === 'Actif')!.type).toBe('boolean');
  });

  it('D3: a bad integer becomes NULL and is reported; APPEND checks columns and adds rows', async () => {
    const good = Array.from({ length: 60 }, (_, i) => `R${i},${i + 1}`);
    good[10] = 'R10,abc';
    const csv = 'Code,Nombre\n' + good.join('\n') + '\n';
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/datasets`,
      ...withCookie(multipartBody({ name: 'NOMBRES.csv', content: csv })),
    });
    expect(res.statusCode).toBe(201);
    const v1 = res.json() as DatasetVersion;
    expect(v1.columns[1]!.type).toBe('integer');
    expect(v1.parseErrors).toEqual([{ row: 11, column: 'Nombre', value: 'abc', expected: 'integer' }]);

    const mismatch = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/datasets`,
      ...withCookie(
        multipartBody({ name: 'NOMBRES.csv', content: 'Code,Autre\nX,1\n' }, { datasetId: v1.datasetId, transactionType: 'APPEND' }),
      ),
    });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json()).toMatchObject({ code: 'COLUMNS_MISMATCH', hint: expect.any(String) });

    const appended = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/datasets`,
      ...withCookie(
        multipartBody({ name: 'NOMBRES.csv', content: 'Code,Nombre\nX1,100\nX2,200\n' }, { datasetId: v1.datasetId, transactionType: 'APPEND' }),
      ),
    });
    expect(appended.statusCode).toBe(201);
    const v2 = appended.json() as DatasetVersion;
    expect(v2.version).toBe(2);
    expect(v2.rowCount).toBe(62);
    expect(v2.transactionType).toBe('APPEND');

    const versions = await t.app.inject({ method: 'GET', url: `/api/datasets/${v1.datasetId}/versions`, headers: { cookie: ada } });
    expect(versions.json().map((x: DatasetVersion) => x.version)).toEqual([2, 1]);
  });

  it('refuses a second dataset with the same name, a viewer, and non-CSV files', async () => {
    const dup = await upload(kumo.files.clients);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('DATASET_EXISTS');

    const viewer = await upload(kumo.files.clients, { name: 'OTHER' }, ben);
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json().code).toBe('FORBIDDEN');

    const bad = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/datasets`,
      ...withCookie(multipartBody({ name: 'data.xlsx', content: 'x' })),
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('BAD_FILE');
  });

  it('lists datasets with their current version and previews rows in file order', async () => {
    const list = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/datasets`, headers: { cookie: ben } });
    expect(list.statusCode).toBe(200);
    const orders = list.json().find((d: { name: string }) => d.name === 'COMMANDES_NETSUITE_2025');
    expect(orders).toMatchObject({ simulated: false, currentVersion: 1, current: { rowCount: kumo.facts.orderLines } });

    const prev = await t.app.inject({
      method: 'GET',
      url: `/api/datasets/${ids.orders}/preview?limit=3`,
      headers: { cookie: ben },
    });
    expect(prev.statusCode).toBe(200);
    const body = prev.json();
    expect(body.total).toBe(kumo.facts.orderLines);
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0][0]).toMatch(/^SO-/);
    expect(body.rows[0][1]).toMatch(/^2025-\d{2}-\d{2}$/); // dates as text, no time-zone shift
    expect(typeof body.rows[0][4]).toBe('number');
  });
});

describe('T-06 profile job', () => {
  it('runs in the background, then D4: prefixes SO- and RMA- with their counts', async () => {
    await t.ctx.services.jobs.waitIdle();
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/datasets/${ids.orders}/profile?column=No_Transaction`,
      headers: { cookie: ada },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('done');
    const p = body.profiles[0];
    expect(p.column).toBe('No_Transaction');
    expect(p.patterns).toEqual(
      expect.arrayContaining([
        { pattern: 'SO-…', count: kumo.facts.soLines },
        { pattern: 'RMA-…', count: kumo.facts.rmaLines },
      ]),
    );
    expect(p.isUnique).toBe(false);

    const all = await t.app.inject({ method: 'GET', url: `/api/datasets/${ids.clients}/profile`, headers: { cookie: ada } });
    const idCol = all.json().profiles.find((x: { column: string }) => x.column === 'ID_interne');
    expect(idCol).toMatchObject({ isUnique: true, nullCount: 0, distinctCount: kumo.facts.clients });

    const jobs = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/jobs?status=done`, headers: { cookie: ada } });
    expect(jobs.json().length).toBeGreaterThanOrEqual(4);
  });

  it('calls the onProfileDone hook once per version (09 §4.2)', () => {
    expect(hookCalls).toEqual(
      expect.arrayContaining([{ projectId, datasetId: ids.orders, version: 1 }]),
    );
  });

  it('a failing hook is recorded on the job and never fails the profile', async () => {
    hookShouldFail = true;
    try {
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/datasets`,
        ...withCookie(multipartBody({ name: 'HOOK_FAIL.csv', content: 'A,B\n1,x\n2,y\n' })),
      });
      expect(res.statusCode).toBe(201);
      await t.ctx.services.jobs.waitIdle();
      const datasetId = res.json().datasetId;
      const v = await t.db
        .selectFrom('meta.dataset_versions')
        .select(['id', 'profile_status'])
        .where('dataset_id', '=', datasetId)
        .executeTakeFirstOrThrow();
      expect(v.profile_status).toBe('done');
      const job = await t.db.selectFrom('meta.jobs').select(['status', 'error']).where('target', '=', v.id).executeTakeFirstOrThrow();
      expect(job.status).toBe('done');
      expect(job.error).toMatch(/cards exploded/);
    } finally {
      hookShouldFail = false;
    }
  });
});

describe('Part A dataset tools', () => {
  it('list_datasets', async () => {
    const r = await listDatasets.run({ rationale }, toolCtx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.result as { total: number; datasets: { name: string }[] };
    expect(result.datasets.map((d) => d.name)).toEqual(
      expect.arrayContaining(['COMMANDES_NETSUITE_2025', 'CLIENTS_NETSUITE', 'ARTICLES_NETSUITE']),
    );
  });

  it('get_dataset by name', async () => {
    const r = await getDataset.run({ rationale, datasetId: 'ARTICLES_NETSUITE' }, toolCtx());
    expect(r).toMatchObject({ ok: true, result: { name: 'ARTICLES_NETSUITE', rowCount: kumo.facts.articles } });
  });

  it('preview_dataset caps at 50 rows', async () => {
    const parsed = previewDataset.input.parse({ rationale, datasetId: ids.orders, limit: 5 });
    const r = await previewDataset.run(parsed, toolCtx());
    expect(r).toMatchObject({ ok: true, result: { total: kumo.facts.orderLines, truncated: true } });
    expect(() => previewDataset.input.parse({ rationale, datasetId: ids.orders, limit: 51 })).toThrow();
  });

  it('profile_columns with matchAgainst: D4 client keys match 100 %', async () => {
    const r = await profileColumns.run(
      {
        rationale,
        datasetId: 'COMMANDES_NETSUITE_2025',
        columns: ['No_Transaction', 'Quantite'],
        matchAgainst: {
          datasetId: 'CLIENTS_NETSUITE',
          keys: [{ fromColumn: 'ID_Interne_Client_Netsuite', toColumn: 'ID_interne' }],
        },
      },
      toolCtx(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.result as { profiles: { column: string }[]; matchRate: { rate: number; nonNull: number } };
    expect(result.profiles.map((p) => p.column)).toEqual(['No_Transaction', 'Quantite']);
    expect(result.matchRate).toMatchObject({ rate: 1, nonNull: kumo.facts.orderLines, unmatchedExamples: [] });
  });

  it('profile_columns finds the order line whose article is unknown', async () => {
    const r = await profileColumns.run(
      {
        rationale,
        datasetId: 'COMMANDES_NETSUITE_2025',
        columns: ['ID_Interne_Article'],
        matchAgainst: { datasetId: 'ARTICLES_NETSUITE', keys: [{ fromColumn: 'ID_Interne_Article', toColumn: 'ID_interne' }] },
      },
      toolCtx(),
    );
    expect(r).toMatchObject({ ok: true, result: { matchRate: { matched: kumo.facts.orderLines - 1, unmatchedExamples: ['A9999'] } } });
  });

  it('returns errors instead of throwing', async () => {
    const missing = await getDataset.run({ rationale, datasetId: 'NOPE' }, toolCtx());
    expect(missing).toMatchObject({ ok: false, code: 'NOT_FOUND', hint: expect.any(String) });
    const badColumn = await profileColumns.run({ rationale, datasetId: 'CLIENTS_NETSUITE', columns: ['Nope'] }, toolCtx());
    expect(badColumn).toMatchObject({ ok: false, code: 'UNKNOWN_COLUMN' });
  });
});

function withCookie(m: { payload: Buffer; headers: Record<string, string> }) {
  return { payload: m.payload, headers: { ...m.headers, cookie: ada } };
}

async function shortId(datasetId: string): Promise<string> {
  const d = await t.db.selectFrom('meta.datasets').select('short_id').where('id', '=', datasetId).executeTakeFirstOrThrow();
  return d.short_id;
}
