import { createHash } from 'node:crypto';
import type { BaseType, ColumnInfo, FieldError, PipelineBuild, PipelineCheck, PipelineDef, PipelinePreview } from '@mini/shared';
import { CompiledQuery, sql } from 'kysely';
import type { Config } from '../../config.js';
import type { Db } from '../../db/index.js';
import { withReadOnly } from '../../db/readonly.js';
import { ApiError, notFound } from '../../errors.js';
import {
  checkQuery,
  compilePipeline,
  evaluateCheck,
  selectNode,
  statement,
  type CheckResult,
  type CompiledPipeline,
  type PipelineResolver,
  type ResolvedDataset,
} from './compiler.js';
import { finalize, q, qq, SQL_TYPE, type Statement } from './sql.js';

const PG_TIMEOUT = '57014';
const MAX_PREVIEW_ROWS = 50;

async function run<R = Record<string, unknown>>(db: Db, st: Statement): Promise<{ rows: R[]; numAffectedRows?: bigint }> {
  return db.executeQuery<R>(CompiledQuery.raw(st.text, [...st.params]));
}

// Values as the front shows them: bigint strings to numbers, dates without a time zone shift.
function present(value: unknown, type: BaseType): unknown {
  if (value === null || value === undefined) return null;
  if (type === 'integer' && typeof value === 'string' && /^-?\d+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value;
  }
  if (value instanceof Date) {
    const p = (x: number) => String(x).padStart(2, '0');
    const d = `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
    return type === 'date' ? d : `${d} ${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`;
  }
  return value;
}

// Stable JSON (sorted keys) so the hash only changes when the definition does.
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function definitionHash(def: PipelineDef): string {
  return createHash('sha256').update(stableStringify(def)).digest('hex');
}

function splitTable(qualified: string): { schema: string; table: string } {
  const [schema, table] = qualified.includes('.') ? qualified.split('.', 2) : ['data', qualified];
  return { schema: schema!, table: table! };
}

function isTimeout(err: unknown): boolean {
  return (err as { code?: string })?.code === PG_TIMEOUT;
}

export function createPipelinesService(deps: { db: Db; config: Config }) {
  const { db, config } = deps;

  // Current version table of every dataset of the project (by id and by name).
  async function loadResolver(projectId: string, conn: Db = db): Promise<PipelineResolver> {
    const res = await sql<{ id: string; name: string; version: number; table_name: string; columns: ColumnInfo[] }>`
      SELECT d.id, d.name, v.version, v.table_name, v.columns
      FROM meta.datasets d
      JOIN meta.dataset_versions v ON v.dataset_id = d.id AND v.version = d.current_version
      WHERE d.project_id = ${projectId} AND v.dropped_at IS NULL`.execute(conn);
    const byRef = new Map<string, ResolvedDataset>();
    for (const r of res.rows) {
      const ds: ResolvedDataset = {
        datasetId: r.id,
        name: r.name,
        version: r.version,
        ...splitTable(r.table_name),
        columns: r.columns.map((c) => ({ name: c.sqlName, type: c.type })),
      };
      byRef.set(r.id, ds);
      if (!byRef.has(r.name)) byRef.set(r.name, ds);
    }
    return { dataset: (ref) => byRef.get(ref) ?? null };
  }

  // TODO(merge with T-11): read the draft through the workspace service instead of its table.
  async function getDraftPipeline(projectId: string, apiName: string): Promise<PipelineDef> {
    const res = await sql<{ pipelines: PipelineDef[] | null }>`
      SELECT doc->'pipelines' AS pipelines FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(db);
    const row = res.rows[0];
    if (!row) throw notFound('The workspace draft', 'nothing has been written to it yet', 'Add a pipeline to the draft first.');
    const def = (row.pipelines ?? []).find((p) => p?.apiName === apiName);
    if (!def) {
      const known = (row.pipelines ?? []).map((p) => p?.apiName).join(', ') || 'none';
      throw notFound(`The pipeline "${apiName}"`, `it is not in the draft (draft pipelines: ${known})`);
    }
    return def;
  }

  function compileOrThrow(def: PipelineDef, resolver: PipelineResolver): CompiledPipeline {
    const c = compilePipeline(def, resolver);
    if (c.errors.length) {
      throw new ApiError(422, 'VALIDATION_FAILED', `The pipeline "${def?.apiName}" has ${c.errors.length} problem(s) to fix first.`, {
        details: c.errors,
      });
    }
    return c;
  }

  // Finds the first node whose SQL fails, to name it in the error (only on the error path). Each node is
  // fully evaluated: the whole-row text forces every column, so data errors (bad cast, overflow) show up too.
  async function failingNode(c: CompiledPipeline): Promise<{ node: string; message: string } | null> {
    for (const id of c.order) {
      try {
        await withReadOnly({ timeoutMs: config.PREVIEW_TIMEOUT_MS }, (rdb) =>
          run(rdb, statement(c, [id], `SELECT count(x.*::text) FROM ${q(id)} x`)),
        );
      } catch (err) {
        return { node: id, message: (err as Error).message };
      }
    }
    return null;
  }

  async function sqlError(c: CompiledPipeline, err: unknown): Promise<ApiError> {
    if (isTimeout(err)) {
      return new ApiError(422, 'PREVIEW_TIMEOUT', `Previewing "${c.apiName}" took longer than ${Math.round(config.PREVIEW_TIMEOUT_MS / 1000)} seconds.`, {
        hint: 'Filter or aggregate earlier in the pipeline, or preview a node closer to the source.',
      });
    }
    const f = await failingNode(c);
    const message = f ? `Node "${f.node}" fails: ${f.message}` : `The pipeline fails: ${(err as Error).message}`;
    return new ApiError(422, 'PIPELINE_SQL_ERROR', message, { hint: 'Fix that node in the draft, then preview again.' });
  }

  async function runChecks(rdb: Db, c: CompiledPipeline, checks: PipelineCheck[]): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const check of checks) {
      const out = c.outputs.find((o) => o.apiName === check.output)!;
      const res = await run<{ n: unknown; examples: unknown }>(rdb, statement(c, [out.node], checkQuery(check, q(out.node))));
      results.push(evaluateCheck(check, res.rows[0]!));
    }
    return results;
  }

  // Preview a pipeline definition (draft or not): rows of one node, row count of every node, all checks.
  async function previewPipeline(projectId: string, def: PipelineDef, opts: { node?: string; limit?: number } = {}): Promise<PipelinePreview> {
    const c = compileOrThrow(def, await loadResolver(projectId));
    const target = opts.node ?? c.outputs[0]?.node;
    if (!target || !c.nodes.has(target)) {
      throw notFound(`The node "${String(target)}"`, `it is not a node of "${def.apiName}" (nodes: ${c.order.join(', ')})`);
    }
    const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), MAX_PREVIEW_ROWS);
    const started = Date.now();
    try {
      return await withReadOnly({ timeoutMs: config.PREVIEW_TIMEOUT_MS }, async (rdb) => {
        const cols = c.nodes.get(target)!.columns;
        const rowsRes = await run(rdb, selectNode(c, target, limit));
        const counts = c.order.map((id) => `(SELECT count(*) FROM ${q(id)})::bigint AS ${q(id)}`).join(', ');
        const countRes = await run(rdb, statement(c, c.order, `SELECT ${counts}`));
        const nodeCounts = Object.fromEntries(Object.entries(countRes.rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
        const checks = await runChecks(rdb, c, def.checks ?? []);
        return {
          columns: cols,
          rows: rowsRes.rows.map((r) => cols.map((col) => present(r[col.name], col.type))),
          rowCount: nodeCounts[target] ?? 0,
          nodeCounts,
          checks,
          ms: Date.now() - started,
        };
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw await sqlError(c, err);
    }
  }

  async function previewDraftPipeline(projectId: string, apiName: string, opts: { node?: string; limit?: number } = {}) {
    return previewPipeline(projectId, await getDraftPipeline(projectId, apiName), opts);
  }

  // Validation with data (T-13): structure errors, then SQL errors and failed checks on the full inputs.
  async function validatePipelineData(projectId: string, def: PipelineDef, path = 'pipeline'): Promise<FieldError[]> {
    const c = compilePipeline(def, await loadResolver(projectId), path);
    if (c.errors.length) return c.errors;
    try {
      const results = await withReadOnly({ timeoutMs: config.PREVIEW_TIMEOUT_MS }, async (rdb) => {
        for (const out of c.outputs) {
          // EXPLAIN goes before the WITH clause, so it wraps the whole statement.
          const st = statement(c, [out.node], `SELECT * FROM ${q(out.node)}`);
          await run(rdb, { ...st, text: `EXPLAIN ${st.text}` });
        }
        return runChecks(rdb, c, def.checks ?? []);
      });
      return results.flatMap((r) => {
        if (r.ok) return [];
        const i = (def.checks ?? []).indexOf(r.check);
        return [{ path: `${path}.checks[${i}]`, code: 'PIPELINE_CHECK_FAILED', message: `Check ${r.check.kind} on "${r.check.output}" fails: ${r.detail}` }];
      });
    } catch (err) {
      const e = await sqlError(c, err);
      return [{ path, code: e.code === 'PREVIEW_TIMEOUT' ? 'PIPELINE_SQL_ERROR' : e.code, message: e.message }];
    }
  }

  function toBuild(r: {
    pipeline: string; output: string; workspace_version: number; table_name: string; row_count: number;
    input_versions: Record<string, number>; checks: CheckResult[]; status: PipelineBuild['status']; duration_ms: number; created_at: Date;
  }): PipelineBuild {
    return {
      pipeline: r.pipeline,
      output: r.output,
      workspaceVersion: r.workspace_version,
      tableName: r.table_name,
      rowCount: r.row_count,
      inputVersions: r.input_versions,
      checks: r.checks,
      status: r.status,
      durationMs: r.duration_ms,
      createdAt: r.created_at.toISOString(),
    };
  }

  // Materializes every output of a pipeline as data.pl_<pipeline>_<output>_v<n> and records the builds.
  // Called by publish (T-14) inside its transaction, as the server role. Skips outputs that are up to date.
  async function buildPipeline(conn: Db, args: { projectId: string; def: PipelineDef; workspaceVersion: number }): Promise<PipelineBuild[]> {
    const { projectId, def, workspaceVersion } = args;
    const c = compileOrThrow(def, await loadResolver(projectId, conn));
    const hash = definitionHash(def);
    const inputs = c.inputVersions;
    const builds: PipelineBuild[] = [];

    for (const out of c.outputs) {
      const started = Date.now();
      const last = await conn
        .selectFrom('meta.pipeline_builds')
        .selectAll()
        .where('project_id', '=', projectId)
        .where('pipeline', '=', def.apiName)
        .where('output', '=', out.apiName)
        .where('status', 'in', ['built', 'upToDate'])
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (last && last.definition_hash === hash && stableStringify(last.input_versions) === stableStringify(inputs)) {
        const { schema, table } = splitTable(last.table_name);
        const exists = await sql<{ t: string | null }>`SELECT to_regclass(${`${schema}.${table}`})::text AS t`.execute(conn);
        if (exists.rows[0]?.t) {
          const row = await conn
            .insertInto('meta.pipeline_builds')
            .values({
              project_id: projectId,
              workspace_version: workspaceVersion,
              pipeline: def.apiName,
              output: out.apiName,
              table_name: last.table_name,
              row_count: last.row_count,
              input_versions: JSON.stringify(inputs),
              definition_hash: hash,
              checks: JSON.stringify(last.checks),
              status: 'upToDate',
              duration_ms: Date.now() - started,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          builds.push(toBuild(row));
          continue;
        }
      }

      // Next free version number for this output.
      const previous = await conn
        .selectFrom('meta.pipeline_builds')
        .select('table_name')
        .where('project_id', '=', projectId)
        .where('pipeline', '=', def.apiName)
        .where('output', '=', out.apiName)
        .execute();
      let n = 1 + Math.max(0, ...previous.map((p) => Number(/_v(\d+)$/.exec(p.table_name)?.[1] ?? 0)));
      let table = `pl_${def.apiName}_${out.apiName}_v${n}`;
      while ((await sql<{ t: string | null }>`SELECT to_regclass(${`data.${table}`})::text AS t`.execute(conn)).rows[0]?.t) {
        n += 1;
        table = `pl_${def.apiName}_${out.apiName}_v${n}`;
      }
      const target = qq('data', table);
      const cols = c.nodes.get(out.node)!.columns;

      await run(conn, finalize(`CREATE TABLE ${target} (${cols.map((col) => `${q(col.name)} ${SQL_TYPE[col.type]}`).join(', ')})`, []));
      const colList = cols.map((col) => q(col.name)).join(', ');
      // WITH <ctes> INSERT INTO … SELECT … : the CTEs stay in front of the INSERT.
      const inserted = await run(conn, statement(c, [out.node], `INSERT INTO ${target} (${colList}) SELECT ${colList} FROM ${q(out.node)}`));
      // Tables created by a superuser (local dev) don't get mini_app's default privileges: grant explicitly.
      await run(conn, finalize(`GRANT SELECT ON ${target} TO mini_reader`, []));

      const checks: CheckResult[] = [];
      for (const check of (def.checks ?? []).filter((ch) => ch.output === out.apiName)) {
        const res = await run<{ n: unknown; examples: unknown }>(conn, finalize(checkQuery(check, target), []));
        checks.push(evaluateCheck(check, res.rows[0]!));
      }

      const row = await conn
        .insertInto('meta.pipeline_builds')
        .values({
          project_id: projectId,
          workspace_version: workspaceVersion,
          pipeline: def.apiName,
          output: out.apiName,
          table_name: `data.${table}`,
          row_count: Number(inserted.numAffectedRows ?? 0n),
          input_versions: JSON.stringify(inputs),
          definition_hash: hash,
          checks: JSON.stringify(checks),
          status: checks.every((ch) => ch.ok) ? 'built' : 'failed',
          duration_ms: Date.now() - started,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      builds.push(toBuild(row));
    }
    return builds;
  }

  async function listBuilds(projectId: string, limit = 50): Promise<PipelineBuild[]> {
    const rows = await db
      .selectFrom('meta.pipeline_builds')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc')
      .limit(Math.min(Math.max(1, limit), 500))
      .execute();
    return rows.map(toBuild);
  }

  return { loadResolver, getDraftPipeline, previewPipeline, previewDraftPipeline, validatePipelineData, buildPipeline, listBuilds };
}

export type PipelinesService = ReturnType<typeof createPipelinesService>;
