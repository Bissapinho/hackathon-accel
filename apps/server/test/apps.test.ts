import type { AppBlock, AppDef, ObjectSet, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateAppDef } from '../src/modules/apps/service.js';
import { validateStructure } from '../src/modules/workspace/validate.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';
import { objectsDoc, objectsSetupSql } from './objects-fixture.js';

// T-31 / P1: the kitchen planning app document validates, is served from the published workspace,
// and the object sets its blocks use return the right rows (metrics match SQL, over-capacity first).

const allDays: ObjectSet = { kind: 'all', objectType: 'CuisineJour' };
const overCapacity: ObjectSet = { kind: 'filter', of: allDays, where: { kind: 'rule', rule: 'surcharge' } };

const kitchenApp: AppDef = {
  id: 'planning-cuisine',
  name: 'Planification cuisine',
  description: 'Charge de production par cuisine et par jour',
  pages: [
    {
      id: 'planning',
      title: 'Planning',
      blocks: [
        { kind: 'markdown', version: 1, text: 'Les cuisines en surcharge sont en tete de liste.' },
        { kind: 'metric', version: 1, label: 'Cuisines-jours en surcharge', set: overCapacity, aggregate: { fn: 'count' } },
        { kind: 'metric', version: 1, label: 'Charge totale', set: allDays, aggregate: { fn: 'sum', property: 'charge' } },
        { kind: 'chart', version: 1, title: 'Charge par cuisine', set: allDays, groupBy: 'lieu', aggregate: { fn: 'sum', property: 'charge' }, chart: 'bar' },
        {
          kind: 'objectList', version: 1, id: 'days', title: 'Cuisines par jour', set: allDays,
          columns: ['lieu', 'jour', 'charge', 'capacite', 'tauxCharge'],
          sort: [{ property: 'tauxCharge', direction: 'desc' }],
          filters: [{ property: 'lieu', control: 'multiSelect' }],
          pageSize: 25,
        },
        { kind: 'objectDetail', version: 1, source: 'days', properties: ['lieu', 'jour', 'charge'], links: ['lots'], actions: [] },
      ],
    },
  ],
};

const docWith = (apps: AppDef[]): WorkspaceDoc => ({ ...objectsDoc, apps });
const withBlock = (b: AppBlock): AppDef => ({ ...kitchenApp, pages: [{ id: 'p', title: 'P', blocks: [...kitchenApp.pages[0]!.blocks, b] }] });

describe('validateAppDef (pure)', () => {
  it('accepts the kitchen planning app', () => {
    expect(validateAppDef(kitchenApp, docWith([]))).toEqual({ errors: [], warnings: [] });
    // The objects fixture is hand-made (not fully valid elsewhere): only the app's own paths matter here.
    expect(validateStructure(docWith([kitchenApp])).errors.filter((e) => e.path.startsWith('apps'))).toEqual([]);
  });

  it('reports unknown properties, links, object types, lists and actions with a path under the app', () => {
    const bad = withBlock({ kind: 'metric', version: 1, label: 'x', set: allDays, aggregate: { fn: 'sum', property: 'nope' } });
    const r1 = validateAppDef(bad, docWith([]));
    expect(r1.errors.map((e) => [e.code, e.path])).toEqual([['UNKNOWN_REFERENCE', 'app.pages[0].blocks[6].aggregate.property']]);

    const r2 = validateAppDef(withBlock({ kind: 'metric', version: 1, label: 'x', set: { kind: 'all', objectType: 'Ghost' }, aggregate: { fn: 'count' } }), docWith([]));
    expect(r2.errors[0]).toMatchObject({ code: 'UNKNOWN_REFERENCE', path: 'app.pages[0].blocks[6].set.objectType' });

    const r3 = validateAppDef(withBlock({ kind: 'objectDetail', version: 1, source: 'missing', properties: [], links: [], actions: [] }), docWith([]));
    expect(r3.errors[0]).toMatchObject({ path: 'app.pages[0].blocks[6].source' });

    const r4 = validateAppDef(withBlock({ kind: 'objectDetail', version: 1, source: 'days', properties: [], links: ['ghost'], actions: ['ghostAction'] }), docWith([]));
    expect(r4.errors.map((e) => e.path)).toEqual(['app.pages[0].blocks[6].links[0]', 'app.pages[0].blocks[6].actions[0]']);

    const r5 = validateAppDef(withBlock({ kind: 'metric', version: 1, label: 'x', set: { kind: 'filter', of: allDays, where: { kind: 'rule', rule: 'ghost' } }, aggregate: { fn: 'count' } }), docWith([]));
    expect(r5.errors.length).toBeGreaterThan(0);
  });

  it('requires a kebab-case id', () => {
    expect(validateAppDef({ ...kitchenApp, id: 'Planning_Cuisine' }, docWith([])).errors[0]).toMatchObject({ path: 'app.id' });
  });

  it('ignores errors that belong to other apps of the document', () => {
    const broken = withBlock({ kind: 'metric', version: 1, label: 'x', set: { kind: 'all', objectType: 'Ghost' }, aggregate: { fn: 'count' } });
    expect(validateAppDef(kitchenApp, docWith([{ ...broken, id: 'other' }])).errors).toEqual([]);
  });
});

describe('apps API and the object sets of the blocks', () => {
  let t: TestApp;
  let pid: string;
  let ada: string;
  let ben: string;

  beforeAll(async () => {
    t = await buildTestApp();
    const p = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
    pid = p.id;
    const u = await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow();
    await sql.raw(objectsSetupSql).execute(t.db);
    await t.db.deleteFrom('meta.workspace_versions').where('project_id', '=', pid).execute();
    ada = await loginAs(t.app, 'ada@kumo.test');
    ben = await loginAs(t.app, 'ben@kumo.test');
    // Published workspace without the app first (404), then with it.
    await t.db
      .insertInto('meta.workspace_versions')
      .values({ project_id: pid, version: 1, sem_version: 'v0', doc: JSON.stringify(docWith([])), message: 't31', published_by: u.id, published_via: 'ui' })
      .execute();
  });

  afterAll(async () => {
    await t.db.deleteFrom('meta.workspace_versions').where('project_id', '=', pid).execute();
    await t.close();
  });

  const get = (url: string, cookie = ada) => t.app.inject({ method: 'GET', url: `/api/projects/${pid}${url}`, headers: { cookie } });
  const post = (url: string, payload: unknown, cookie = ada) =>
    t.app.inject({ method: 'POST', url: `/api/projects/${pid}${url}`, payload: payload as object, headers: { cookie } });

  it('404 explains itself when the app is not published', async () => {
    const res = await get('/apps/planning-cuisine');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.json().message).toContain('planning-cuisine');
    expect((await get('/apps')).json()).toEqual([]);
  });

  it('POST /apps/validate dry-runs an AppDef against the draft; viewers cannot', async () => {
    // The draft starts from the published doc (09 §4.5).
    const ok = await post('/apps/validate', kitchenApp);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().errors).toEqual([]);
    const bad = await post('/apps/validate', withBlock({ kind: 'chart', version: 1, title: 't', set: allDays, groupBy: 'nope', aggregate: { fn: 'count' }, chart: 'pie' }));
    expect(bad.json().errors[0]).toMatchObject({ code: 'UNKNOWN_REFERENCE', path: 'app.pages[0].blocks[6].groupBy' });
    expect((await post('/apps/validate', { ...kitchenApp, pages: [{ id: 'p', title: 'P', blocks: [{ kind: 'weird', version: 1 }] }] })).statusCode).toBe(400);
    expect((await post('/apps/validate', kitchenApp, ben)).statusCode).toBe(403);
  });

  it('serves the app from the latest published version', async () => {
    const u = await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow();
    await t.db
      .insertInto('meta.workspace_versions')
      .values({ project_id: pid, version: 2, sem_version: 'v0', doc: JSON.stringify(docWith([kitchenApp])), message: 't31', published_by: u.id, published_via: 'ui' })
      .execute();
    const res = await get('/apps/planning-cuisine', ben);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(kitchenApp);
    expect((await get('/apps')).json()).toEqual([{ id: 'planning-cuisine', name: kitchenApp.name, description: kitchenApp.description, pages: 1 }]);
    const missing = await get('/apps/other');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().hint).toContain('planning-cuisine');
    expect((await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/apps` })).statusCode).toBe(401);
  });

  it('P1: metrics match SQL and over-capacity kitchen-days come first', async () => {
    const app = (await get('/apps/planning-cuisine')).json() as AppDef;
    const blocks = app.pages[0]!.blocks;

    const sqlRes = await sql<{ n: number; total: number }>`
      SELECT count(*) FILTER (WHERE charge > capacite)::int AS n, sum(charge)::int AS total FROM data.t15_cuisine_jour`.execute(t.db);
    const expected = sqlRes.rows[0]!;

    for (const b of blocks.filter((x): x is Extract<AppBlock, { kind: 'metric' }> => x.kind === 'metric')) {
      const res = await post('/objects/aggregate', { set: b.set, aggregate: [b.aggregate] });
      expect(res.statusCode).toBe(200);
      const value = res.json().groups[0].values[0];
      expect(value).toBe(b.aggregate.fn === 'count' ? expected.n : expected.total);
    }

    const chart = blocks.find((x): x is Extract<AppBlock, { kind: 'chart' }> => x.kind === 'chart')!;
    const grouped = (await post('/objects/aggregate', { set: chart.set, groupBy: [chart.groupBy], aggregate: [chart.aggregate] })).json();
    expect(Object.fromEntries(grouped.groups.map((g: { keys: Record<string, string>; values: number[] }) => [g.keys.lieu, g.values[0]]))).toEqual({
      Draveil: 50, Frepillon: 210, Gennevilliers: 90,
    });

    const list = blocks.find((x): x is Extract<AppBlock, { kind: 'objectList' }> => x.kind === 'objectList')!;
    const rows = (await post('/objects/query', { set: list.set, select: list.columns, orderBy: list.sort, pageSize: list.pageSize })).json();
    expect(rows.total).toBe(4);
    expect(rows.rows[0].ref.primaryKey).toBe('Frepillon|2025-10-14');
    expect(rows.rows[0].properties.tauxCharge).toBe(1.3);
    expect(rows.rows.map((r: { properties: { tauxCharge: number } }) => r.properties.tauxCharge)).toEqual([1.3, 0.9, 0.8, 0.5]);

    // The detail panel: linked objects of the selected row.
    const detail = (await get('/objects/CuisineJour/Frepillon%7C2025-10-14')).json();
    expect(detail.links.find((l: { apiName: string }) => l.apiName === 'lots').rows).toHaveLength(2);
  });
});
