import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregateObjects } from '../src/agent/tools/aggregate_objects.js';
import { getObject } from '../src/agent/tools/get_object.js';
import { queryObjects } from '../src/agent/tools/query_objects.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { stubSemanticsPort } from '../src/ports.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';
import { objectsDoc, objectsSetupSql } from './objects-fixture.js';

// T-15 on the database: O1 (rules in filters, sort by a derived property) and O2 (object with links).
// The logic.* views are hand-made here; publish (T-14) and logic (T-18) will build them for real.

let t: TestApp;
let projectId: string;
let ada: string;
let adaId: string;

beforeAll(async () => {
  t = await buildTestApp();
  const p = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  projectId = p.id;
  const u = await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow();
  adaId = u.id;
  await sql.raw(objectsSetupSql).execute(t.db);
  await t.db.deleteFrom('meta.workspace_versions').where('project_id', '=', projectId).execute();
  await t.db
    .insertInto('meta.workspace_versions')
    .values({ project_id: projectId, version: 1, sem_version: 'v0', doc: JSON.stringify(objectsDoc), message: 't15', published_by: adaId, published_via: 'ui' })
    .execute();
  ada = await loginAs(t.app, 'ada@kumo.test');
});

afterAll(async () => {
  await t.db.deleteFrom('meta.workspace_versions').where('project_id', '=', projectId).execute();
  await t.close();
});

const post = (url: string, payload: unknown) =>
  t.app.inject({ method: 'POST', url: `/api/projects/${projectId}${url}`, payload: payload as object, headers: { cookie: ada } });

describe('O1 query', () => {
  it('"CuisineJour where surcharge" returns the over-capacity kitchen-days', async () => {
    const res = await post('/objects/query', {
      set: { kind: 'filter', of: { kind: 'all', objectType: 'CuisineJour' }, where: { kind: 'rule', rule: 'surcharge' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({
      ref: { objectType: 'CuisineJour', primaryKey: 'Frepillon|2025-10-14' },
      properties: { lieu: 'Frepillon', jour: '2025-10-14', charge: 130, capacite: 100, tauxCharge: 1.3 },
      rules: { surcharge: true },
    });
  });

  it('sorts by a derived property and pages with nextPageToken', async () => {
    const set = { kind: 'all', objectType: 'CuisineJour' };
    const first = (await post('/objects/query', { set, orderBy: [{ property: 'tauxCharge', direction: 'desc' }], pageSize: 2 })).json();
    expect(first.total).toBe(4);
    expect(first.rows.map((r: { properties: { tauxCharge: number } }) => r.properties.tauxCharge)).toEqual([1.3, 0.9]);
    expect(first.nextPageToken).toBeTruthy();
    const second = (await post('/objects/query', { set, orderBy: [{ property: 'tauxCharge', direction: 'desc' }], pageSize: 2, pageToken: first.nextPageToken })).json();
    expect(second.rows.map((r: { properties: { tauxCharge: number } }) => r.properties.tauxCharge)).toEqual([0.8, 0.5]);
    expect(second.nextPageToken).toBeUndefined();
  });

  it('filters on a date and follows a composite link', async () => {
    const res = await post('/objects/query', {
      set: {
        kind: 'linked',
        link: 'lots',
        of: { kind: 'filter', of: { kind: 'all', objectType: 'CuisineJour' }, where: { kind: 'cmp', property: 'jour', op: 'eq', value: '2025-10-14' } },
      },
      select: ['lotId'],
    });
    const body = res.json();
    expect(body.rows.map((r: { ref: { primaryKey: string } }) => r.ref.primaryKey)).toEqual(['L1', 'L2', 'L3']);
    expect(body.rows[0].properties).toEqual({ lotId: 'L1' });
  });

  it('explains an unknown property with the list of properties', async () => {
    const res = await post('/objects/query', {
      set: { kind: 'filter', of: { kind: 'all', objectType: 'Commande' }, where: { kind: 'cmp', property: 'prix', op: 'gt', value: 1 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'UNKNOWN_PROPERTY', hint: expect.stringContaining('quantite') });
  });

  it('aggregates by group', async () => {
    const res = await post('/objects/aggregate', {
      set: { kind: 'all', objectType: 'Commande' },
      groupBy: ['clientId'],
      aggregate: [{ fn: 'count' }, { fn: 'sum', property: 'quantite' }],
    });
    expect(res.json().groups).toEqual([
      { keys: { clientId: 'C001' }, values: [3, 6] },
      { keys: { clientId: 'C002' }, values: [1, 7] },
    ]);
  });
});

describe('O2 get object', () => {
  it('a commande returns its client link (1 row)', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/objects/Commande/SO-1`, headers: { cookie: ada } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ref).toEqual({ objectType: 'Commande', primaryKey: 'SO-1' });
    const client = body.links.find((l: { apiName: string }) => l.apiName === 'client');
    expect(client.rows).toHaveLength(1);
    expect(client.rows[0]).toMatchObject({ ref: { objectType: 'Client', primaryKey: 'C001' }, title: 'Alpha', properties: { nbCommandes: 3 } });
  });

  it('a client returns its commandes and derived properties', async () => {
    const body = (await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/objects/Client/C001`, headers: { cookie: ada } })).json();
    expect(body.title).toBe('Alpha');
    expect(body.properties.nbCommandes).toBe(3);
    const commandes = body.links.find((l: { apiName: string }) => l.apiName === 'commandes');
    expect(commandes.rows.map((r: { ref: { primaryKey: string } }) => r.ref.primaryKey)).toEqual(['RMA-1', 'SO-1', 'SO-2']);
  });

  it('a kitchen-day returns its lots through the composite key', async () => {
    const body = (await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/objects/CuisineJour/Frepillon%7C2025-10-14`, headers: { cookie: ada } })).json();
    expect(body.rules).toEqual({ surcharge: true });
    expect(body.links.find((l: { apiName: string }) => l.apiName === 'lots').rows).toHaveLength(2);
  });

  it('an unknown key is 404 and says why', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/objects/Commande/SO-404`, headers: { cookie: ada } });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('SO-404');
  });
});

describe('Part A object tools', () => {
  const ctx = (): ToolContext => ({
    user: { id: adaId, email: 'ada@kumo.test', displayName: 'Ada' },
    projectId,
    sessionId: '00000000-0000-4000-8000-000000000001',
    mode: 'explore',
    services: t.ctx.services,
    semantics: stubSemanticsPort,
  });
  const rationale = { title: 'Test', why: 'Test' };

  it('query_objects, aggregate_objects and get_object return compact results', async () => {
    const q = await queryObjects.run(
      queryObjects.input.parse({ set: { kind: 'all', objectType: 'Commande' }, pageSize: 2, rationale }),
      ctx(),
    );
    expect(q).toMatchObject({ ok: true, result: { total: 4, truncated: true } });

    const a = await aggregateObjects.run(aggregateObjects.input.parse({ set: { kind: 'all', objectType: 'Client' }, aggregate: [{ fn: 'count' }], rationale }), ctx());
    expect(a).toMatchObject({ ok: true, summary: 'Result: 3.' });

    const g = await getObject.run(getObject.input.parse({ objectType: 'Client', primaryKey: 'C002', rationale }), ctx());
    expect(g.ok && g.summary).toBe('Client Beta — Commandes: 1.');
  });

  it('tool errors are returned, not thrown', async () => {
    const res = await getObject.run(getObject.input.parse({ objectType: 'Ticket', primaryKey: 'x', rationale }), ctx());
    expect(res).toMatchObject({ ok: false, code: 'UNKNOWN_OBJECT_TYPE', hint: expect.stringContaining('Commande') });
  });

  it('query_objects caps pages at 50', () => {
    expect(() => queryObjects.input.parse({ set: { kind: 'all', objectType: 'Commande' }, pageSize: 51, rationale })).toThrow();
  });
});
