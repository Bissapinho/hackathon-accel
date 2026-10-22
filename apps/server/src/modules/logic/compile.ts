import type { BaseType, FieldError, Filter, LogicDef, LogicExpr } from '@mini/shared';
import { findMember, findType, logicOf, resolveLink, type LogicDoc } from './model.js';
import { InlineSink, likeEscape, literal, PG_TYPE, q, sqlName, type SqlValue, type ValueSink } from './sqltext.js';
import { dependencies, exprType, validateLogic } from './validate.js';

// Logic compiler (03-data-model §7): derived properties and rules → SQL over ont.<type>.
// Derived properties and rules used by other logic are inlined, so logic.<type> only reads ont.* views
// (no ordering between logic views, and testLogic can run the same SQL without creating views).

type Ctx = {
  doc: LogicDoc;
  objectType: string;
  alias: string; // SQL alias of the current object's row
  sink: ValueSink;
  stack: string[]; // logic being inlined, as a guard against cycles that slipped past validation
};

export class LogicCompileError extends Error {}

const ROW = 'o';
const TARGET = 'x';

function col(ctx: Ctx, apiName: string): string {
  return `${ctx.alias}.${q(sqlName(apiName))}`;
}

function withLogic<T>(ctx: Ctx, def: LogicDef, fn: () => T): T {
  const key = `${def.objectType}.${def.apiName}`;
  if (ctx.stack.includes(key)) throw new LogicCompileError(`Logic cycle through ${[...ctx.stack, key].join(' → ')}.`);
  ctx.stack.push(key);
  try {
    return fn();
  } finally {
    ctx.stack.pop();
  }
}

// SQL for one member (property, derived property or rule) of the current object.
function member(ctx: Ctx, name: string): string {
  const m = findMember(ctx.doc, ctx.objectType, name);
  if (!m) throw new LogicCompileError(`${ctx.objectType} has no property or logic named "${name}".`);
  if (m.kind === 'property') return col(ctx, name);
  if (m.kind === 'derived') return withLogic(ctx, m.def, () => `(${compileExpr(ctx, m.def.expr, m.def.type)})`);
  return withLogic(ctx, m.def, () => `(${compileFilter(ctx, m.def.condition)})`);
}

function typeOf(ctx: Ctx, expr: LogicExpr): BaseType | null {
  return exprType(ctx.doc, ctx.objectType, expr);
}

function hintFor(other: BaseType | null, op: string): BaseType | undefined {
  if (other === 'integer' || other === 'double') return op === 'div' ? 'double' : other;
  if (other === 'date') return 'integer';
  return undefined;
}

export function compileExpr(ctx: Ctx, expr: LogicExpr, expected?: BaseType): string {
  if ('property' in expr) return member(ctx, expr.property);
  if ('literal' in expr) {
    const v = expr.literal;
    if (v === null) return expected ? `NULL::${PG_TYPE[expected]}` : 'NULL';
    const type = expected ?? (typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'double') : 'string');
    return ctx.sink.value(v, type);
  }
  if ('now' in expr) return 'now()';
  if ('today' in expr) return 'current_date';

  const binary = (op: 'add' | 'sub' | 'mul' | 'div', pair: [LogicExpr, LogicExpr]): string => {
    const [a, b] = pair;
    const sa = compileExpr(ctx, a, 'literal' in a ? hintFor(typeOf(ctx, b), op) : undefined);
    const sb = compileExpr(ctx, b, 'literal' in b ? hintFor(typeOf(ctx, a), op) : undefined);
    if (op === 'div') return `((${sa})::double precision / NULLIF((${sb})::double precision, 0))`;
    return `(${sa} ${{ add: '+', sub: '-', mul: '*' }[op]} ${sb})`;
  };
  if ('add' in expr) return binary('add', expr.add);
  if ('sub' in expr) return binary('sub', expr.sub);
  if ('mul' in expr) return binary('mul', expr.mul);
  if ('div' in expr) return binary('div', expr.div);

  if ('coalesce' in expr) {
    const hint = expected ?? firstKnown(ctx, expr.coalesce);
    return `COALESCE(${expr.coalesce.map((e) => compileExpr(ctx, e, hint)).join(', ')})`;
  }
  if ('case' in expr) {
    const hint = expected ?? firstKnown(ctx, [...expr.case.map((c) => c.then), ...(expr.else ? [expr.else] : [])]);
    const whens = expr.case.map((c) => `WHEN ${compileFilter(ctx, c.when)} THEN ${compileExpr(ctx, c.then, hint)}`);
    const otherwise = expr.else ? ` ELSE ${compileExpr(ctx, expr.else, hint)}` : '';
    return `CASE ${whens.join(' ')}${otherwise} END`;
  }
  if ('aggregate' in expr) {
    const { link, fn, property, where } = expr.aggregate;
    if (ctx.alias === TARGET) throw new LogicCompileError('Only one level of aggregate nesting is allowed.');
    const resolved = resolveLink(ctx.doc, ctx.objectType, link);
    if (!resolved) throw new LogicCompileError(`No link "${link}" starts from ${ctx.objectType}.`);
    const inner: Ctx = { ...ctx, objectType: resolved.target, alias: TARGET };
    const measure =
      fn === 'count'
        ? property ? `count(${member(inner, property)})` : 'count(*)'
        : `${fn}(${member(inner, required(property, fn))})`;
    const conditions = resolved.keys.map((k) => `${TARGET}.${q(sqlName(k.there))} = ${col(ctx, k.here)}`);
    if (where) conditions.push(`(${compileFilter(inner, where)})`);
    return `(SELECT ${measure} FROM ont.${q(sqlName(resolved.target))} ${TARGET} WHERE ${conditions.join(' AND ')})`;
  }
  throw new LogicCompileError(`Unknown expression: ${JSON.stringify(expr).slice(0, 80)}`);
}

function required(property: string | undefined, fn: string): string {
  if (!property) throw new LogicCompileError(`"${fn}" needs a property.`);
  return property;
}

function firstKnown(ctx: Ctx, exprs: LogicExpr[]): BaseType | undefined {
  for (const e of exprs) {
    if ('literal' in e) continue;
    const t = typeOf(ctx, e);
    if (t) return t;
  }
  return undefined;
}

const CMP: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function asValue(v: string | number | boolean, type: BaseType): SqlValue {
  if (type === 'boolean' && typeof v === 'string') return v === 'true';
  return v;
}

export function compileFilter(ctx: Ctx, f: Filter): string {
  switch (f.kind) {
    case 'and':
    case 'or':
      if (f.filters.length === 0) return f.kind === 'and' ? 'true' : 'false';
      return `(${f.filters.map((s) => compileFilter(ctx, s)).join(f.kind === 'and' ? ' AND ' : ' OR ')})`;
    case 'not':
      return `NOT (${compileFilter(ctx, f.filter)})`;
    case 'rule':
      return member(ctx, f.rule);
    case 'search': {
      const props = findType(ctx.doc, ctx.objectType)?.properties.filter((p) => p.type === 'string') ?? [];
      if (props.length === 0) return 'false';
      const pattern = ctx.sink.value(`%${likeEscape(f.text)}%`, 'string');
      return `(${props.map((p) => `${col(ctx, p.apiName)} ILIKE ${pattern} ESCAPE '\\'`).join(' OR ')})`;
    }
    case 'cmpProps':
      return `(${member(ctx, f.left)} ${CMP[f.op]} ${member(ctx, f.right)})`;
    case 'cmp': {
      const m = findMember(ctx.doc, ctx.objectType, f.property);
      if (!m) throw new LogicCompileError(`${ctx.objectType} has no property or logic named "${f.property}".`);
      const lhs = member(ctx, f.property);
      if (f.op === 'isNull') return `(${lhs} IS NULL)`;
      if (f.op === 'notNull') return `(${lhs} IS NOT NULL)`;
      if (f.value === undefined) throw new LogicCompileError(`"${f.op}" needs a value.`);
      if (f.op === 'in' || f.op === 'notIn') {
        const values = (Array.isArray(f.value) ? f.value : [f.value]) as (string | number)[];
        const list = ctx.sink.value(values, m.type);
        return f.op === 'in' ? `(${lhs} = ANY(${list}))` : `(NOT (${lhs} = ANY(${list})))`;
      }
      if (Array.isArray(f.value)) throw new LogicCompileError(`"${f.op}" needs a single value.`);
      if (f.op === 'startsWith') {
        return `(${lhs} LIKE ${ctx.sink.value(`${likeEscape(String(f.value))}%`, 'string')} ESCAPE '\\')`;
      }
      return `(${lhs} ${CMP[f.op]} ${ctx.sink.value(asValue(f.value, m.type), m.type)})`;
    }
    default:
      throw new LogicCompileError(`Unknown filter kind "${(f as { kind: string }).kind}".`);
  }
}

function newCtx(doc: LogicDoc, objectType: string, sink: ValueSink): Ctx {
  return { doc, objectType, alias: ROW, sink, stack: [] };
}

// SQL of one logic item for a row aliased `o` of ont.<type>: derived → cast to its type; rule → never null.
export function compileLogicItem(doc: LogicDoc, def: LogicDef, sink: ValueSink): string {
  const ctx = newCtx(doc, def.objectType, sink);
  return withLogic(ctx, def, () =>
    def.kind === 'derived'
      ? `(${compileExpr(ctx, def.expr, def.type)})::${PG_TYPE[def.type]}`
      : `COALESCE((${compileFilter(ctx, def.condition)}), false)`,
  );
}

// Errors of the logic items of one object type (and of everything they depend on).
function errorsFor(doc: LogicDoc, items: { objectType: string; apiName: string }[]): FieldError[] {
  const { errors } = validateLogic(doc);
  const wanted = new Set<number>();
  for (const it of items) {
    for (const dep of [`${it.objectType}.${it.apiName}`, ...dependencies(doc, it.objectType, it.apiName)]) {
      const i = doc.logic.findIndex((l) => `${l.objectType}.${l.apiName}` === dep);
      if (i >= 0) wanted.add(i);
    }
  }
  return errors.filter((e) => {
    const m = /^logic\[(\d+)\]/.exec(e.path);
    return m !== null && wanted.has(Number(m[1]));
  });
}

export type LogicView = {
  objectType: string;
  viewName: string; // logic.<t>
  sql: string; // CREATE VIEW statement (literals inlined: views can't take bind parameters)
  statements: string[]; // DROP, CREATE, COMMENTs, in order
  columns: { apiName: string; sqlName: string; kind: 'derived' | 'rule'; type: BaseType }[];
  errors: FieldError[];
};

// logic.<t> = ont.<t> + one column per derived property and rule of the type (03-data-model §3 step 4).
export function compileLogicView(objectType: string, doc: LogicDoc): LogicView {
  const t = sqlName(objectType);
  const viewName = `logic.${t}`;
  const items = logicOf(doc, objectType);
  const empty = { objectType, viewName, sql: '', statements: [], columns: [] };
  if (!findType(doc, objectType)) {
    return { ...empty, errors: [{ path: 'objectType', code: 'UNKNOWN_REFERENCE', message: `There is no object type "${objectType}".` }] };
  }
  const errors = errorsFor(doc, items);
  if (errors.length > 0) return { ...empty, errors };

  const sink = new InlineSink();
  const columns = items.map((l) => ({
    apiName: l.apiName,
    sqlName: sqlName(l.apiName),
    kind: l.kind,
    type: l.kind === 'derived' ? l.type : ('boolean' as BaseType),
  }));
  let selectList: string[];
  try {
    selectList = items.map((l, i) => `${compileLogicItem(doc, l, sink)} AS ${q(columns[i]!.sqlName)}`);
  } catch (err) {
    if (!(err instanceof LogicCompileError)) throw err;
    return { ...empty, errors: [{ path: 'logic', code: 'LOGIC_CYCLE', message: err.message }] };
  }
  const view = `logic.${q(t)}`;
  const sql = `CREATE VIEW ${view} AS\nSELECT ${[`${ROW}.*`, ...selectList].join(',\n  ')}\nFROM ont.${q(t)} ${ROW}`;
  const comments = items.map(
    (l, i) => `COMMENT ON COLUMN ${view}.${q(columns[i]!.sqlName)} IS ${literal(`${l.displayName}: ${l.description}`)}`,
  );
  const statements = [
    `DROP VIEW IF EXISTS ${view}`,
    sql,
    ...comments,
  ];
  return { objectType, viewName, sql, statements, columns, errors: [] };
}
