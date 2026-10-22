import type { ActionTypeDef, ObjectTypeDef, PropertyDef, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../src/db/index.js';
import { toSqlName as sqlName } from '../src/modules/objects/model.js';

// A tiny Kumo-shaped world for the action tests: lots of production, kitchen-days with a capacity,
// clients, articles and unsold declarations. Publish (T-14) isn't built yet, so the tables and views it
// will create are built here by hand, following 03-data-model §3 exactly.

const prop = (apiName: string, type: PropertyDef['type'], editable = false, extra: Partial<PropertyDef> = {}): PropertyDef => ({
  apiName,
  column: sqlName(apiName),
  type,
  displayName: apiName,
  description: `${apiName} (test)`,
  aliases: [],
  editable,
  ...extra,
});

const objectType = (apiName: string, primaryKey: string, properties: PropertyDef[]): ObjectTypeDef => ({
  apiName,
  displayName: apiName,
  pluralDisplayName: `${apiName}s`,
  description: `${apiName} (test)`,
  aliases: [],
  source: { kind: 'dataset', datasetId: `act_${sqlName(apiName)}` },
  primaryKey,
  titleProperty: primaryKey,
  properties,
  status: 'active',
});

export const KITCHENS = ['Frepillon', 'Gennevilliers'];

export const reaffecterProduction: ActionTypeDef = {
  apiName: 'ReaffecterProduction',
  displayName: 'Réaffecter une production',
  description: 'Move a production lot to another kitchen.',
  agentDescription: 'Changes the kitchen of a lot; refused if the target kitchen-day would go over capacity.',
  parameters: [
    { id: 'lot', displayName: 'Lot', description: 'The lot to move', required: true, kind: 'object', objectType: 'LotProduction' },
    {
      id: 'cuisineCible',
      displayName: 'Cuisine cible',
      description: 'Target kitchen',
      required: true,
      kind: 'value',
      type: 'string',
      allowedValues: KITCHENS,
    },
  ],
  rules: [{ kind: 'modifyObject', object: 'lot', set: { lieuProduction: { kind: 'param', param: 'cuisineCible' } } }],
  submissionCriteria: [
    {
      kind: 'compare',
      left: { kind: 'paramProperty', param: 'lot', property: 'lieuProduction' },
      op: 'neq',
      right: { kind: 'param', param: 'cuisineCible' },
      failureMessage: 'The lot is already produced in {{cuisineCible}}.',
    },
    {
      kind: 'rule',
      objectType: 'CuisineJour',
      rule: 'surcharge',
      object: {
        kind: 'lookup',
        objectType: 'CuisineJour',
        keys: { lieu: { kind: 'param', param: 'cuisineCible' }, date: { kind: 'paramProperty', param: 'lot', property: 'dateProduction' } },
      },
      expect: false,
      afterEdits: true,
      failureMessage: '{{object.lieu}} would be over capacity on {{object.date}} ({{object.charge}} for {{object.capacite}}).',
    },
  ],
  successMessage: 'Lot {{lot}} is now produced in {{cuisineCible}}.',
};

export const declarerInvendus: ActionTypeDef = {
  apiName: 'DeclarerInvendus',
  displayName: 'Déclarer des invendus',
  description: 'Record unsold quantities of an article at a client.',
  agentDescription: 'Creates an Invendu linked to a client and an article.',
  parameters: [
    { id: 'client', displayName: 'Client', description: 'Store', required: true, kind: 'object', objectType: 'Client' },
    { id: 'article', displayName: 'Article', description: 'Article', required: true, kind: 'object', objectType: 'Article' },
    { id: 'quantite', displayName: 'Quantité', description: 'Units', required: true, kind: 'value', type: 'integer' },
    { id: 'reference', displayName: 'Référence', description: 'Declaration id', required: true, kind: 'value', type: 'string' },
  ],
  rules: [
    {
      kind: 'createObject',
      objectType: 'Invendu',
      primaryKey: { kind: 'param', param: 'reference' },
      set: {
        client: { kind: 'paramProperty', param: 'client', property: 'codeClient' },
        article: { kind: 'paramProperty', param: 'article', property: 'codeArticle' },
        quantite: { kind: 'param', param: 'quantite' },
        declarePar: { kind: 'currentUser' },
      },
    },
  ],
  submissionCriteria: [
    { kind: 'compare', left: { kind: 'param', param: 'quantite' }, op: 'gt', right: { kind: 'literal', value: 0 }, failureMessage: 'The quantity must be positive.' },
  ],
  successMessage: '{{quantite}} unsold units of {{article.libelle}} recorded for {{client.nom}}.',
};

export function kumoActionsDoc(): WorkspaceDoc {
  return {
    semanticVersion: 'v0',
    pipelines: [],
    objectTypes: [
      objectType('LotProduction', 'lotId', [
        prop('lotId', 'string'),
        prop('lieuProduction', 'string', true),
        prop('dateProduction', 'date'),
        prop('quantite', 'integer'),
        prop('article', 'string'),
      ]),
      objectType('CuisineJour', 'id', [prop('id', 'string'), prop('lieu', 'string'), prop('date', 'date'), prop('capacite', 'integer')]),
      objectType('Client', 'codeClient', [prop('codeClient', 'string'), prop('nom', 'string')]),
      objectType('Article', 'codeArticle', [prop('codeArticle', 'string'), prop('libelle', 'string')]),
      objectType('Invendu', 'reference', [
        prop('reference', 'string'),
        prop('client', 'string'),
        prop('article', 'string'),
        prop('quantite', 'integer'),
        prop('declarePar', 'string', true),
      ]),
    ],
    linkTypes: [],
    logic: [
      {
        apiName: 'charge',
        objectType: 'CuisineJour',
        displayName: 'Charge',
        description: 'Units planned',
        kind: 'derived',
        type: 'integer',
        expr: { aggregate: { link: 'lots', fn: 'sum', property: 'quantite' } },
      },
      {
        apiName: 'surcharge',
        objectType: 'CuisineJour',
        displayName: 'Surcharge',
        description: 'Over capacity',
        kind: 'rule',
        condition: { kind: 'cmpProps', left: 'charge', op: 'gt', right: 'capacite' },
      },
    ],
    actionTypes: [reaffecterProduction, declarerInvendus],
    apps: [],
    automations: [],
  };
}

const PG: Record<PropertyDef['type'], string> = {
  string: 'text',
  integer: 'integer',
  double: 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
};

// edits.<t> and ont.<t> exactly as 03-data-model §3 describes them.
function editsTableSql(type: ObjectTypeDef): string {
  const t = sqlName(type.apiName);
  const cols = type.properties
    .filter((p) => p.editable && p.apiName !== type.primaryKey)
    .map((p) => `  ${p.column} ${PG[p.type]},\n`)
    .join('');
  return `CREATE TABLE IF NOT EXISTS edits.${t} (
  pk text PRIMARY KEY,
${cols}  _nulls text[] NOT NULL DEFAULT '{}',
  _deleted boolean NOT NULL DEFAULT false,
  _created boolean NOT NULL DEFAULT false,
  _values jsonb,
  _edited_at timestamptz NOT NULL DEFAULT now(),
  _edited_by text NOT NULL,
  _action_run_id uuid
)`;
}

export function ontViewSql(type: ObjectTypeDef, source: string): string {
  const t = sqlName(type.apiName);
  const pkCol = sqlName(type.primaryKey);
  const exprs = type.properties.map((p) => {
    const c = p.column!;
    if (p.apiName === type.primaryKey) return `COALESCE(s.${c}, e.pk) AS ${c}`;
    if (p.editable) return `CASE WHEN '${c}' = ANY(e._nulls) THEN NULL ELSE COALESCE(e.${c}, s.${c}) END AS ${c}`;
    return `COALESCE(s.${c}, (e._values->>'${c}')::${PG[p.type]}) AS ${c}`;
  });
  return `CREATE OR REPLACE VIEW ont.${t} AS
SELECT ${exprs.join(',\n       ')}
FROM ${source} s
FULL OUTER JOIN edits.${t} e ON e.pk = s.${pkCol}::text
WHERE COALESCE(e._deleted, false) = false
  AND (s.${pkCol} IS NOT NULL OR e._created)`;
}

const SOURCES: Record<string, { table: string; columns: string; rows: string }> = {
  LotProduction: {
    table: 'data.act_lots_v1',
    columns: 'lot_id text, lieu_production text, date_production date, quantite integer, article text',
    rows: `('LOT-1','Frepillon','2025-10-14',6,'ART-1'), ('LOT-2','Frepillon','2025-10-14',15,'ART-1'),
           ('LOT-3','Gennevilliers','2025-10-14',10,'ART-1'), ('LOT-4','Frepillon','2025-10-15',3,'ART-1')`,
  },
  CuisineJour: {
    table: 'data.act_cuisine_jours_v1',
    columns: 'id text, lieu text, date date, capacite integer',
    rows: `('Frepillon|2025-10-14','Frepillon','2025-10-14',25), ('Gennevilliers|2025-10-14','Gennevilliers','2025-10-14',20),
           ('Frepillon|2025-10-15','Frepillon','2025-10-15',25)`,
  },
  Client: { table: 'data.act_clients_v1', columns: 'code_client text, nom text', rows: `('C0421','Magasin A'), ('C0500','Magasin B')` },
  Article: { table: 'data.act_articles_v1', columns: 'code_article text, libelle text', rows: `('ART-1','Poké Saumon')` },
  Invendu: {
    table: 'data.act_invendus_v1',
    columns: 'reference text, client text, article text, quantite integer, declare_par text',
    rows: '',
  },
};

export type ActionsWorld = { projectId: string; ownerId: string; viewerId: string; doc: WorkspaceDoc };

// Creates a dedicated project (owner Ada, viewer Ben), the source tables, edits tables, ont and logic
// views, a published workspace version 1 and a draft. Idempotent: drops what it created before.
export async function setupActionsWorld(db: Db): Promise<ActionsWorld> {
  const doc = kumoActionsDoc();
  const users = await db.selectFrom('meta.users').select(['id', 'email']).where('email', 'in', ['ada@kumo.test', 'ben@kumo.test']).execute();
  const ownerId = users.find((u) => u.email === 'ada@kumo.test')!.id;
  const viewerId = users.find((u) => u.email === 'ben@kumo.test')!.id;

  await db.deleteFrom('meta.projects').where('name', '=', 'Actions test').execute();
  const { id: projectId } = await db
    .insertInto('meta.projects')
    .values({ name: 'Actions test', created_by: ownerId })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('meta.project_members')
    .values([
      { project_id: projectId, user_id: ownerId, role: 'owner' },
      { project_id: projectId, user_id: viewerId, role: 'viewer' },
    ])
    .execute();

  for (const type of doc.objectTypes) {
    const t = sqlName(type.apiName);
    await sql.raw(`DROP VIEW IF EXISTS logic.${t} CASCADE`).execute(db);
    await sql.raw(`DROP VIEW IF EXISTS ont.${t} CASCADE`).execute(db);
    await sql.raw(`DROP TABLE IF EXISTS edits.${t} CASCADE`).execute(db);
  }
  await sql.raw('DROP TABLE IF EXISTS data.act_lots_v2 CASCADE').execute(db);
  for (const type of doc.objectTypes) {
    const src = SOURCES[type.apiName]!;
    await sql.raw(`DROP TABLE IF EXISTS ${src.table} CASCADE`).execute(db);
    await sql.raw(`CREATE TABLE ${src.table} (${src.columns})`).execute(db);
    if (src.rows) await sql.raw(`INSERT INTO ${src.table} VALUES ${src.rows}`).execute(db);
    await sql.raw(editsTableSql(type)).execute(db);
    await sql.raw(ontViewSql(type, src.table)).execute(db);
  }

  // logic.* = ont.* + derived properties and rules (03 §7), written by hand here.
  await sql.raw('CREATE VIEW logic.lot_production AS SELECT o.* FROM ont.lot_production o').execute(db);
  await sql.raw(`CREATE VIEW logic.cuisine_jour AS
    SELECT x.*, (x.charge > x.capacite) AS surcharge FROM (
      SELECT o.*, (SELECT COALESCE(sum(l.quantite), 0) FROM logic.lot_production l
                   WHERE l.lieu_production = o.lieu AND l.date_production = o.date)::integer AS charge
      FROM ont.cuisine_jour o) x`).execute(db);
  for (const t of ['client', 'article', 'invendu']) {
    await sql.raw(`CREATE VIEW logic.${t} AS SELECT o.* FROM ont.${t} o`).execute(db);
  }

  await sql`INSERT INTO meta.workspace_versions (project_id, version, sem_version, doc, message, published_by, published_via)
            VALUES (${projectId}, 1, 'v0', ${JSON.stringify(doc)}::jsonb, 'test publish', ${ownerId}, 'ui')`.execute(db);

  // The draft adds an action that is not published yet.
  const draft: WorkspaceDoc = {
    ...doc,
    actionTypes: [
      ...doc.actionTypes,
      {
        apiName: 'AnnulerLot',
        displayName: 'Annuler un lot',
        description: 'Cancel a lot.',
        agentDescription: 'Deletes a production lot.',
        parameters: [{ id: 'lot', displayName: 'Lot', description: 'Lot', required: true, kind: 'object', objectType: 'LotProduction' }],
        rules: [{ kind: 'deleteObject', object: 'lot' }],
        submissionCriteria: [],
        successMessage: 'Lot {{lot}} cancelled.',
      },
    ],
  };
  await sql`INSERT INTO meta.workspace_drafts (project_id, base_version, sem_version, revision, doc)
            VALUES (${projectId}, 1, 'v0', 3, ${JSON.stringify(draft)}::jsonb)`.execute(db);

  return { projectId, ownerId, viewerId, doc };
}

// Removes the test project (its versions, draft and action log cascade) and the generated objects, so
// other test files see only the seeded project.
export async function teardownActionsWorld(db: Db): Promise<void> {
  await db.deleteFrom('meta.projects').where('name', '=', 'Actions test').execute();
  for (const type of kumoActionsDoc().objectTypes) {
    const t = sqlName(type.apiName);
    await sql.raw(`DROP VIEW IF EXISTS logic.${t} CASCADE`).execute(db);
    await sql.raw(`DROP VIEW IF EXISTS ont.${t} CASCADE`).execute(db);
    await sql.raw(`DROP TABLE IF EXISTS edits.${t} CASCADE`).execute(db);
  }
  for (const src of [...Object.values(SOURCES).map((s) => s.table), 'data.act_lots_v2']) {
    await sql.raw(`DROP TABLE IF EXISTS ${src} CASCADE`).execute(db);
  }
}

// A pipeline rebuild (A4): a new version of the lots table, and ont.lot_production re-pointed at it.
export async function rebuildLots(db: Db): Promise<void> {
  await sql.raw('CREATE TABLE data.act_lots_v2 AS SELECT * FROM data.act_lots_v1').execute(db);
  const doc = kumoActionsDoc();
  await sql.raw(ontViewSql(doc.objectTypes[0]!, 'data.act_lots_v2')).execute(db);
}
