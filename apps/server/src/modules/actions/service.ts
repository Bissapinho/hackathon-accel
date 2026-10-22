import { randomUUID } from 'node:crypto';
import type {
  ActionRule,
  ActionRunRequest,
  ActionRunResponse,
  ActionTypeDef,
  BaseType,
  Criterion,
  FieldError,
  ObjectRef,
  ObjectRefExpr,
  ObjectTypeDef,
  ValueExpr,
  WorkspaceDoc,
} from '@mini/shared';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Db, DB } from '../../db/index.js';
import { ident, qualified } from '../../db/ident.js';
import { ApiError, notFound } from '../../errors.js';
import type { User } from '../resources/schemas.js';
import {
  checkParams,
  coerceValue,
  evaluateCompare,
  evaluateValue,
  renderTemplate,
  sqlName,
  type ObjectValues,
  type RunContext,
  type Scalar,
} from './evaluate.js';
import type { ActionEdit, ActionLogEntry, ActionRunStatus } from './schemas.js';

// The action engine (T-19, 03-data-model §3, 04-api §4). Edits go to edits.<type> only (rule 8);
// objects are read from logic.<type> (falls back to ont.<type>), which merge those edits.

type Trx = Kysely<DB>;
type Via = 'ui' | 'agent' | 'automation';

export type RunActionOptions = {
  projectId: string;
  user: User;
  apiName: string;
  request: ActionRunRequest;
  via: Via;
  agentSessionId?: string;
};

// The definitions an action run is checked against: a published version, or the draft (tests).
type Definitions = { doc: WorkspaceDoc; workspaceVersion: number };

type Outcome = {
  status: ActionRunStatus;
  errors: FieldError[];
  edits: ActionEdit[];
  message: string;
};

const PG_TYPE: Record<BaseType, string> = {
  string: 'text',
  integer: 'bigint',
  double: 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
};

// Thrown inside the transaction to roll it back while keeping the outcome (dry-runs and rejections).
class Rollback extends Error {
  constructor(readonly outcome: Outcome) {
    super('rollback');
  }
}

// Advisory lock key space for actions: one action at a time per project, so two moves can't both pass a
// capacity criterion.
const ACTION_LOCK_NS = 734_019;

export function createActionsService(db: Db) {
  // ── Definitions ──

  async function publishedDefinitions(projectId: string): Promise<Definitions> {
    const row = await sql<{ version: number; doc: WorkspaceDoc }>`
      SELECT version, doc FROM meta.workspace_versions WHERE project_id = ${projectId}
      ORDER BY version DESC LIMIT 1`.execute(db);
    const r = row.rows[0];
    if (!r) {
      throw notFound('A published workspace', 'nothing has been published in this project yet', 'Publish the workspace draft first.');
    }
    return { doc: r.doc, workspaceVersion: r.version };
  }

  async function draftDefinitions(projectId: string): Promise<Definitions> {
    const row = await sql<{ doc: WorkspaceDoc }>`
      SELECT doc FROM meta.workspace_drafts WHERE project_id = ${projectId}`.execute(db);
    const r = row.rows[0];
    if (!r) throw notFound('The workspace draft', 'this project has no draft yet', 'Add an action to the draft first.');
    return { doc: r.doc, workspaceVersion: 0 };
  }

  function findAction(defs: Definitions, apiName: string, where: string): ActionTypeDef {
    const action = (defs.doc.actionTypes ?? []).find((a) => a.apiName === apiName);
    if (!action) {
      const names = (defs.doc.actionTypes ?? []).map((a) => a.apiName);
      throw notFound(`The action "${apiName}"`, `it isn't in the ${where}`, names.length ? `Available actions: ${names.join(', ')}.` : 'No action is defined yet.');
    }
    return action;
  }

  async function getPublishedAction(projectId: string, apiName: string): Promise<{ action: ActionTypeDef; doc: WorkspaceDoc }> {
    const defs = await publishedDefinitions(projectId);
    return { action: findAction(defs, apiName, 'published workspace'), doc: defs.doc };
  }

  // ── Public entry points ──

  async function runAction(opts: RunActionOptions): Promise<ActionRunResponse> {
    const defs = await publishedDefinitions(opts.projectId);
    const action = findAction(defs, opts.apiName, 'published workspace');
    return applyActionRun(defs, action, opts, opts.request.dryRun === true);
  }

  // Dry-run of the DRAFT definition against published objects (04-api §1); never writes edits.
  async function testDraftAction(opts: RunActionOptions): Promise<ActionRunResponse> {
    const defs = await draftDefinitions(opts.projectId);
    const action = findAction(defs, opts.apiName, 'workspace draft');
    return applyActionRun(defs, action, opts, true);
  }

  // Validation only: parameters, objects, rule targets, and criteria that don't need the edits.
  // Runs in a rolled-back transaction; writes nothing, not even the log.
  async function validateActionRun(
    defs: Definitions,
    action: ActionTypeDef,
    opts: RunActionOptions,
  ): Promise<FieldError[]> {
    try {
      await db.transaction().execute(async (trx) => {
        const outcome = await engine(trx, defs, action, opts, randomUUID(), { stopBeforeEdits: true });
        throw new Rollback(outcome);
      });
    } catch (err) {
      if (err instanceof Rollback) return err.outcome.errors;
      throw err;
    }
    return [];
  }

  // validate → write edits → after-edit criteria → commit (or roll back for dry-runs and rejections),
  // then one action_runs row in every case.
  async function applyActionRun(
    defs: Definitions,
    action: ActionTypeDef,
    opts: RunActionOptions,
    dryRun: boolean,
  ): Promise<ActionRunResponse> {
    const runId = randomUUID();
    let outcome: Outcome;
    try {
      outcome = await db.transaction().execute(async (trx) => {
        await sql`SELECT pg_advisory_xact_lock(${ACTION_LOCK_NS}::int, hashtext(${opts.projectId}))`.execute(trx);
        const result = await engine(trx, defs, action, opts, runId, { stopBeforeEdits: false });
        if (result.status !== 'valid' || dryRun) throw new Rollback(result);
        const applied: Outcome = { ...result, status: 'applied' };
        await insertRun(trx, defs, action, opts, runId, false, applied);
        return applied;
      });
      return { runId, ...outcome };
    } catch (err) {
      if (err instanceof Rollback) {
        outcome = err.outcome;
      } else if (err instanceof ApiError) {
        throw err;
      } else {
        outcome = {
          status: 'failed',
          errors: [{ path: '', code: 'ACTION_FAILED', message: (err as Error).message }],
          edits: [],
          message: `"${action.displayName}" could not run because of an unexpected error. Nothing was changed.`,
        };
      }
    }
    await insertRun(db, defs, action, opts, runId, dryRun, outcome);
    return { runId, ...outcome };
  }

  async function insertRun(
    q: Trx,
    defs: Definitions,
    action: ActionTypeDef,
    opts: RunActionOptions,
    runId: string,
    dryRun: boolean,
    outcome: Outcome,
  ): Promise<void> {
    const edits = outcome.edits.map((e) => ({
      objectType: e.ref.objectType,
      primaryKey: e.ref.primaryKey,
      op: e.op,
      before: e.before,
      after: e.after,
    }));
    await q
      .insertInto('meta.action_runs')
      .values({
        id: runId,
        project_id: opts.projectId,
        workspace_version: defs.workspaceVersion,
        action_api_name: action.apiName,
        params: JSON.stringify(opts.request.params ?? {}),
        dry_run: dryRun,
        status: outcome.status,
        errors: JSON.stringify(outcome.errors),
        edits: JSON.stringify(edits),
        run_by: opts.user.id,
        via: opts.via,
        agent_session_id: opts.agentSessionId ?? null,
      })
      .execute();
  }

  // ── The engine (inside one transaction) ──

  async function engine(
    trx: Trx,
    defs: Definitions,
    action: ActionTypeDef,
    opts: RunActionOptions,
    runId: string,
    mode: { stopBeforeEdits: boolean },
  ): Promise<Outcome> {
    const reject = (errors: FieldError[], message?: string): Outcome => ({
      status: 'rejected',
      errors,
      edits: [],
      message: message ?? errors[0]?.message ?? `"${action.displayName}" was refused.`,
    });
    const now = new Date().toISOString();
    const base = { currentUser: opts.user.displayName, now };

    // 1. Parameters.
    const params = checkParams(action, opts.request.params ?? {}, base);
    const errors = [...params.errors];
    const ctx: RunContext = { ...base, values: params.values, objects: {} };
    for (const [paramId, ref] of Object.entries(params.refs)) {
      const type = typeDef(defs.doc, ref.objectType);
      if (!type) {
        errors.push({ path: `params.${paramId}`, code: 'UNKNOWN_REFERENCE', message: `The object type "${ref.objectType}" doesn't exist.` });
        continue;
      }
      const values = await readObject(trx, defs.doc, type, ref.primaryKey);
      if (!values) {
        errors.push({
          path: `params.${paramId}`,
          code: 'OBJECT_NOT_FOUND',
          message: `No ${type.displayName} has the key "${ref.primaryKey}".`,
        });
        continue;
      }
      ctx.objects[paramId] = { ref, values };
    }
    if (errors.length) return reject(errors);

    // 2. Rule targets (catches documents published before validation existed, and draft tests).
    const ruleErrors = checkRules(defs.doc, action);
    if (ruleErrors.length) return reject(ruleErrors);

    // 3. Criteria that look at the current state.
    const criteria = action.submissionCriteria ?? [];
    for (const [i, c] of criteria.entries()) {
      if (c.kind === 'rule' && c.afterEdits) continue;
      const failure = await checkCriterion(trx, defs.doc, c, i, ctx);
      if (failure) return reject([failure], failure.message);
    }
    if (mode.stopBeforeEdits) return { status: 'valid', errors: [], edits: [], message: '' };

    // 4. Edits.
    const edits: ActionEdit[] = [];
    for (const [i, rule] of action.rules.entries()) {
      const result = await applyRule(trx, defs.doc, rule, i, ctx, opts.user, runId);
      if ('error' in result) return reject([result.error]);
      edits.push(result.edit);
    }

    // 5. Criteria evaluated as if the edits were applied (same transaction, before commit).
    for (const [i, c] of criteria.entries()) {
      if (c.kind !== 'rule' || !c.afterEdits) continue;
      const failure = await checkCriterion(trx, defs.doc, c, i, ctx);
      if (failure) return reject([failure], failure.message);
    }

    // The success message sees objects as they are after the edits.
    const scope: Record<string, unknown> = { ...ctx.values };
    for (const [paramId, obj] of Object.entries(ctx.objects)) {
      const type = typeDef(defs.doc, obj.ref.objectType)!;
      scope[paramId] = { ref: obj.ref, values: (await readObject(trx, defs.doc, type, obj.ref.primaryKey)) ?? obj.values };
    }
    return { status: 'valid', errors: [], edits, message: renderTemplate(action.successMessage ?? '', scope) };
  }

  async function checkCriterion(
    trx: Trx,
    doc: WorkspaceDoc,
    c: Criterion,
    index: number,
    ctx: RunContext,
  ): Promise<FieldError | null> {
    const path = `submissionCriteria[${index}]`;
    if (c.kind === 'compare') {
      if (evaluateCompare(c, ctx)) return null;
      return { path, code: 'CRITERION_FAILED', message: renderTemplate(c.failureMessage, { ...ctx.values, ...ctx.objects }) };
    }
    const type = typeDef(doc, c.objectType);
    const rule = (doc.logic ?? []).find((l) => l.objectType === c.objectType && l.apiName === c.rule && l.kind === 'rule');
    if (!type || !rule) {
      return { path, code: 'CRITERION_UNKNOWN_RULE', message: `"${c.objectType}" has no rule "${c.rule}".` };
    }
    const target = await resolveObjectRef(trx, doc, c.object, ctx);
    if ('error' in target) return { path, code: target.code, message: target.error };
    const values = await readObject(trx, doc, type, target.ref.primaryKey);
    if (!values) {
      return { path, code: 'OBJECT_NOT_FOUND', message: `No ${type.displayName} has the key "${target.ref.primaryKey}".` };
    }
    const actual = values[c.rule];
    if (actual === undefined) {
      return {
        path,
        code: 'CRITERION_UNKNOWN_RULE',
        message: `The rule "${c.rule}" isn't built for ${type.displayName} yet.`,
      };
    }
    if (Boolean(actual) === c.expect) return null;
    return {
      path,
      code: 'CRITERION_FAILED',
      message: renderTemplate(c.failureMessage, { ...ctx.values, ...ctx.objects, object: { ref: target.ref, values } }),
    };
  }

  async function resolveObjectRef(
    trx: Trx,
    doc: WorkspaceDoc,
    expr: ObjectRefExpr,
    ctx: RunContext,
  ): Promise<{ ref: ObjectRef } | { error: string; code: string }> {
    if (expr.kind === 'param') {
      const obj = ctx.objects[expr.param];
      return obj ? { ref: obj.ref } : { code: 'UNKNOWN_REFERENCE', error: `The parameter "${expr.param}" isn't an object.` };
    }
    const type = typeDef(doc, expr.objectType);
    if (!type) return { code: 'UNKNOWN_REFERENCE', error: `The object type "${expr.objectType}" doesn't exist.` };
    const view = await objectView(trx, type);
    const conditions: RawBuilder<unknown>[] = [];
    const described: string[] = [];
    for (const [property, valueExpr] of Object.entries(expr.keys)) {
      if (!isReadable(doc, type, property)) {
        return { code: 'UNKNOWN_REFERENCE', error: `${type.displayName} has no property "${property}".` };
      }
      const value = evaluateValue(valueExpr, ctx);
      if (value === null) {
        conditions.push(sql`${ident(sqlName(property))} IS NULL`);
      } else {
        conditions.push(sql`${ident(sqlName(property))}::text = ${String(value)}`);
      }
      described.push(`${property} = ${value === null ? 'empty' : String(value)}`);
    }
    const pkCol = ident(sqlName(type.primaryKey));
    const rows = await sql<{ pk: string }>`
      SELECT o.${pkCol}::text AS pk FROM ${view} o WHERE ${sql.join(conditions, sql` AND `)} LIMIT 2`.execute(trx);
    if (rows.rows.length === 0) {
      return { code: 'OBJECT_NOT_FOUND', error: `No ${type.displayName} matches ${described.join(', ')}.` };
    }
    if (rows.rows.length > 1) {
      return { code: 'AMBIGUOUS_LOOKUP', error: `Several ${type.pluralDisplayName} match ${described.join(', ')}.` };
    }
    return { ref: { objectType: type.apiName, primaryKey: rows.rows[0]!.pk } };
  }

  // ── Edits ──

  async function applyRule(
    trx: Trx,
    doc: WorkspaceDoc,
    rule: ActionRule,
    index: number,
    ctx: RunContext,
    user: User,
    runId: string,
  ): Promise<{ edit: ActionEdit } | { error: FieldError }> {
    const path = `rules[${index}]`;
    if (rule.kind === 'createObject') {
      const type = typeDef(doc, rule.objectType)!;
      const pkRaw = evaluateValue(rule.primaryKey, ctx);
      if (pkRaw === null || pkRaw === '') {
        return { error: { path: `${path}.primaryKey`, code: 'REQUIRED', message: `The new ${type.displayName} needs a key.` } };
      }
      const pk = String(pkRaw);
      if (await readObject(trx, doc, type, pk)) {
        return {
          error: { path: `${path}.primaryKey`, code: 'OBJECT_ALREADY_EXISTS', message: `A ${type.displayName} with the key "${pk}" already exists.` },
        };
      }
      const typed = typedValues(type, rule.set, ctx, path);
      if ('error' in typed) return typed;
      const pkProp = type.properties.find((p) => p.apiName === type.primaryKey)!;
      const allValues: Record<string, Scalar> = { [sqlName(pkProp.apiName)]: pk };
      for (const v of typed.values) allValues[v.column] = v.value;
      const editable = typed.values.filter((v) => v.editable);
      const cols = editable.map((v) => ident(v.column));
      const vals = editable.map((v) => sql`CAST(${v.value} AS ${sql.raw(PG_TYPE[v.type])})`);
      const nulls = editable.filter((v) => v.value === null).map((v) => v.column);
      const table = qualified('edits', sqlName(type.apiName));
      const extraCols = cols.length ? sql`, ${sql.join(cols)}` : sql``;
      const extraVals = vals.length ? sql`, ${sql.join(vals)}` : sql``;
      const extraSets = editable.length
        ? sql`, ${sql.join(editable.map((v) => sql`${ident(v.column)} = EXCLUDED.${ident(v.column)}`))}`
        : sql``;
      await sql`
        INSERT INTO ${table} AS e (pk, _created, _deleted, _values, _nulls, _edited_by, _action_run_id${extraCols})
        VALUES (${pk}, true, false, ${JSON.stringify(allValues)}::jsonb, ${nulls}::text[], ${user.displayName}, ${runId}::uuid${extraVals})
        ON CONFLICT (pk) DO UPDATE SET _created = true, _deleted = false, _values = EXCLUDED._values,
          _nulls = EXCLUDED._nulls, _edited_at = now(), _edited_by = EXCLUDED._edited_by,
          _action_run_id = EXCLUDED._action_run_id${extraSets}`.execute(trx);
      const after = await readObject(trx, doc, type, pk);
      return {
        edit: { ref: { objectType: type.apiName, primaryKey: pk }, op: 'create', before: {}, after: pickProperties(type, after ?? {}) },
      };
    }

    const obj = ctx.objects[rule.object];
    if (!obj) {
      return { error: { path: `${path}.object`, code: 'REQUIRED', message: `Choose an object for "${rule.object}".` } };
    }
    const type = typeDef(doc, obj.ref.objectType)!;
    const table = qualified('edits', sqlName(type.apiName));
    const pk = obj.ref.primaryKey;

    if (rule.kind === 'deleteObject') {
      await sql`
        INSERT INTO ${table} AS e (pk, _deleted, _edited_by, _action_run_id)
        VALUES (${pk}, true, ${user.displayName}, ${runId}::uuid)
        ON CONFLICT (pk) DO UPDATE SET _deleted = true, _edited_at = now(), _edited_by = EXCLUDED._edited_by,
          _action_run_id = EXCLUDED._action_run_id`.execute(trx);
      return { edit: { ref: obj.ref, op: 'delete', before: pickProperties(type, obj.values), after: {} } };
    }

    // modifyObject
    const typed = typedValues(type, rule.set, ctx, path);
    if ('error' in typed) return typed;
    if (typed.values.length === 0) return { edit: { ref: obj.ref, op: 'modify', before: {}, after: {} } };
    const setCols = typed.values.map((v) => v.column);
    const nulls = typed.values.filter((v) => v.value === null).map((v) => v.column);
    const cols = typed.values.map((v) => ident(v.column));
    const vals = typed.values.map((v) => sql`CAST(${v.value} AS ${sql.raw(PG_TYPE[v.type])})`);
    const sets = typed.values.map((v) => sql`${ident(v.column)} = EXCLUDED.${ident(v.column)}`);
    await sql`
      INSERT INTO ${table} AS e (pk, _nulls, _edited_by, _action_run_id, ${sql.join(cols)})
      VALUES (${pk}, ${nulls}::text[], ${user.displayName}, ${runId}::uuid, ${sql.join(vals)})
      ON CONFLICT (pk) DO UPDATE SET ${sql.join(sets)},
        _nulls = ARRAY(SELECT x FROM unnest(e._nulls) x WHERE x <> ALL(${setCols}::text[])) || EXCLUDED._nulls,
        _edited_at = now(), _edited_by = EXCLUDED._edited_by, _action_run_id = EXCLUDED._action_run_id`.execute(trx);
    const after = (await readObject(trx, doc, type, pk)) ?? {};
    const keys = Object.keys(rule.set);
    return {
      edit: { ref: obj.ref, op: 'modify', before: pick(obj.values, keys), after: pick(after, keys) },
    };
  }

  // ── Object reading ──

  // logic.<t> when it exists (derived properties and rules), else ont.<t>.
  async function objectView(trx: Trx, type: ObjectTypeDef): Promise<RawBuilder<unknown>> {
    const name = sqlName(type.apiName);
    const logic = qualified('logic', name);
    const found = await sql<{ ok: boolean }>`SELECT to_regclass(${`logic.${name}`}) IS NOT NULL AS ok`.execute(trx);
    return found.rows[0]?.ok ? logic : qualified('ont', name);
  }

  async function readObject(trx: Trx, doc: WorkspaceDoc, type: ObjectTypeDef, primaryKey: string): Promise<ObjectValues | null> {
    const view = await objectView(trx, type);
    const pkCol = ident(sqlName(type.primaryKey));
    const res = await sql<{ row: Record<string, unknown> }>`
      SELECT to_jsonb(o) AS row FROM ${view} o WHERE o.${pkCol}::text = ${primaryKey} LIMIT 1`.execute(trx);
    const row = res.rows[0]?.row;
    if (!row) return null;
    const values: ObjectValues = {};
    for (const p of type.properties) values[p.apiName] = row[sqlName(p.apiName)] ?? null;
    for (const l of doc.logic ?? []) {
      if (l.objectType === type.apiName && sqlName(l.apiName) in row) values[l.apiName] = row[sqlName(l.apiName)];
    }
    return values;
  }

  // ── Log ──

  async function listActionLog(
    projectId: string,
    filter: { limit: number; action?: string; object?: ObjectRef },
  ): Promise<ActionLogEntry[]> {
    let q = db
      .selectFrom('meta.action_runs as r')
      .innerJoin('meta.users as u', 'u.id', 'r.run_by')
      .select([
        'r.id',
        'r.action_api_name',
        'r.params',
        'r.dry_run',
        'r.status',
        'r.errors',
        'r.edits',
        'r.via',
        'r.agent_session_id',
        'r.workspace_version',
        'r.created_at',
        'u.id as user_id',
        'u.display_name',
      ])
      .where('r.project_id', '=', projectId);
    if (filter.action) q = q.where('r.action_api_name', '=', filter.action);
    if (filter.object) {
      const probe = JSON.stringify([{ objectType: filter.object.objectType, primaryKey: filter.object.primaryKey }]);
      q = q.where(sql<boolean>`r.edits @> ${probe}::jsonb`);
    }
    const rows = await q.orderBy('r.created_at', 'desc').limit(filter.limit).execute();
    return rows.map((r) => ({
      runId: r.id,
      action: r.action_api_name,
      params: (r.params ?? {}) as Record<string, unknown>,
      dryRun: r.dry_run,
      status: r.status,
      errors: (r.errors ?? []) as FieldError[],
      edits: ((r.edits ?? []) as StoredEdit[]).map((e) => ({
        ref: { objectType: e.objectType, primaryKey: e.primaryKey },
        op: e.op,
        before: e.before,
        after: e.after,
      })),
      runBy: { id: r.user_id, displayName: r.display_name },
      via: r.via,
      agentSessionId: r.agent_session_id,
      workspaceVersion: r.workspace_version,
      createdAt: r.created_at.toISOString(),
    }));
  }

  return { runAction, testDraftAction, validateActionRun, applyActionRun, getPublishedAction, publishedDefinitions, listActionLog };
}

export type ActionsService = ReturnType<typeof createActionsService>;

type StoredEdit = {
  objectType: string;
  primaryKey: string;
  op: ActionEdit['op'];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

// ── Helpers (pure) ──

function typeDef(doc: WorkspaceDoc, apiName: string): ObjectTypeDef | undefined {
  return (doc.objectTypes ?? []).find((t) => t.apiName === apiName);
}

function isReadable(doc: WorkspaceDoc, type: ObjectTypeDef, property: string): boolean {
  return (
    type.properties.some((p) => p.apiName === property) ||
    (doc.logic ?? []).some((l) => l.objectType === type.apiName && l.apiName === property)
  );
}

function pick(values: ObjectValues, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, values[k] ?? null]));
}

function pickProperties(type: ObjectTypeDef, values: ObjectValues): Record<string, unknown> {
  return pick(values, type.properties.map((p) => p.apiName));
}

// The rules of an action must target existing types and editable, non-derived, non-key properties
// (04-api §5 RULE_SETS_READONLY). The workspace validation reports the same codes before publish.
export function checkRules(doc: WorkspaceDoc, action: ActionTypeDef): FieldError[] {
  const errors: FieldError[] = [];
  const params = new Map(action.parameters.map((p) => [p.id, p]));
  for (const [i, rule] of action.rules.entries()) {
    const path = `rules[${i}]`;
    let type: ObjectTypeDef | undefined;
    if (rule.kind === 'createObject') {
      type = typeDef(doc, rule.objectType);
      if (!type) {
        errors.push({ path: `${path}.objectType`, code: 'UNKNOWN_REFERENCE', message: `The object type "${rule.objectType}" doesn't exist.` });
        continue;
      }
    } else {
      const p = params.get(rule.object);
      if (!p || p.kind !== 'object') {
        errors.push({ path: `${path}.object`, code: 'UNKNOWN_REFERENCE', message: `"${rule.object}" isn't an object parameter of this action.` });
        continue;
      }
      type = typeDef(doc, p.objectType);
      if (!type) {
        errors.push({ path: `${path}.object`, code: 'UNKNOWN_REFERENCE', message: `The object type "${p.objectType}" doesn't exist.` });
        continue;
      }
    }
    if (rule.kind === 'deleteObject') continue;
    for (const property of Object.keys(rule.set)) {
      const prop = type.properties.find((p) => p.apiName === property);
      const derived = (doc.logic ?? []).some((l) => l.objectType === type.apiName && l.apiName === property);
      const settable = rule.kind === 'createObject' ? prop && property !== type.primaryKey : prop?.editable && property !== type.primaryKey;
      if (!prop && !derived) {
        errors.push({ path: `${path}.set.${property}`, code: 'UNKNOWN_REFERENCE', message: `${type.displayName} has no property "${property}".` });
      } else if (derived || !settable) {
        errors.push({
          path: `${path}.set.${property}`,
          code: 'RULE_SETS_READONLY',
          message: `"${property}" of ${type.displayName} can't be changed by an action (it is ${derived ? 'calculated' : property === type.primaryKey ? 'the key' : 'not editable'}).`,
        });
      }
    }
  }
  return errors;
}

function typedValues(
  type: ObjectTypeDef,
  set: Record<string, ValueExpr>,
  ctx: RunContext,
  path: string,
): { values: { column: string; type: BaseType; value: Scalar; editable: boolean }[] } | { error: FieldError } {
  const values: { column: string; type: BaseType; value: Scalar; editable: boolean }[] = [];
  for (const [property, expr] of Object.entries(set)) {
    const prop = type.properties.find((p) => p.apiName === property)!;
    const raw = evaluateValue(expr, ctx);
    const coerced = coerceValue(prop.type, raw);
    if (!coerced.ok) {
      return {
        error: {
          path: `${path}.set.${property}`,
          code: 'TYPE_MISMATCH',
          message: `"${prop.displayName}" must be a ${prop.type}; the action computed ${JSON.stringify(raw)}.`,
        },
      };
    }
    if (prop.allowedValues && coerced.value !== null && !prop.allowedValues.includes(String(coerced.value))) {
      return {
        error: {
          path: `${path}.set.${property}`,
          code: 'NOT_ALLOWED_VALUE',
          message: `"${prop.displayName}" must be one of: ${prop.allowedValues.join(', ')}.`,
        },
      };
    }
    values.push({ column: sqlName(property), type: prop.type, value: coerced.value, editable: prop.editable });
  }
  return { values };
}
