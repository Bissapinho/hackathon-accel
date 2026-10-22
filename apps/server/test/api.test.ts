import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireProject } from '../src/auth.js';
import { buildToolRegistry } from '../src/agent/registry.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

let t: TestApp;
let projectId: string;

beforeAll(async () => {
  t = await buildTestApp();
  // A write route for the guard test; Phase 0 has no real write route yet.
  t.app.post('/api/projects/:pid/_test-write', async (req) => {
    const { pid } = req.params as { pid: string };
    await requireProject(req, t.ctx.services.resources, pid, 'write');
    return { ok: true };
  });
  await t.app.ready();
  const p = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  projectId = p.id;
});
afterAll(async () => {
  await t.close();
});

describe('T-03 server skeleton', () => {
  it('GET /api/health reports the database', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: 'ok' });
  });

  it('GET /api/me returns Ada and her project', async () => {
    const cookie = await loginAs(t.app, 'ada@kumo.test');
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const me = res.json();
    expect(me.user).toMatchObject({ email: 'ada@kumo.test', displayName: 'Ada' });
    expect(me.projects).toEqual([expect.objectContaining({ id: projectId, name: 'Kumo 2025', role: 'owner' })]);
  });

  it('GET /api/me without login is 401 with an ApiError body', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHENTICATED', message: expect.any(String), hint: expect.any(String) });
  });

  it('a forged cookie is ignored', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'mini_uid=not-signed' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/projects/:pid returns members', async () => {
    const cookie = await loginAs(t.app, 'ben@kumo.test');
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().members.map((m: { role: string }) => m.role).sort()).toEqual(['owner', 'viewer']);
  });

  it('viewer guard returns FORBIDDEN on a write route; owner passes', async () => {
    const ben = await loginAs(t.app, 'ben@kumo.test');
    const denied = await t.app.inject({ method: 'POST', url: `/api/projects/${projectId}/_test-write`, headers: { cookie: ben } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('FORBIDDEN');

    const ada = await loginAs(t.app, 'ada@kumo.test');
    const allowed = await t.app.inject({ method: 'POST', url: `/api/projects/${projectId}/_test-write`, headers: { cookie: ada } });
    expect(allowed.statusCode).toBe(200);
  });

  it('unknown project is 404 and says why; bad id is 400 VALIDATION_FAILED', async () => {
    const cookie = await loginAs(t.app, 'ada@kumo.test');
    const missing = await t.app.inject({
      method: 'GET',
      url: '/api/projects/00000000-0000-4000-8000-000000000000',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().message).toMatch(/not a member|doesn't exist/);

    const bad = await t.app.inject({ method: 'GET', url: '/api/projects/nope', headers: { cookie } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ path: 'pid' })] });
  });

  it('unknown route is a 404 ApiError', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nothing-here' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('Phase 0 tool registry', () => {
  it('builds from both indexes and rejects duplicates and names missing from the catalog', () => {
    expect(() => buildToolRegistry()).not.toThrow();
    const fake = { name: 'list_datasets', modes: [], risk: 'read', input: null, run: async () => ({ ok: true }) };
    expect(() => buildToolRegistry([fake, fake] as never)).toThrow(/twice/);
    expect(() => buildToolRegistry([{ ...fake, name: 'nope' }] as never)).toThrow(/catalog/);
  });
});
