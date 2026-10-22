import type {
  ActionParam,
  ActionTypeDef,
  BaseType,
  Criterion,
  FieldError,
  ObjectRef,
  ValueExpr,
} from '@mini/shared';

// Pure part of the action engine: parameter coercion, value expressions, comparisons and message
// templates. No database here, so it is unit-tested without Postgres.

// snake_case SQL name of an API name (03-data-model §8): CuisineJour → cuisine_jour, lieuProduction → lieu_production.
// TODO(merge): use the shared naming helper once the workspace module exports one.
export function sqlName(apiName: string): string {
  return apiName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export type Scalar = string | number | boolean | null;
export type ObjectValues = Record<string, unknown>; // one object, keyed by property / logic API name

// The values an action run works with once its parameters are checked.
export type RunContext = {
  values: Record<string, Scalar>; // value parameters (defaults applied)
  objects: Record<string, { ref: ObjectRef; values: ObjectValues }>; // object parameters, loaded
  currentUser: string; // display name
  now: string; // ISO timestamp of the run
};

// ── Parameters ──

export function coerceValue(type: BaseType, raw: unknown): { ok: true; value: Scalar } | { ok: false } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  switch (type) {
    case 'string':
      return typeof raw === 'string' || typeof raw === 'number' ? { ok: true, value: String(raw) } : { ok: false };
    case 'integer': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : NaN;
      return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'double': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'boolean':
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (typeof raw === 'string' && /^(true|false)$/i.test(raw)) return { ok: true, value: raw.toLowerCase() === 'true' };
      return { ok: false };
    case 'date':
      return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))
        ? { ok: true, value: raw }
        : { ok: false };
    case 'timestamp':
      return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? { ok: true, value: raw } : { ok: false };
  }
}

// An object parameter accepts an ObjectRef or, for convenience, a bare primary key.
export function toObjectRef(param: ActionParam & { kind: 'object' }, raw: unknown): ObjectRef | null {
  if (typeof raw === 'string' || typeof raw === 'number') return { objectType: param.objectType, primaryKey: String(raw) };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.primaryKey === 'string' || typeof r.primaryKey === 'number') {
      const objectType = typeof r.objectType === 'string' ? r.objectType : param.objectType;
      return { objectType, primaryKey: String(r.primaryKey) };
    }
  }
  return null;
}

// Checks the request's parameters against the action's definition (structure only: object existence is
// checked by the service). Returns the coerced value parameters and the object references.
export function checkParams(
  action: ActionTypeDef,
  raw: Record<string, unknown>,
  ctx: Pick<RunContext, 'currentUser' | 'now'>,
): { errors: FieldError[]; values: Record<string, Scalar>; refs: Record<string, ObjectRef> } {
  const errors: FieldError[] = [];
  const values: Record<string, Scalar> = {};
  const refs: Record<string, ObjectRef> = {};
  const known = new Set(action.parameters.map((p) => p.id));

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      errors.push({
        path: `params.${key}`,
        code: 'UNKNOWN_PARAMETER',
        message: `"${action.displayName}" has no parameter "${key}". Its parameters are: ${[...known].join(', ') || 'none'}.`,
      });
    }
  }

  for (const p of action.parameters) {
    const path = `params.${p.id}`;
    const given = raw[p.id];
    const missing = given === undefined || given === null || given === '';
    if (p.kind === 'object') {
      if (missing) {
        if (p.required) errors.push({ path, code: 'REQUIRED', message: `Choose a ${p.objectType} for "${p.displayName}".` });
        continue;
      }
      const ref = toObjectRef(p, given);
      if (!ref) {
        errors.push({ path, code: 'BAD_OBJECT_REF', message: `"${p.displayName}" needs an object reference {objectType, primaryKey}.` });
      } else if (ref.objectType !== p.objectType) {
        errors.push({ path, code: 'WRONG_OBJECT_TYPE', message: `"${p.displayName}" must be a ${p.objectType}, not a ${ref.objectType}.` });
      } else {
        refs[p.id] = ref;
      }
      continue;
    }
    let input: unknown = given;
    if (missing && p.default) input = evaluateValue(p.default, { values, objects: {}, ...ctx });
    const coerced = coerceValue(p.type, input);
    if (!coerced.ok) {
      errors.push({ path, code: 'TYPE_MISMATCH', message: `"${p.displayName}" must be a ${p.type}; got ${JSON.stringify(given)}.` });
      continue;
    }
    if (coerced.value === null) {
      if (p.required) errors.push({ path, code: 'REQUIRED', message: `"${p.displayName}" is required.` });
      values[p.id] = null;
      continue;
    }
    if (p.allowedValues && !p.allowedValues.includes(String(coerced.value))) {
      errors.push({
        path,
        code: 'NOT_ALLOWED_VALUE',
        message: `"${p.displayName}" must be one of: ${p.allowedValues.join(', ')}.`,
      });
      continue;
    }
    values[p.id] = coerced.value;
  }
  return { errors, values, refs };
}

// ── Value expressions ──

export function evaluateValue(expr: ValueExpr, ctx: RunContext): Scalar {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'param': {
      const v = ctx.values[expr.param];
      if (v !== undefined) return v;
      const obj = ctx.objects[expr.param];
      return obj ? obj.ref.primaryKey : null;
    }
    case 'paramProperty': {
      const obj = ctx.objects[expr.param];
      const v = obj?.values[expr.property];
      return toScalar(v);
    }
    case 'now':
      return ctx.now;
    case 'currentUser':
      return ctx.currentUser;
  }
}

function toScalar(v: unknown): Scalar {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

// ── Comparisons (compare criteria) ──

type CompareOp = (Criterion & { kind: 'compare' })['op'];

function asNumber(v: Scalar): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function equal(a: Scalar, b: Scalar): boolean {
  if (a === null || b === null) return false;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

function order(a: Scalar, b: Scalar): number | null {
  if (a === null || b === null) return null;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// SQL-like semantics: a comparison with null is false, except isNull / notNull.
export function compareValues(left: Scalar, op: CompareOp, right: Scalar | Scalar[] | undefined): boolean {
  switch (op) {
    case 'isNull':
      return left === null;
    case 'notNull':
      return left !== null;
    case 'in':
    case 'notIn': {
      const list = Array.isArray(right) ? right : right === undefined ? [] : [right];
      if (left === null) return false;
      const found = list.some((r) => equal(left, r));
      return op === 'in' ? found : !found;
    }
    case 'eq':
      return equal(left, Array.isArray(right) ? null : (right ?? null));
    case 'neq': {
      const r = Array.isArray(right) ? null : (right ?? null);
      return left !== null && r !== null && !equal(left, r);
    }
    default: {
      const c = order(left, Array.isArray(right) ? null : (right ?? null));
      if (c === null) return false;
      return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : c <= 0;
    }
  }
}

export function evaluateCompare(c: Criterion & { kind: 'compare' }, ctx: RunContext): boolean {
  const left = evaluateValue(c.left, ctx);
  const right =
    c.right === undefined ? undefined : c.right.kind === 'list' ? c.right.values : evaluateValue(c.right, ctx);
  return compareValues(left, c.op, right);
}

// ── Message templates: {{param}}, {{param.property}}, {{object.property}} ──

export function renderTemplate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?\s*\}\}/g, (whole, head: string, prop?: string) => {
    const base = scope[head];
    if (base === undefined) return whole;
    if (prop === undefined) {
      if (base && typeof base === 'object' && 'ref' in base) return String((base as { ref: ObjectRef }).ref.primaryKey);
      return base === null ? '' : String(base);
    }
    const values =
      base && typeof base === 'object' && 'values' in base ? (base as { values: ObjectValues }).values : (base as ObjectValues);
    const v = values?.[prop];
    return v === undefined ? whole : v === null ? '' : String(v);
  });
}
