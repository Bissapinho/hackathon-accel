import type { FieldError, LogicTestRequest, LogicTestResponse, WorkspaceDoc } from '@mini/shared';
import { CompiledQuery, sql, type Kysely } from 'kysely';
import type { Config } from '../../config.js';
import type { Db } from '../../db/index.js';
import { withReadOnly } from '../../db/readonly.js';
import type { DB } from '../../db/types.js';
import { ApiError } from '../../errors.js';
import { compileLogicItem, compileLogicView, LogicCompileError, type LogicView } from './compile.js';
import { findMember, findType, type LogicDoc } from './model.js';
import { ParamSink, PG_TYPE, q, sqlName } from './sqltext.js';
import { dependencies, validateLogic } from './validate.js';

const DEFAULT_TEST_LIMIT = 10;

// Creates logic.<t> for every object type of the published doc, inside the caller's transaction
// (T-14 publish, step 4 of 03-data-model §3), and drops logic views of types no longer in the doc.
// The ont.<t> views must exist already. Refuses (422) if the logic has validation errors.
export async function buildLogicViews(trx: Kysely<DB>, doc: LogicDoc): Promise<LogicView[]> {
  const views = doc.objectTypes.map((t) => compileLogicView(t.apiName, doc));
  const errors = views.flatMap((v) => v.errors);
  if (errors.length > 0) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'The calculations and rules have errors; fix them before publishing.', {
      details: errors,
    });
  }
  const keep = new Set(views.map((v) => sqlName(v.objectType)));
  const existing = await sql<{ viewname: string }>`SELECT viewname FROM pg_views WHERE schemaname = 'logic'`.execute(trx);
  for (const { viewname } of existing.rows) {
    if (!keep.has(viewname)) await sql.raw(`DROP VIEW IF EXISTS logic.${q(viewname)}`).execute(trx);
  }
  for (const view of views) {
    for (const statement of view.statements) await sql.raw(statement).execute(trx);
  }
  return views;
}

// Evaluates draft logic on published objects (read-only, no views created).
export async function testLogic(doc: LogicDoc, req: LogicTestRequest, opts: { timeoutMs: number }): Promise<LogicTestResponse> {
  const type = findType(doc, req.objectType);
  if (!type) {
    return { rows: [], errors: [{ path: 'objectType', code: 'UNKNOWN_REFERENCE', message: `There is no object type "${req.objectType}" in the draft.` }] };
  }

  const errors: FieldError[] = [];
  req.apiNames.forEach((name, i) => {
    if (!findMember(doc, req.objectType, name)) {
      errors.push({ path: `apiNames[${i}]`, code: 'UNKNOWN_REFERENCE', message: `${req.objectType} has no property or logic named "${name}".` });
    }
  });
  if (errors.length > 0) return { rows: [], errors };

  // Validation errors of the requested logic and of everything it uses.
  const wanted = new Set<string>();
  for (const name of req.apiNames) {
    wanted.add(`${req.objectType}.${name}`);
    for (const d of dependencies(doc, req.objectType, name)) wanted.add(d);
  }
  const indexes = new Set(doc.logic.flatMap((l, i) => (wanted.has(`${l.objectType}.${l.apiName}`) ? [i] : [])));
  const validationErrors = validateLogic(doc).errors.filter((e) => {
    const m = /^logic\[(\d+)\]/.exec(e.path);
    return m !== null && indexes.has(Number(m[1]));
  });
  if (validationErrors.length > 0) return { rows: [], errors: validationErrors };

  const sink = new ParamSink();
  const pk = `o.${q(sqlName(type.primaryKey))}`;
  let selectList: string[];
  try {
    selectList = req.apiNames.map((name, i) => {
      const m = findMember(doc, req.objectType, name)!;
      const expr = m.kind === 'property' ? `o.${q(sqlName(name))}` : compileLogicItem(doc, m.def, sink);
      return `${expr} AS ${q(`c${i}`)}`;
    });
  } catch (err) {
    if (!(err instanceof LogicCompileError)) throw err;
    return { rows: [], errors: [{ path: 'apiNames', code: 'LOGIC_CYCLE', message: err.message }] };
  }
  const where = req.primaryKeys?.length ? `WHERE ${pk}::text = ANY(${sink.value(req.primaryKeys, 'string')})` : '';
  const limit = Math.min(req.limit ?? (req.primaryKeys?.length || DEFAULT_TEST_LIMIT), 20);
  const text =
    `SELECT ${pk}::${PG_TYPE.string} AS "__pk", ${selectList.join(', ')} ` +
    `FROM ont.${q(sqlName(type.apiName))} o ${where} ORDER BY ${pk} LIMIT ${limit}`;

  try {
    const result = await withReadOnly(opts, (db) =>
      db.executeQuery<Record<string, unknown>>(CompiledQuery.raw(text, sink.params)),
    );
    return {
      rows: result.rows.map((r) => ({
        ref: { objectType: type.apiName, primaryKey: String(r.__pk) },
        values: Object.fromEntries(req.apiNames.map((name, i) => [name, r[`c${i}`]])),
      })),
      errors: [],
    };
  } catch (err) {
    const message = (err as Error).message;
    const hint = /does not exist/.test(message)
      ? `Publish ${type.apiName} (and the properties this logic uses) before testing it on real objects.`
      : /statement timeout/.test(message)
        ? 'The calculation took too long; test fewer objects with primaryKeys.'
        : undefined;
    return {
      rows: [],
      errors: [{ path: 'apiNames', code: 'LOGIC_TEST_FAILED', message: hint ? `${message}. ${hint}` : message }],
    };
  }
}

export function createLogicService(deps: { db: Db; config: Config }) {
  // The project's workspace draft (meta.workspace_drafts, owned by the workspace module).
  async function getDraftDoc(projectId: string): Promise<WorkspaceDoc> {
    const row = await sql<{ doc: WorkspaceDoc }>`
      SELECT doc FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(deps.db);
    const doc = row.rows[0]?.doc;
    if (!doc) {
      throw new ApiError(404, 'NOT_FOUND', 'The workspace draft was not found: nothing has been drafted in this project yet.', {
        hint: 'Add object types and logic to the draft first.',
      });
    }
    return doc;
  }

  return {
    validateLogic,
    compileLogicView,
    buildLogicViews,
    async testDraftLogic(projectId: string, req: LogicTestRequest): Promise<LogicTestResponse> {
      const doc = await getDraftDoc(projectId);
      return testLogic(doc, req, { timeoutMs: deps.config.PREVIEW_TIMEOUT_MS });
    },
  };
}

export type LogicService = ReturnType<typeof createLogicService>;
