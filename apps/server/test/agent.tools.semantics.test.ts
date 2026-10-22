import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SemConstraint } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildToolRegistry } from '../src/agent/registry.js';
import { bankOverview } from '../src/agent/tools/bank_overview.js';
import { browseSemantics } from '../src/agent/tools/browse_semantics.js';
import { editSemantics } from '../src/agent/tools/edit_semantics.js';
import { alexandreTools } from '../src/agent/tools/index.alexandre.js';
import { alfredTools } from '../src/agent/tools/index.alfred.js';
import { semanticsTools } from '../src/agent/tools/index.semantics.js';
import { publishSemantics } from '../src/agent/tools/publish_semantics.js';
import { resolveSemantics } from '../src/agent/tools/resolve_semantics.js';
import { setWorkload } from '../src/agent/tools/set_workload.js';
import type { AnyToolDef, ToolContext, ToolResult } from '../src/agent/tools/types.js';
import { validateSemantics } from '../src/agent/tools/validate_semantics.js';
import { toLlmTools } from '../src/modules/llm/index.js';
import type { User } from '../src/modules/resources/schemas.js';
import { buildTestApp, type TestApp } from './helpers.js';

// T-23 / T-24: the semantic bank tools called directly with a ToolContext built from buildTestApp()
// (seeded Ada / Ben and project "Kumo 2025"). The project's bank is reset before each test.

let t: TestApp;
let ctx: ToolContext;
let ada: User;
let ben: User;

const rationale = { title: 'Work on the meaning', why: 'Test' };
// As the loop does: parse the arguments with the tool's zod input, then run.
const parse = (tool: AnyToolDef, args: object) => tool.input.parse({ rationale, ...args });
const call = (tool: AnyToolDef, args: object = {}, c: ToolContext = ctx): Promise<ToolResult> => tool.run(parse(tool, args), c);
const okResult = <T>(res: ToolResult): T => {
  if (!res.ok) throw new Error(`tool failed: ${res.code} ${res.message}`);
  return res.result as T;
};

const term = (id: string, name: string, extra: object = {}) => ({
  op: 'upsertRecord',
  record: { kind: 'term', body: { id, name, type: 'entity', definition: `${name}, as observed in the data`, scope: '2025', status: 'enriched', ...extra } },
});

const bankOps = [
  term('T_retour', 'Retour', { aliases: ['RMA'], evidence: ['E_rma'], definition: 'Un document RMA, avec des quantités négatives' }),
  term('T_taux_retour', 'Taux de retour', { type: 'metric', definition: 'Retours divisés par la base choisie' }),
  term('T_magasin', 'Magasin', { status: 'card', definition: 'to be defined' }),
  { op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_rma', source: 'commandes', query: "SELECT -3 AS quantite, 'RMA-1' AS no_transaction", validation_method: 'Signe des quantités' } } },
  { op: 'upsertRecord', record: { kind: 'constraint', body: {
    id: 'C_base', target: 'T_taux_retour', constraint_type: 'business_rule', trigger_keywords: ['taux de retour'], severity: 'block',
    confidence: 0.9, description: 'Mesuré sur les quantités commandées ou livrées', options: ['commandées', 'livrées'], evidence: ['E_rma'],
  } } },
];

const workload = {
  goal: 'Voir où les retours coûtent',
  questions: [
    { id: 'Q01', text: 'Quels magasins retournent le plus ?', source: 'proposed', picked: true },
    { id: 'Q02', text: 'Quel est le taux de retour par mois ?', source: 'proposed', picked: true },
    { id: 'Q03', text: 'Quels clients commandent le plus ?', source: 'user', picked: false },
  ],
};

async function resetBank(projectId: string) {
  await sql`DELETE FROM meta.sem_versions WHERE project_id = ${projectId}`.execute(t.db); // records cascade
  await sql`DELETE FROM meta.sem_workload WHERE project_id = ${projectId}`.execute(t.db);
  await sql`DELETE FROM meta.sem_goals WHERE project_id = ${projectId}`.execute(t.db);
}

beforeAll(async () => {
  t = await buildTestApp();
  const s = t.ctx.services;
  ada = (await s.resources.getUserByEmail('ada@kumo.test'))!;
  ben = (await s.resources.getUserByEmail('ben@kumo.test'))!;
  const project = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  ctx = { user: ada, projectId: project.id, sessionId: randomUUID(), mode: 'semantics', services: s, semantics: s.semanticsPort };
});

beforeEach(async () => { await resetBank(ctx.projectId); });

afterAll(async () => {
  await resetBank(ctx.projectId);
  await t.close();
});

describe('semantics tools: catalog and LLM specs', () => {
  type CatalogTool = { name: string; modes: string[]; risk: string; input: unknown; stretch?: boolean };
  const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('../../../build-package/tools/catalog.json', import.meta.url)), 'utf8')) as { tools: CatalogTool[] };

  it('every tool is accepted by buildToolRegistry with the catalog modes and risk', () => {
    const registry = buildToolRegistry([...alexandreTools, ...alfredTools, ...semanticsTools]);
    for (const tool of semanticsTools) {
      expect(registry.get(tool.name)).toBe(tool);
      const entry = catalog.tools.find((c) => c.name === tool.name)!;
      expect({ name: tool.name, modes: [...tool.modes].sort(), risk: tool.risk }).toEqual({ name: entry.name, modes: [...entry.modes].sort(), risk: entry.risk });
      if (tool.risk === 'gated') expect(tool.summarize).toBeTypeOf('function');
    }
    expect(semanticsTools.map((x) => x.name)).toEqual([
      'run_sql', 'bank_overview', 'browse_semantics', 'resolve_semantics', 'set_workload', 'edit_semantics', 'validate_semantics', 'publish_semantics',
    ]);
  });

  it('toLlmTools builds valid specs with the catalog inputs and a required rationale', () => {
    const specs = toLlmTools(semanticsTools);
    for (const spec of specs) {
      expect(spec.description.length).toBeGreaterThan(10);
      const schema = spec.inputSchema as { type: string; properties: Record<string, unknown>; required: string[] };
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('rationale');
      const input = catalog.tools.find((c) => c.name === spec.name)!.input;
      const keys = typeof input === 'object' && input ? Object.keys(input) : ['goal', 'questions']; // set_workload: "Workload"
      for (const k of keys) expect(Object.keys(schema.properties)).toContain(k);
      expect(JSON.stringify(schema)).not.toContain('"$schema"');
    }
  });
});

describe('set_workload, bank_overview, validate_semantics', () => {
  it('saves the goal and questions and shows them in the overview', async () => {
    const res = await call(setWorkload, workload);
    expect(res).toMatchObject({ ok: true, summary: 'Saved the goal and 3 questions (2 picked).' });

    expect(setWorkload.input.safeParse({ rationale, ...workload, questions: [workload.questions[0], workload.questions[0]] }).success).toBe(false);

    await call(editSemantics, { expectedRevision: 0, ops: bankOps });
    const overview = await call(bankOverview);
    expect(overview.ok).toBe(true);
    if (!overview.ok) return;
    expect(overview.summary).toMatch(/^Draft \(revision 1\): 2 of 3 terms defined, .* 1 open decision; 1 card still to enrich\. 2 picked questions, 2 not covered yet\. No version published yet\.$/);
    expect(overview.result).toMatchObject({
      version: 'draft', activeVersion: null, draft: { revision: 1, hasChanges: true },
      counts: { terms: 3, enriched: 2, constraints: 1, openDecisions: 1, evidence: 1 },
      cardsToEnrich: { total: 1, items: [{ id: 'T_magasin', name: 'Magasin' }] },
      openDecisions: { total: 1, items: [{ id: 'C_base', options: ['commandées', 'livrées'] }] },
      goal: workload.goal, uncoveredQuestions: ['Q01', 'Q02'],
    });
    expect(JSON.stringify(overview.result).length).toBeLessThan(6000);
  });

  it('defaults to the active version outside semantics mode and explains a missing version', async () => {
    const res = await call(bankOverview, {}, { ...ctx, mode: 'explore' });
    expect(res).toMatchObject({ ok: true, result: { version: 'uninitialized', activeVersion: null }, summary: expect.stringMatching(/^Nothing published yet/) });
    expect(await call(bankOverview, { version: 'v9' })).toMatchObject({ ok: false, code: 'NOT_FOUND', message: expect.stringContaining('v9') });
  });

  it('validate_semantics reports the open decision as a warning, as field errors', async () => {
    await call(editSemantics, { expectedRevision: 0, ops: bankOps });
    const res = await call(validateSemantics);
    expect(res).toMatchObject({
      ok: true, summary: 'Draft revision 1: 0 errors, 1 warning.',
      result: { revision: 1, validation: { errorCount: 0, warningCount: 1, warnings: [{ path: 'records.C_base.resolution', code: 'SEM_OPEN_DECISION' }] } },
    });
  });
});

describe('edit_semantics (S1, S2)', () => {
  it('S1: a bad reference, a bad vocabulary and procedural content come back as field errors', async () => {
    const res = await call(editSemantics, {
      expectedRevision: 0,
      ops: [
        term('T_commande', 'Commande', { definition: 'SELECT * FROM data.commandes' }),
        { op: 'upsertRecord', record: { kind: 'relation', body: { id: 'R_commande_client', source: 'T_commande', relation_type: 'association', target: 'T_absent', description: 'Une commande a un client' } } },
        { op: 'upsertRecord', record: { kind: 'relation', body: { id: 'R_bad_type', source: 'T_commande', relation_type: 'belongs_to', target: 'T_commande', description: 'x' } } },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.result as { revision: number; validation: { errors: { path: string; code: string }[] } };
    expect(r.revision).toBe(1);
    expect(r.validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'records.T_commande.definition', code: 'SEM_PROCEDURAL_CONTENT' }),
      expect.objectContaining({ path: 'records.R_commande_client.target', code: 'SEM_BAD_REFERENCE' }),
      expect.objectContaining({ path: 'records.R_bad_type.relation_type', code: 'SEM_BAD_VOCABULARY' }),
    ]));
    expect(res.summary).toMatch(/^Applied 3 changes to the draft \(now revision 1\)\. 3 errors, 0 warnings\. To fix:\n- records\./);
  });

  it('S2: the server writes the evidence result; a write query is refused with SQL_REJECTED', async () => {
    await call(editSemantics, {
      expectedRevision: 0,
      ops: [
        { op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_ok', source: 'x', query: 'SELECT 42 AS answer', validation_method: 'v' } } },
        { op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_bad', source: 'x', query: 'DELETE FROM data.x', validation_method: 'v' } } },
      ],
    });
    const store = t.ctx.services.semantics;
    expect((await store.getRecord(ctx.projectId, 'draft', 'E_ok'))!.body).toMatchObject({ result: expect.stringContaining('42') });
    expect((await store.getRecord(ctx.projectId, 'draft', 'E_bad'))!.body).toMatchObject({ result: expect.stringContaining('SQL_REJECTED') });
    // The agent can't write `result` itself: it is not an input.
    const parsed = parse(editSemantics, { expectedRevision: 1, ops: [{ op: 'upsertRecord', record: { kind: 'evidence', body: { id: 'E_x', source: 'x', validation_method: 'v', result: 'forged' } } }] });
    expect(JSON.stringify(parsed)).not.toContain('forged');
  });

  it('returns errors instead of throwing: rejected ops, stale revision, viewer', async () => {
    expect(await call(editSemantics, { expectedRevision: 0, ops: [{ op: 'remove', recordId: 'T_absent' }] }))
      .toMatchObject({ ok: false, code: 'SEM_OPS_REJECTED', message: expect.stringContaining('ops[0] [SEM_BAD_REFERENCE]') });
    await call(editSemantics, { expectedRevision: 0, ops: bankOps });
    expect(await call(editSemantics, { expectedRevision: 0, ops: [{ op: 'remove', recordId: 'T_magasin' }] }))
      .toMatchObject({ ok: false, code: 'VERSION_CONFLICT', hint: expect.stringContaining('revision 1') });
    expect(await call(editSemantics, { expectedRevision: 1, ops: [{ op: 'remove', recordId: 'T_magasin' }] }, { ...ctx, user: ben }))
      .toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('publish_semantics, browse_semantics, resolve_semantics (S3, S4, S5)', () => {
  const publishArgs = (expectedRevision: number) => ({
    expectedRevision,
    summary: 'Ce que veulent dire les retours',
    limitations: ['La cuisine est connue à partir d’août'],
    questionLinks: { Q02: ['T_taux_retour', 'C_base'] },
  });

  it('S3: refuses an open decision, then publishes v0 with the resolution by the current user', async () => {
    await call(setWorkload, workload);
    await call(editSemantics, { expectedRevision: 0, ops: bankOps });

    const card = await publishSemantics.summarize!(parse(publishSemantics, publishArgs(1)), ctx);
    expect(card).toMatch(/^Adopt 2 definitions, 0 relations and 1 rule as the official meaning of your data \(version v0\)\./);
    expect(card).toContain('Still waiting for your choice');

    const refused = await call(publishSemantics, publishArgs(1));
    expect(refused).toMatchObject({ ok: false, code: 'SEM_OPEN_DECISION', message: expect.stringContaining('records.C_base.resolution'), hint: expect.any(String) });
    expect(await t.ctx.services.semantics.activeVersion(ctx.projectId)).toBeNull();

    await call(editSemantics, { expectedRevision: 1, ops: [{ op: 'resolveConstraint', recordId: 'C_base', choice: 'livrées' }] });
    const approval = await publishSemantics.summarize!(parse(publishSemantics, publishArgs(2)), ctx);
    expect(approval).toBe([
      'Adopt 2 definitions, 0 relations and 1 rule as the official meaning of your data (version v0).',
      'In short: Ce que veulent dire les retours',
      'Your decisions:',
      '- Mesuré sur les quantités commandées ou livrées → livrées',
      'Answers 1 of your 2 questions.',
      'Known limitations:',
      '- La cuisine est connue à partir d’août',
    ].join('\n'));

    const published = await call(publishSemantics, publishArgs(2));
    expect(published).toMatchObject({ ok: true, result: { version: 'v0', counts: { enriched: 2, constraints: 1, openDecisions: 0 } } });
    expect(published.ok && published.summary).toMatch(/^Published version v0: 2 definitions, 0 relations and 1 rule are now the official meaning of the data/);
    const c = (await t.ctx.services.semantics.getRecord(ctx.projectId, 'v0', 'C_base'))!.body as SemConstraint;
    expect(c.resolution).toMatchObject({ choice: 'livrées', by: ada.id });
    expect(await ctx.semantics.activeVersion(ctx.projectId)).toBe('v0');
  });

  it('a viewer cannot publish', async () => {
    await call(setWorkload, workload);
    await call(editSemantics, { expectedRevision: 0, ops: [term('T_x', 'X')] });
    expect(await call(publishSemantics, publishArgs(1), { ...ctx, user: ben })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('S4: browse ranks Retour first for "retour"; resolve returns the decided rule and its evidence', async () => {
    await call(setWorkload, workload);
    await call(editSemantics, { expectedRevision: 0, ops: bankOps });
    // Nothing published yet: the active bank is empty, and the summary says where to look.
    expect(await call(browseSemantics, { query: 'retour' })).toMatchObject({ ok: true, summary: expect.stringContaining("version: 'draft'") });
    expect(okResult<{ items: { id: string }[] }>(await call(browseSemantics, { query: 'retour', version: 'draft' })).items[0]!.id).toBe('T_retour');

    await call(editSemantics, { expectedRevision: 1, ops: [{ op: 'resolveConstraint', recordId: 'C_base', choice: 'commandées' }] });
    expect(await call(publishSemantics, publishArgs(2))).toMatchObject({ ok: true });

    const browsed = await call(browseSemantics, { query: 'retour' }, { ...ctx, mode: 'explore' });
    expect(browsed.ok).toBe(true);
    const items = okResult<{ version: string; items: { id: string; kind: string }[] }>(browsed);
    expect(items.version).toBe('active');
    expect(items.items[0]).toMatchObject({ id: 'T_retour', kind: 'term' });
    expect(items.items.length).toBeLessThanOrEqual(6);
    expect(browsed.ok && browsed.summary).toMatch(/^\d+ match(es)? for "retour": Retour \(term\)/);
    expect(okResult<{ items: { id: string }[] }>(await call(browseSemantics, { query: 'RMA' })).items[0]!.id).toBe('T_retour');
    const all = okResult<{ items: { id: string }[] }>(await call(browseSemantics, { query: 'taux de retour', kind: 'all' }));
    expect(all.items.map((i) => i.id)).toEqual(expect.arrayContaining(['T_taux_retour', 'C_base']));

    const resolved = await call(resolveSemantics, { mentions: ['taux de retour', 'inconnu'], context: 'Quel est le taux de retour par mois ?' }, { ...ctx, mode: 'explore' });
    expect(resolved).toMatchObject({
      ok: true,
      summary: 'v0: "taux de retour" → Taux de retour: 0 mappings, 1 rule (1 decided); "inconnu" not found.',
      result: { version: 'v0', mentions: [
        { mention: 'taux de retour', term: { id: 'T_taux_retour' }, constraints: [{ id: 'C_base', resolution: { choice: 'commandées', by: ada.id } }], evidence: [{ id: 'E_rma', result: expect.any(String) }] },
        { mention: 'inconnu', mappings: [], constraints: [] },
      ] },
    });
    expect(resolveSemantics.input.safeParse({ rationale, mentions: ['a', 'b', 'c', 'd', 'e', 'f'], context: '' }).success).toBe(false);
  });

  it('S5: editing after publish starts a new draft; v0 is unchanged', async () => {
    await call(setWorkload, workload);
    await call(editSemantics, { expectedRevision: 0, ops: [term('T_x', 'X')] });
    expect(await call(publishSemantics, { ...publishArgs(1), questionLinks: { Q02: ['T_x'] } })).toMatchObject({ ok: true, result: { version: 'v0' } });
    const edit = await call(editSemantics, { expectedRevision: 0, ops: [term('T_x', 'X', { definition: 'Changed' }), term('T_y', 'Y')] });
    expect(edit).toMatchObject({ ok: true, result: { revision: 1 } });
    expect((await t.ctx.services.semantics.getRecord(ctx.projectId, 'v0', 'T_x'))!.body).toMatchObject({ definition: 'X, as observed in the data' });
    expect(await t.ctx.services.semantics.recordExists(ctx.projectId, 'v0', 'T_y')).toBe(false);
    expect(await call(bankOverview)).toMatchObject({ ok: true, result: { version: 'draft', activeVersion: 'v0', counts: { terms: 2 } } });
  });
});
