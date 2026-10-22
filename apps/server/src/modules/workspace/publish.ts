import { createHash } from 'node:crypto';
import type { BaseType, ColumnInfo, ObjectTypeDef, PipelineBuild, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import type { Config } from '../../config.js';
import type { Db } from '../../db/index.js';
import { ApiError } from '../../errors.js';
import type { SemanticsPort } from '../../ports.js';
import { buildLogicViews } from '../logic/service.js';
import type { PipelinesService } from '../pipelines/service.js';
import { literal, PG_TYPE, q, sqlName } from '../logic/sqltext.js';
import type { WorkspaceService } from './service.js';

// Publish (T-14, 03-data-model §3): one transaction as the server role, one publish at a time.
// Order: pipelines, indexes, edits tables + ont views, logic views, comments, history, retention.

export const PUBLISH_LOCK_KEY = 'mini-foundry-publish'; // hashtext() of it is the advisory lock id
export const RETENTION_ROWS = 500_000;

export type PublishProgress = { type: 'progress'; operation: 'publish'; step: string; done: number; total?: number };
export type PublishResult = { version: number; builds: PipelineBuild[] };

function splitTable(qualified: string): { schema: string; table: string } {
  const [schema, table] = qualified.includes('.') ? qualified.split('.', 2) : ['data', qualified];
  return { schema: schema!, table: table! };
}
const qt = (qualified: string) => {
  const { schema, table } = splitTable(qualified);
  return `${q(schema)}.${q(table)}`;
};

type SourceRow = { id: string; name: string; version: number; table_name: string; row_count: number; columns: ColumnInfo[] };

export function createPublishService(deps: {
  db: Db;
  config: Config;
  workspace: WorkspaceService;
  pipelines: PipelinesService;
  semantics: SemanticsPort;
  retentionRows?: number;
}) {
  const { db, workspace, pipelines, semantics } = deps;
  const retentionRows = deps.retentionRows ?? RETENTION_ROWS;
  const listeners = new Set<(projectId: string, ev: PublishProgress) => void>();

  // The agent loop (Part B) subscribes to turn these into SSE events.
  function onProgress(fn: (projectId: string, ev: PublishProgress) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function publish(args: {
    projectId: string;
    userId: string;
    via: 'ui' | 'agent';
    expectedRevision: number;
    message: string;
    onProgress?: (ev: PublishProgress) => void;
  }): Promise<PublishResult> {
    const { projectId, userId, via } = args;
    const emit = (step: string, done: number, total?: number) => {
      const ev: PublishProgress = { type: 'progress', operation: 'publish', step, done, ...(total !== undefined ? { total } : {}) };
      args.onProgress?.(ev);
      for (const l of listeners) l(projectId, ev);
    };

    // Cheap refusals first, without taking the lock.
    const draft = await workspace.getDraft(projectId);
    checkFresh(draft.revision, args.expectedRevision, draft.baseVersion, (await workspace.latestPublished(projectId))?.version ?? 0);

    // Validation gate: the draft is published only if it has no errors.
    const validation = await workspace.validateDraft(projectId);
    if (validation.errors.length > 0) {
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        `The draft has ${validation.errors.length} problem(s) that must be fixed before publishing.`,
        { details: validation.errors },
      );
    }
    const doc = draft.doc;
    const semVersion = doc.semanticVersion || (await semantics.activeVersion(projectId));
    if (!semVersion) {
      throw new ApiError(409, 'NO_SEMANTIC_VERSION', 'The workspace is not built on a published meaning of the data yet.', {
        hint: 'Publish the semantic bank first, then publish the workspace.',
      });
    }
    const docToStore: WorkspaceDoc = { ...doc, semanticVersion: semVersion };

    return db.transaction().execute(async (trx) => {
      const got = await sql<{ ok: boolean }>`SELECT pg_try_advisory_xact_lock(hashtext(${PUBLISH_LOCK_KEY})) AS ok`.execute(trx);
      if (!got.rows[0]?.ok) {
        throw new ApiError(409, 'PUBLISH_IN_PROGRESS', 'Another publish is running.', { hint: 'Wait for it to finish, then publish again.' });
      }
      await sql`SET LOCAL ROLE mini_app`.execute(trx); // objects created here belong to the server role, which grants mini_reader

      // Re-check under the lock: someone may have published or edited while we waited.
      const latest = await trx
        .selectFrom('meta.workspace_versions')
        .select('version')
        .where('project_id', '=', projectId)
        .orderBy('version', 'desc')
        .limit(1)
        .executeTakeFirst();
      const version = (latest?.version ?? 0) + 1;
      checkFresh(draft.revision, args.expectedRevision, draft.baseVersion, latest?.version ?? 0);

      // ── 1. Pipelines ──
      const total = docToStore.pipelines.length;
      const builds: PipelineBuild[] = [];
      for (const [i, def] of docToStore.pipelines.entries()) {
        emit(`Building pipeline ${def.apiName}`, i, total);
        const built = await pipelines.buildPipeline(trx, { projectId, def, workspaceVersion: version });
        const failed = built.find((b) => b.status === 'failed');
        if (failed) {
          const bad = failed.checks.filter((c) => !c.ok).map((c) => c.detail).join('; ');
          throw new ApiError(422, 'PIPELINE_CHECK_FAILED', `The pipeline "${def.apiName}" built, but a check on its data failed: ${bad}`, {
            hint: 'Fix the pipeline or the check in the draft, then publish again. Nothing was published.',
          });
        }
        builds.push(...built);
      }
      emit('Pipelines are built', total, total);

      // Source table of every object type.
      const datasets = await loadDatasets(trx, projectId);
      const sources = new Map<string, string>();
      for (const t of docToStore.objectTypes) sources.set(t.apiName, sourceTable(t, builds, datasets));

      // ── 2. Indexes ──
      emit('Indexing the data', 0, docToStore.objectTypes.length);
      for (const [name, columns] of indexColumns(docToStore)) {
        for (const column of columns) {
          const table = sources.get(name)!;
          const idx = `ix_${createHash('sha1').update(`${table}.${column}`).digest('hex').slice(0, 16)}`;
          await sql.raw(`CREATE INDEX IF NOT EXISTS ${q(idx)} ON ${qt(table)} (${q(column)})`).execute(trx);
        }
      }

      // ── 3. Edits tables and ont views ──
      const keepOnt = new Set(docToStore.objectTypes.map((t) => sqlName(t.apiName)));
      // Logic views sit on ont views: drop them all first, they are rebuilt in step 4.
      const logicViews = await sql<{ viewname: string }>`SELECT viewname FROM pg_views WHERE schemaname = 'logic'`.execute(trx);
      for (const { viewname } of logicViews.rows) await sql.raw(`DROP VIEW IF EXISTS logic.${q(viewname)} CASCADE`).execute(trx);
      const ontViews = await sql<{ viewname: string }>`SELECT viewname FROM pg_views WHERE schemaname = 'ont'`.execute(trx);
      for (const { viewname } of ontViews.rows) {
        if (!keepOnt.has(viewname)) await sql.raw(`DROP VIEW IF EXISTS ont.${q(viewname)} CASCADE`).execute(trx);
      }
      for (const [i, t] of docToStore.objectTypes.entries()) {
        emit(`Creating ${t.displayName}`, i, docToStore.objectTypes.length);
        for (const statement of editsSql(t)) await sql.raw(statement).execute(trx);
        await sql.raw(`DROP VIEW IF EXISTS ont.${q(sqlName(t.apiName))} CASCADE`).execute(trx);
        await sql.raw(ontViewSql(t, sources.get(t.apiName)!)).execute(trx);
        await sql.raw(`GRANT SELECT ON ont.${q(sqlName(t.apiName))} TO mini_reader`).execute(trx);
      }

      // ── 4. Logic views ──
      emit('Adding calculations and rules', 0, 1);
      await buildLogicViews(trx, docToStore);

      // ── 5. Comments ──
      emit('Describing the data', 0, 1);
      for (const t of docToStore.objectTypes) {
        for (const statement of await commentStatements(t, projectId, semVersion, semantics)) {
          await sql.raw(statement).execute(trx);
        }
      }

      // ── History, draft bookkeeping ──
      const current = await trx
        .selectFrom('meta.workspace_drafts')
        .select('revision')
        .where('project_id', '=', projectId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (current.revision !== draft.revision) {
        throw new ApiError(409, 'VERSION_CONFLICT', 'The draft changed while publishing; nothing was published.', {
          hint: 'Read the draft again and publish again.',
        });
      }
      await trx
        .insertInto('meta.workspace_versions')
        .values({
          project_id: projectId,
          version,
          sem_version: semVersion,
          doc: JSON.stringify(docToStore),
          message: args.message,
          published_by: userId,
          published_via: via,
        })
        .execute();
      await trx
        .updateTable('meta.workspace_drafts')
        .set({ base_version: version, sem_version: semVersion, doc: JSON.stringify(docToStore), revision: current.revision + 1, updated_by: userId, updated_at: new Date() })
        .where('project_id', '=', projectId)
        .execute();

      // ── Retention of big datasets ──
      await applyRetention(trx, docToStore, datasets);
      emit('Published', 1, 1);
      return { version, builds };
    });
  }

  async function applyRetention(trx: Db, doc: WorkspaceDoc, datasets: Map<string, SourceRow>): Promise<void> {
    const used = new Set<string>();
    for (const p of doc.pipelines) for (const n of p.nodes) if (n.kind === 'source') used.add(datasets.get(n.datasetId)?.id ?? '');
    for (const t of doc.objectTypes) if (t.source.kind === 'dataset') used.add(datasets.get(t.source.datasetId)?.id ?? '');
    for (const id of used) {
      const ds = [...datasets.values()].find((d) => d.id === id);
      if (!ds || ds.row_count <= retentionRows) continue;
      const old = await trx
        .selectFrom('meta.dataset_versions')
        .select(['id', 'table_name'])
        .where('dataset_id', '=', id)
        .where('version', '<', ds.version)
        .where('dropped_at', 'is', null)
        .execute();
      for (const v of old) {
        await sql.raw(`DROP TABLE IF EXISTS ${qt(v.table_name)}`).execute(trx);
        await trx.updateTable('meta.dataset_versions').set({ dropped_at: new Date() }).where('id', '=', v.id).execute();
      }
    }
  }

  return { publish, onProgress };
}

export type PublishService = ReturnType<typeof createPublishService>;

function checkFresh(revision: number, expected: number, baseVersion: number, latestVersion: number): void {
  if (revision !== expected) {
    throw new ApiError(409, 'VERSION_CONFLICT', `The draft changed since you read it (now at revision ${revision}, you sent ${expected}).`, {
      hint: 'Read the draft again, check it, then publish with its current revision.',
    });
  }
  if (baseVersion !== latestVersion) {
    throw new ApiError(409, 'VERSION_CONFLICT', `Someone published version ${latestVersion} after this draft was started (it was built on ${baseVersion}).`, {
      hint: 'Discard the draft or re-apply your changes on top of the latest published version.',
    });
  }
}

// Current version of every dataset of the project, by id and by name.
async function loadDatasets(trx: Db, projectId: string): Promise<Map<string, SourceRow>> {
  const res = await sql<SourceRow>`
    SELECT d.id, d.name, v.version, v.table_name, v.row_count, v.columns
    FROM meta.datasets d JOIN meta.dataset_versions v ON v.dataset_id = d.id AND v.version = d.current_version
    WHERE d.project_id = ${projectId} AND v.dropped_at IS NULL`.execute(trx);
  const map = new Map<string, SourceRow>();
  for (const r of res.rows) {
    map.set(r.id, r);
    if (!map.has(r.name)) map.set(r.name, r);
  }
  return map;
}

function sourceTable(t: ObjectTypeDef, builds: PipelineBuild[], datasets: Map<string, SourceRow>): string {
  if (t.source.kind === 'dataset') {
    const ds = datasets.get(t.source.datasetId);
    if (!ds) throw new ApiError(422, 'DATASET_NOT_FOUND', `${t.displayName} reads a dataset that is not in the project any more.`);
    return ds.table_name;
  }
  const { pipeline, output } = t.source;
  const b = builds.find((x) => x.pipeline === pipeline && x.output === output);
  if (!b) throw new ApiError(422, 'PIPELINE_OUTPUT_NOT_FOUND', `${t.displayName} reads the output "${output}" of pipeline "${pipeline}", which was not built.`);
  return b.tableName;
}

// Source columns to index per object type: its primary key and every link key it uses.
function indexColumns(doc: WorkspaceDoc): Map<string, Set<string>> {
  const props = new Map<string, Set<string>>();
  const add = (type: string, prop: string) => props.set(type, (props.get(type) ?? new Set()).add(prop));
  for (const t of doc.objectTypes) add(t.apiName, t.primaryKey);
  for (const l of doc.linkTypes) {
    for (const k of l.keys) {
      add(l.from, k.fromProperty);
      add(l.to, k.toProperty);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const t of doc.objectTypes) {
    const cols = new Set<string>();
    for (const name of props.get(t.apiName) ?? []) {
      const column = t.properties.find((p) => p.apiName === name)?.column;
      if (column) cols.add(column);
    }
    out.set(t.apiName, cols);
  }
  return out;
}

// edits.<t>: created if missing, editable columns added when new. Never dropped: edits survive rebuilds.
export function editsSql(t: ObjectTypeDef): string[] {
  const name = `edits.${q(sqlName(t.apiName))}`;
  const editable = t.properties.filter((p) => p.editable && p.apiName !== t.primaryKey);
  return [
    `CREATE TABLE IF NOT EXISTS ${name} (
  pk text PRIMARY KEY,
  _nulls text[] NOT NULL DEFAULT '{}',
  _deleted boolean NOT NULL DEFAULT false,
  _created boolean NOT NULL DEFAULT false,
  _values jsonb,
  _edited_at timestamptz NOT NULL DEFAULT now(),
  _edited_by text NOT NULL,
  _action_run_id uuid
)`,
    ...editable.map((p) => `ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS ${q(sqlName(p.apiName))} ${PG_TYPE[p.type as BaseType]}`),
  ];
}

// ont.<t> = source FULL JOIN edits (03-data-model §3 step 3). View columns are the properties' SQL names.
export function ontViewSql(t: ObjectTypeDef, source: string): string {
  const pk = t.properties.find((p) => p.apiName === t.primaryKey)!;
  const pkSource = pk.column ? `s.${q(pk.column)}` : 'NULL';
  const exprs = t.properties.map((p) => {
    const col = q(sqlName(p.apiName));
    const type = PG_TYPE[p.type];
    const s = p.column ? `s.${q(p.column)}::${type}` : `NULL::${type}`;
    if (p.apiName === t.primaryKey) return `COALESCE(${s}, e.pk::${type}) AS ${col}`;
    const created = `(e._values->>${literal(sqlName(p.apiName))})::${type}`;
    if (p.editable) {
      return `CASE WHEN ${literal(sqlName(p.apiName))} = ANY(e._nulls) THEN NULL ELSE COALESCE(e.${col}, ${s}, ${created}) END AS ${col}`;
    }
    return `COALESCE(${s}, ${created}) AS ${col}`;
  });
  return `CREATE VIEW ont.${q(sqlName(t.apiName))} AS
SELECT ${exprs.join(',\n       ')}
FROM ${qt(source)} s
FULL OUTER JOIN edits.${q(sqlName(t.apiName))} e ON e.pk = ${pkSource}::text
WHERE COALESCE(e._deleted, false) = false
  AND (${pkSource} IS NOT NULL OR e._created)`;
}

// One comment per view and column: the description and, when the Term is enriched, its definition.
async function commentStatements(t: ObjectTypeDef, projectId: string, semVersion: string, semantics: SemanticsPort): Promise<string[]> {
  async function definition(termId?: string): Promise<string> {
    if (!termId) return '';
    const rec = await semantics.getRecord(projectId, semVersion, termId);
    if (rec?.kind !== 'term') return '';
    const def = rec.body.definition?.trim();
    return def && !/^to be defined/i.test(def) ? ` Meaning: ${def}` : '';
  }
  const out: string[] = [];
  const view = sqlName(t.apiName);
  const text = `${t.description}${await definition(t.term)}`;
  for (const schema of ['ont', 'logic']) {
    out.push(`COMMENT ON VIEW ${schema}.${q(view)} IS ${literal(text)}`);
    for (const p of t.properties) {
      out.push(`COMMENT ON COLUMN ${schema}.${q(view)}.${q(sqlName(p.apiName))} IS ${literal(`${p.description}${await definition(p.term)}`)}`);
    }
  }
  return out;
}
