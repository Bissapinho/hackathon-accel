import type { ColumnInfo, ObjectTypeDef, PipelineDef, PropertyDef, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';

// T-13 data half (W1, W2 data checks): the workspace DataChecker is wired to the pipelines service
// (pipeline SQL and checks, primary keys) on a tiny order-lines table.

let t: TestApp;
let projectId: string;
let datasetId: string;
const shortId = `w${Math.random().toString(36).slice(2, 9).padEnd(7, '0')}`.slice(0, 8);
const dsTable = `ds_${shortId}_v1`;

const columns: ColumnInfo[] = [
  { name: 'No_Transaction', sqlName: 'no_transaction', type: 'string', nullable: false, sample: [] },
  { name: 'Quantite', sqlName: 'quantite', type: 'integer', nullable: false, sample: [] },
  { name: 'ID_Client', sqlName: 'id_client', type: 'string', nullable: true, sample: [] },
];
const rows: [string, number, string | null][] = [
  ['SO-1', 2, 'C1'],
  ['SO-1', 1, 'C1'],
  ['SO-2', 5, 'C2'],
  ['SO-3', 3, null],
];

const prop = (apiName: string, column: string, type: 'string' | 'integer'): PropertyDef => ({
  apiName,
  column,
  type,
  displayName: apiName,
  description: `The ${apiName} of the object.`,
  aliases: [],
  editable: false,
});

function objectType(apiName: string, source: ObjectTypeDef['source'], pk: PropertyDef, extra: PropertyDef[] = []): ObjectTypeDef {
  return {
    apiName,
    displayName: apiName,
    pluralDisplayName: `${apiName}s`,
    description: `A ${apiName}.`,
    aliases: [],
    term: 'T_commande',
    source,
    primaryKey: pk.apiName,
    titleProperty: pk.apiName,
    status: 'active',
    properties: [pk, ...extra],
  };
}

function docWith(pipelines: PipelineDef[], objectTypes: ObjectTypeDef[]): WorkspaceDoc {
  return { semanticVersion: 'v0', pipelines, objectTypes, linkTypes: [], logic: [], actionTypes: [], apps: [], automations: [] };
}

let commandes: PipelineDef;
let lignes: PipelineDef;

beforeAll(async () => {
  t = await buildTestApp();
  const adaId = (await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow()).id;
  projectId = (
    await t.db.insertInto('meta.projects').values({ name: `workspace data ${shortId}`, created_by: adaId }).returning('id').executeTakeFirstOrThrow()
  ).id;
  await t.db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE mini_app`.execute(trx);
    await sql`CREATE TABLE ${sql.id('data', dsTable)} (no_transaction text, quantite bigint, id_client text, _row integer)`.execute(trx);
    for (const [i, r] of rows.entries()) {
      await sql`INSERT INTO ${sql.id('data', dsTable)} VALUES (${r[0]}, ${r[1]}, ${r[2]}, ${i + 1})`.execute(trx);
    }
  });
  datasetId = (
    await sql<{ id: string }>`INSERT INTO meta.datasets (project_id, short_id, name, current_version, created_by)
      VALUES (${projectId}, ${shortId}, 'LIGNES', 1, ${adaId}) RETURNING id`.execute(t.db)
  ).rows[0]!.id;
  await sql`INSERT INTO meta.dataset_versions (dataset_id, version, transaction_type, table_name, row_count, columns, source_file, created_by)
    VALUES (${datasetId}, 1, 'SNAPSHOT', ${`data.${dsTable}`}, ${rows.length}, ${JSON.stringify(columns)}, 'test.csv', ${adaId})`.execute(t.db);

  commandes = {
    apiName: 'commandes',
    description: 'One row per order.',
    nodes: [
      { id: 'src', kind: 'source', datasetId },
      {
        id: 'doc',
        kind: 'aggregate',
        input: 'src',
        groupBy: ['no_transaction'],
        measures: [{ as: 'quantite', fn: 'sum', column: 'quantite' }],
      },
    ],
    outputs: [{ apiName: 'commandes', node: 'doc' }],
    checks: [{ output: 'commandes', kind: 'unique', columns: ['no_transaction'] }],
  };
  lignes = {
    apiName: 'lignes',
    description: 'Raw order lines.',
    nodes: [{ id: 'src', kind: 'source', datasetId }],
    outputs: [{ apiName: 'lignes', node: 'src' }],
    checks: [{ output: 'lignes', kind: 'unique', columns: ['no_transaction'] }],
  };
});

afterAll(async () => {
  await sql.raw(`DROP TABLE IF EXISTS data.${dsTable}`).execute(t.db);
  await t.db.deleteFrom('meta.projects').where('id', '=', projectId).execute();
  await t.close();
});

async function validate(doc: WorkspaceDoc) {
  await sql`DELETE FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(t.db);
  await sql`INSERT INTO meta.workspace_drafts (project_id, doc) VALUES (${projectId}, ${JSON.stringify(doc)})`.execute(t.db);
  return t.ctx.services.workspace.validateDraft(projectId);
}

describe('T-13 data checks', () => {
  it('W1: a sound workspace has no errors, data checks included', async () => {
    const doc = docWith([commandes], [objectType('Commande', { kind: 'pipeline', pipeline: 'commandes', output: 'commandes' }, prop('noTransaction', 'no_transaction', 'string'))]);
    const v = await validate(doc);
    expect(v.errors).toEqual([]);
  });

  it('W2: a failing unique check is PIPELINE_CHECK_FAILED with the path of the check', async () => {
    const v = await validate(docWith([commandes, lignes], []));
    expect(v.errors).toEqual([expect.objectContaining({ path: 'pipelines[1].checks[0]', code: 'PIPELINE_CHECK_FAILED' })]);
    expect(v.errors[0]!.message).toMatch(/\d/);
  });

  it('W2: a primary key on a non-unique column is PK_NOT_UNIQUE, on a column with gaps PK_HAS_NULLS', async () => {
    const lignesOk: PipelineDef = { ...lignes, checks: [] };
    const doc = docWith(
      [lignesOk],
      [
        objectType('Ligne', { kind: 'pipeline', pipeline: 'lignes', output: 'lignes' }, prop('noTransaction', 'no_transaction', 'string')),
        objectType('Client', { kind: 'dataset', datasetId }, prop('idClient', 'id_client', 'string')),
      ],
    );
    const v = await validate(doc);
    const codes = v.errors.map((e) => `${e.path}:${e.code}`);
    expect(codes).toContain('objectTypes[0].primaryKey:PK_NOT_UNIQUE');
    expect(codes).toContain('objectTypes[1].primaryKey:PK_HAS_NULLS');
  });

  it('a cast that loses values fails its notNull check', async () => {
    const bad: PipelineDef = {
      apiName: 'bad',
      description: 'Casts text that is not a number (gives nulls).',
      nodes: [
        { id: 'src', kind: 'source', datasetId },
        { id: 'n', kind: 'cast', input: 'src', column: 'no_transaction', to: 'integer' },
      ],
      outputs: [{ apiName: 'bad', node: 'n' }],
      checks: [{ output: 'bad', kind: 'notNull', columns: ['no_transaction'] }],
    };
    const v = await validate(docWith([bad], []));
    expect(v.errors.map((e) => e.code)).toContain('PIPELINE_CHECK_FAILED');
  });
});
