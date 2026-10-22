import type { BaseType, FieldError, Filter, LogicExpr, PipelineCheck, PipelineDef, PipelineNode } from '@mini/shared';
import { finalize, ParamList, q, qq, SQL_TYPE, type Statement } from './sql.js';

// Pipeline compiler (04-api §6): each node becomes a CTE named after its id; filters and derive use the
// Filter / LogicExpr grammar with parameterized literals and checked names. Pure: no database access.
// Column names and types are propagated node by node, so most mistakes are caught before any SQL runs.

const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
const BASE_TYPES: readonly BaseType[] = ['string', 'integer', 'double', 'boolean', 'date', 'timestamp'];
const NODE_KINDS = ['source', 'filter', 'select', 'rename', 'cast', 'derive', 'join', 'union', 'aggregate', 'deduplicate'];

export type Column = { name: string; type: BaseType };

export type ResolvedDataset = {
  datasetId: string;
  name: string;
  version: number;
  schema: string; // 'data'
  table: string; // 'ds_k3f9a2qx_v2'
  columns: Column[];
};

// Maps a source's datasetId (id, or dataset name as a convenience) to its current version table.
export type PipelineResolver = { dataset(ref: string): ResolvedDataset | null };

export type CompiledNode = { id: string; kind: PipelineNode['kind']; columns: Column[]; body: string; inputs: string[] };

export type CompiledPipeline = {
  apiName: string;
  errors: FieldError[];
  order: string[]; // node ids in dependency order (compiled nodes only)
  nodes: Map<string, CompiledNode>;
  outputs: { apiName: string; node: string }[];
  inputVersions: Record<string, number>; // datasetId -> version read by the sources
  params: ParamList;
};

// ───────────────────────── Statement assembly ─────────────────────────

function ancestors(c: CompiledPipeline, ids: string[]): Set<string> {
  const keep = new Set<string>();
  const visit = (id: string) => {
    if (keep.has(id)) return;
    const n = c.nodes.get(id);
    if (!n) return;
    keep.add(id);
    n.inputs.forEach(visit);
  };
  ids.forEach(visit);
  return keep;
}

// `WITH a AS (…), b AS (…)` for the given nodes and everything they read, in dependency order.
export function withClause(c: CompiledPipeline, ids: string[]): string {
  const keep = ancestors(c, ids);
  const ctes = c.order.filter((id) => keep.has(id)).map((id) => `${q(id)} AS (${c.nodes.get(id)!.body})`);
  return ctes.length ? `WITH ${ctes.join(',\n')}\n` : '';
}

// A full statement ending with `tail`, which may read the given nodes as tables.
export function statement(c: CompiledPipeline, ids: string[], tail: string): Statement {
  return finalize(withClause(c, ids) + tail, c.params.values);
}

export function selectNode(c: CompiledPipeline, id: string, limit?: number): Statement {
  const cols = c.nodes.get(id)!.columns.map((col) => q(col.name)).join(', ');
  const lim = limit === undefined ? '' : ` LIMIT ${Math.max(0, Math.floor(limit))}`;
  return statement(c, [id], `SELECT ${cols} FROM ${q(id)}${lim}`);
}

// ───────────────────────── Compilation ─────────────────────────

class Ctx {
  errors: FieldError[] = [];
  constructor(readonly params: ParamList) {}
  err(path: string, code: string, message: string): null {
    this.errors.push({ path, code, message });
    return null;
  }
}

function nodeInputs(n: PipelineNode): string[] {
  switch (n.kind) {
    case 'source':
      return [];
    case 'join':
      return [n.left, n.right];
    case 'union':
      return Array.isArray(n.inputs) ? n.inputs : [];
    default:
      return [(n as { input: string }).input];
  }
}

const isNum = (t: BaseType) => t === 'integer' || t === 'double';

function compatible(a: BaseType, b: BaseType): boolean {
  return a === b || (isNum(a) && isNum(b));
}

export function literalFits(value: unknown, type: BaseType): boolean {
  if (value === null) return true;
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^[-+]?\d+$/.test(value));
    case 'double':
      return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'timestamp':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(value);
  }
}

function checkName(ctx: Ctx, name: unknown, path: string, what: string): name is string {
  if (typeof name !== 'string' || !IDENT.test(name)) {
    ctx.err(path, 'BAD_API_NAME', `${what} "${String(name)}" must be snake_case: lowercase letters, digits and underscores, starting with a letter.`);
    return false;
  }
  return true;
}

function colOf(ctx: Ctx, cols: Column[], name: unknown, path: string, nodeId: string): Column | null {
  const c = typeof name === 'string' ? cols.find((x) => x.name === name) : undefined;
  if (!c) {
    const known = cols.map((x) => x.name).slice(0, 12).join(', ');
    return ctx.err(path, 'UNKNOWN_REFERENCE', `Column "${String(name)}" doesn't exist at node "${nodeId}". Available: ${known}.`);
  }
  return c;
}

// ── Filter (property = column name) ──

export function compileFilter(ctx: Ctx, f: Filter, cols: Column[], path: string, nodeId: string): string | null {
  if (!f || typeof f !== 'object') return ctx.err(path, 'INVALID_NODE', 'A filter is missing.');
  switch (f.kind) {
    case 'and':
    case 'or': {
      if (!Array.isArray(f.filters) || f.filters.length === 0) {
        return ctx.err(`${path}.filters`, 'INVALID_NODE', `"${f.kind}" needs at least one filter.`);
      }
      const parts = f.filters.map((x, i) => compileFilter(ctx, x, cols, `${path}.filters[${i}]`, nodeId));
      if (parts.some((p) => p === null)) return null;
      return `(${parts.join(f.kind === 'and' ? ' AND ' : ' OR ')})`;
    }
    case 'not': {
      const inner = compileFilter(ctx, f.filter, cols, `${path}.filter`, nodeId);
      return inner === null ? null : `(NOT ${inner})`;
    }
    case 'cmp': {
      const col = colOf(ctx, cols, f.property, `${path}.property`, nodeId);
      if (!col) return null;
      const c = q(col.name);
      if (f.op === 'isNull') return `(${c} IS NULL)`;
      if (f.op === 'notNull') return `(${c} IS NOT NULL)`;
      if (f.op === 'in' || f.op === 'notIn') {
        if (!Array.isArray(f.value)) return ctx.err(`${path}.value`, 'TYPE_MISMATCH', `"${f.op}" needs a list of values.`);
        const bad = f.value.find((v) => !literalFits(v, col.type));
        if (bad !== undefined) return ctx.err(`${path}.value`, 'TYPE_MISMATCH', `"${bad}" is not a valid ${col.type} for column "${col.name}".`);
        const p = ctx.params.add(f.value, col.type, true);
        return f.op === 'in' ? `(${c} = ANY(${p}))` : `(NOT (${c} = ANY(${p})))`;
      }
      if (f.value === undefined || Array.isArray(f.value)) {
        return ctx.err(`${path}.value`, 'TYPE_MISMATCH', `"${f.op}" needs a single value.`);
      }
      if (f.op === 'startsWith') {
        if (typeof f.value !== 'string') return ctx.err(`${path}.value`, 'TYPE_MISMATCH', '"startsWith" needs a text value.');
        return `starts_with(${c}::text, ${ctx.params.add(f.value, 'string')})`;
      }
      const ops: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const op = ops[f.op];
      if (!op) return ctx.err(`${path}.op`, 'INVALID_NODE', `Unknown comparison "${String(f.op)}".`);
      if (!literalFits(f.value, col.type)) {
        return ctx.err(`${path}.value`, 'TYPE_MISMATCH', `"${String(f.value)}" is not a valid ${col.type} for column "${col.name}".`);
      }
      return `(${c} ${op} ${ctx.params.add(f.value, col.type)})`;
    }
    case 'cmpProps': {
      const l = colOf(ctx, cols, f.left, `${path}.left`, nodeId);
      const r = colOf(ctx, cols, f.right, `${path}.right`, nodeId);
      if (!l || !r) return null;
      if (!compatible(l.type, r.type)) {
        return ctx.err(path, 'TYPE_MISMATCH', `Can't compare "${l.name}" (${l.type}) with "${r.name}" (${r.type}).`);
      }
      const ops: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const op = ops[f.op];
      if (!op) return ctx.err(`${path}.op`, 'INVALID_NODE', `Unknown comparison "${String(f.op)}".`);
      return `(${q(l.name)} ${op} ${q(r.name)})`;
    }
    case 'search': {
      if (typeof f.text !== 'string') return ctx.err(`${path}.text`, 'INVALID_NODE', 'Search needs a text.');
      const strings = cols.filter((c) => c.type === 'string');
      if (strings.length === 0) return 'false';
      const p = ctx.params.add(f.text.toLowerCase(), 'string');
      return `(${strings.map((c) => `strpos(lower(${q(c.name)}), ${p}) > 0`).join(' OR ')})`;
    }
    case 'rule':
      return ctx.err(path, 'UNKNOWN_REFERENCE', `Rules can't be used inside a pipeline ("${f.rule}"); rules apply to objects.`);
    default:
      return ctx.err(`${path}.kind`, 'UNKNOWN_BLOCK_KIND', `Unknown filter kind "${String((f as { kind: unknown }).kind)}".`);
  }
}

// ── LogicExpr (property = column name) ──

type Typed = { sql: string; type: BaseType | null }; // null type = the NULL literal

function arith(ctx: Ctx, op: 'add' | 'sub' | 'mul', a: Typed, b: Typed, path: string): Typed | null {
  const sym = { add: '+', sub: '-', mul: '*' }[op];
  const ta = a.type ?? b.type ?? 'integer';
  const tb = b.type ?? ta;
  if (isNum(ta) && isNum(tb)) {
    return { sql: `(${a.sql} ${sym} ${b.sql})`, type: ta === 'double' || tb === 'double' ? 'double' : 'integer' };
  }
  if (op === 'add' && ta === 'date' && tb === 'integer') return { sql: `(${a.sql} + ${b.sql}::integer)`, type: 'date' };
  if (op === 'sub' && ta === 'date' && tb === 'integer') return { sql: `(${a.sql} - ${b.sql}::integer)`, type: 'date' };
  if (op === 'sub' && ta === 'date' && tb === 'date') return { sql: `(${a.sql} - ${b.sql})`, type: 'integer' };
  return ctx.err(path, 'TYPE_MISMATCH', `Can't apply "${op}" to ${ta} and ${tb}.`);
}

export function compileExpr(ctx: Ctx, e: LogicExpr, cols: Column[], path: string, nodeId: string): Typed | null {
  if (!e || typeof e !== 'object') return ctx.err(path, 'INVALID_NODE', 'An expression is missing.');
  if ('property' in e) {
    const c = colOf(ctx, cols, e.property, `${path}.property`, nodeId);
    return c ? { sql: q(c.name), type: c.type } : null;
  }
  if ('literal' in e) {
    const v = e.literal;
    if (v === null) return { sql: 'NULL', type: null };
    if (typeof v === 'boolean') return { sql: ctx.params.add(v, 'boolean'), type: 'boolean' };
    if (typeof v === 'number') {
      const t: BaseType = Number.isInteger(v) ? 'integer' : 'double';
      return { sql: ctx.params.add(v, t), type: t };
    }
    if (typeof v === 'string') return { sql: ctx.params.add(v, 'string'), type: 'string' };
    return ctx.err(`${path}.literal`, 'TYPE_MISMATCH', 'A literal must be text, a number, true/false or null.');
  }
  if ('now' in e) return { sql: 'localtimestamp', type: 'timestamp' };
  if ('today' in e) return { sql: 'current_date', type: 'date' };
  for (const op of ['add', 'sub', 'mul', 'div'] as const) {
    if (op in e) {
      const pair = (e as Record<string, unknown>)[op];
      if (!Array.isArray(pair) || pair.length !== 2) return ctx.err(`${path}.${op}`, 'INVALID_NODE', `"${op}" needs exactly two expressions.`);
      const a = compileExpr(ctx, pair[0] as LogicExpr, cols, `${path}.${op}[0]`, nodeId);
      const b = compileExpr(ctx, pair[1] as LogicExpr, cols, `${path}.${op}[1]`, nodeId);
      if (!a || !b) return null;
      if (op === 'div') {
        if (!isNum(a.type ?? 'integer') || !isNum(b.type ?? 'integer')) {
          return ctx.err(path, 'TYPE_MISMATCH', `Can't divide ${a.type} by ${b.type}.`);
        }
        return { sql: `(${a.sql}::double precision / NULLIF(${b.sql}, 0))`, type: 'double' };
      }
      return arith(ctx, op, a, b, path);
    }
  }
  if ('coalesce' in e) {
    if (!Array.isArray(e.coalesce) || e.coalesce.length === 0) return ctx.err(`${path}.coalesce`, 'INVALID_NODE', '"coalesce" needs expressions.');
    const parts = e.coalesce.map((x, i) => compileExpr(ctx, x, cols, `${path}.coalesce[${i}]`, nodeId));
    if (parts.some((p) => p === null)) return null;
    return unify(ctx, parts as Typed[], path, (sqls) => `COALESCE(${sqls.join(', ')})`);
  }
  if ('case' in e) {
    if (!Array.isArray(e.case) || e.case.length === 0) return ctx.err(`${path}.case`, 'INVALID_NODE', '"case" needs at least one branch.');
    const whens: string[] = [];
    const thens: Typed[] = [];
    let failed = false;
    e.case.forEach((br, i) => {
      const w = compileFilter(ctx, br.when, cols, `${path}.case[${i}].when`, nodeId);
      const t = compileExpr(ctx, br.then, cols, `${path}.case[${i}].then`, nodeId);
      if (w === null || t === null) failed = true;
      else {
        whens.push(w);
        thens.push(t);
      }
    });
    let els: Typed | null = null;
    if (e.else !== undefined) {
      els = compileExpr(ctx, e.else, cols, `${path}.else`, nodeId);
      if (!els) failed = true;
    }
    if (failed) return null;
    const all = els ? [...thens, els] : thens;
    return unify(ctx, all, path, (sqls) => {
      const branches = whens.map((w, i) => `WHEN ${w} THEN ${sqls[i]}`).join(' ');
      return `(CASE ${branches}${els ? ` ELSE ${sqls[sqls.length - 1]}` : ''} END)`;
    });
  }
  if ('aggregate' in e) {
    return ctx.err(path, 'INVALID_NODE', 'Aggregates over links belong to logic, not pipelines: use an "aggregate" node instead.');
  }
  return ctx.err(path, 'UNKNOWN_BLOCK_KIND', 'Unknown expression.');
}

// Several expressions that must end up with one type (coalesce, case branches).
function unify(ctx: Ctx, parts: Typed[], path: string, build: (sqls: string[]) => string): Typed | null {
  const types = parts.map((p) => p.type).filter((t): t is BaseType => t !== null);
  let type: BaseType | null = types[0] ?? null;
  for (const t of types) {
    if (type === null) type = t;
    else if (!compatible(type, t)) return ctx.err(path, 'TYPE_MISMATCH', `Mixes ${type} and ${t}.`);
    else if (t === 'double') type = 'double';
  }
  const cast = (p: Typed) => (type && p.type !== type ? `(${p.sql})::${SQL_TYPE[type]}` : p.sql);
  return { sql: build(parts.map(cast)), type };
}

// ── Casts ──

const NUM_RE = `'^[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]+)?$'`;

function castSql(c: string, from: BaseType, to: BaseType): string | null {
  if (from === to) return c;
  if (to === 'string') return `${c}::text`;
  if (from === 'string') {
    const t = `btrim(${c})`;
    switch (to) {
      case 'integer':
        return `(CASE WHEN ${t} ~ '^[-+]?[0-9]+$' THEN ${t}::bigint END)`;
      case 'double':
        return `(CASE WHEN ${t} ~ ${NUM_RE} THEN ${t}::double precision END)`;
      case 'boolean':
        return `(CASE WHEN lower(${t}) IN ('true','yes','1') THEN true WHEN lower(${t}) IN ('false','no','0') THEN false END)`;
      case 'date':
        return `(CASE WHEN ${t} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${t}::date WHEN ${t} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(${t}, 'DD/MM/YYYY') END)`;
      case 'timestamp':
        return `(CASE WHEN ${t} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([ T][0-9]{2}:[0-9]{2}.*)?$' THEN ${t}::timestamp WHEN ${t} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}$' THEN to_timestamp(${t}, 'DD/MM/YYYY HH24:MI')::timestamp END)`;
    }
  }
  if (from === 'integer' && to === 'double') return `${c}::double precision`;
  if (from === 'double' && to === 'integer') return `round(${c})::bigint`;
  if (from === 'boolean' && to === 'integer') return `${c}::integer`;
  if (from === 'date' && to === 'timestamp') return `${c}::timestamp`;
  if (from === 'timestamp' && to === 'date') return `${c}::date`;
  return null;
}

// ── Nodes ──

function compileNode(ctx: Ctx, n: PipelineNode, path: string, input: (id: string) => CompiledNode | undefined, resolver: PipelineResolver, inputVersions: Record<string, number>): CompiledNode | null {
  const base = { id: n.id, kind: n.kind, inputs: nodeInputs(n) };
  const one = (id: string, p: string): CompiledNode | null => {
    const c = input(id);
    return c ?? ctx.err(p, 'UNKNOWN_REFERENCE', `Node "${n.id}" reads "${id}", which doesn't exist or has errors.`);
  };

  switch (n.kind) {
    case 'source': {
      if (typeof n.datasetId !== 'string' || !n.datasetId) return ctx.err(`${path}.datasetId`, 'INVALID_NODE', 'A source needs a datasetId.');
      const ds = resolver.dataset(n.datasetId);
      if (!ds) {
        return ctx.err(`${path}.datasetId`, 'UNKNOWN_REFERENCE', `Dataset "${n.datasetId}" doesn't exist in this project or has no loaded version.`);
      }
      inputVersions[ds.datasetId] = ds.version;
      const cols = ds.columns.map((c) => q(c.name)).join(', ');
      return { ...base, columns: ds.columns, body: `SELECT ${cols} FROM ${qq(ds.schema, ds.table)}` };
    }
    case 'filter': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      const where = compileFilter(ctx, n.where, src.columns, `${path}.where`, n.id);
      if (where === null) return null;
      return { ...base, columns: src.columns, body: `SELECT * FROM ${q(src.id)} WHERE ${where}` };
    }
    case 'select': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      if (!Array.isArray(n.columns) || n.columns.length === 0) return ctx.err(`${path}.columns`, 'INVALID_NODE', 'Select at least one column.');
      const cols: Column[] = [];
      n.columns.forEach((name, i) => {
        const c = colOf(ctx, src.columns, name, `${path}.columns[${i}]`, n.id);
        if (c && cols.some((x) => x.name === c.name)) ctx.err(`${path}.columns[${i}]`, 'DUPLICATE_API_NAME', `Column "${c.name}" is selected twice.`);
        else if (c) cols.push(c);
      });
      if (cols.length !== n.columns.length) return null;
      return { ...base, columns: cols, body: `SELECT ${cols.map((c) => q(c.name)).join(', ')} FROM ${q(src.id)}` };
    }
    case 'rename': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      if (!n.map || typeof n.map !== 'object') return ctx.err(`${path}.map`, 'INVALID_NODE', 'Rename needs a map of old name to new name.');
      let ok = true;
      for (const [from, to] of Object.entries(n.map)) {
        if (!colOf(ctx, src.columns, from, `${path}.map.${from}`, n.id)) ok = false;
        if (!checkName(ctx, to, `${path}.map.${from}`, 'New column name')) ok = false;
      }
      if (!ok) return null;
      const cols = src.columns.map((c) => ({ name: n.map[c.name] ?? c.name, type: c.type }));
      const dup = cols.find((c, i) => cols.findIndex((x) => x.name === c.name) !== i);
      if (dup) return ctx.err(`${path}.map`, 'DUPLICATE_API_NAME', `Two columns would be called "${dup.name}".`);
      const list = src.columns.map((c, i) => (cols[i]!.name === c.name ? q(c.name) : `${q(c.name)} AS ${q(cols[i]!.name)}`));
      return { ...base, columns: cols, body: `SELECT ${list.join(', ')} FROM ${q(src.id)}` };
    }
    case 'cast': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      const col = colOf(ctx, src.columns, n.column, `${path}.column`, n.id);
      if (!col) return null;
      if (!BASE_TYPES.includes(n.to)) return ctx.err(`${path}.to`, 'INVALID_NODE', `Unknown type "${String(n.to)}".`);
      const expr = castSql(q(col.name), col.type, n.to);
      if (!expr) return ctx.err(`${path}.to`, 'TYPE_MISMATCH', `Can't convert "${col.name}" from ${col.type} to ${n.to}.`);
      const cols = src.columns.map((c) => (c.name === col.name ? { name: c.name, type: n.to } : c));
      const list = src.columns.map((c) => (c.name === col.name ? `${expr} AS ${q(c.name)}` : q(c.name)));
      return { ...base, columns: cols, body: `SELECT ${list.join(', ')} FROM ${q(src.id)}` };
    }
    case 'derive': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      if (!checkName(ctx, n.as, `${path}.as`, 'Derived column name')) return null;
      const e = compileExpr(ctx, n.expr, src.columns, `${path}.expr`, n.id);
      if (!e) return null;
      const type: BaseType = e.type ?? 'string';
      const sqlExpr = e.type === null ? `NULL::text` : e.sql;
      const exists = src.columns.some((c) => c.name === n.as);
      const cols = exists ? src.columns.map((c) => (c.name === n.as ? { name: c.name, type } : c)) : [...src.columns, { name: n.as, type }];
      const list = exists
        ? src.columns.map((c) => (c.name === n.as ? `${sqlExpr} AS ${q(c.name)}` : q(c.name)))
        : [...src.columns.map((c) => q(c.name)), `${sqlExpr} AS ${q(n.as)}`];
      return { ...base, columns: cols, body: `SELECT ${list.join(', ')} FROM ${q(src.id)}` };
    }
    case 'join': {
      const l = one(n.left, `${path}.left`);
      const r = one(n.right, `${path}.right`);
      if (!l || !r) return null;
      if (n.how !== 'inner' && n.how !== 'left') return ctx.err(`${path}.how`, 'INVALID_NODE', 'A join is "inner" or "left".');
      if (!Array.isArray(n.on) || n.on.length === 0) return ctx.err(`${path}.on`, 'INVALID_NODE', 'A join needs at least one pair of key columns.');
      const conds: string[] = [];
      let ok = true;
      n.on.forEach((k, i) => {
        const lc = colOf(ctx, l.columns, k.left, `${path}.on[${i}].left`, n.id);
        const rc = colOf(ctx, r.columns, k.right, `${path}.on[${i}].right`, n.id);
        if (!lc || !rc) ok = false;
        else if (!compatible(lc.type, rc.type)) {
          ok = false;
          ctx.err(`${path}.on[${i}]`, 'TYPE_MISMATCH', `Can't join "${lc.name}" (${lc.type}) with "${rc.name}" (${rc.type}).`);
        } else conds.push(`l.${q(lc.name)} = r.${q(rc.name)}`);
      });
      if (n.rightPrefix !== undefined && (typeof n.rightPrefix !== 'string' || !/^[a-z][a-z0-9_]*$/.test(n.rightPrefix))) {
        ctx.err(`${path}.rightPrefix`, 'BAD_API_NAME', 'rightPrefix must be snake_case, e.g. "client_".');
        ok = false;
      }
      if (!ok) return null;
      const leftNames = new Set(l.columns.map((c) => c.name));
      const rightCols = r.columns.map((c) => {
        const name = n.rightPrefix ? n.rightPrefix + c.name : leftNames.has(c.name) ? `${r.id}_${c.name}` : c.name;
        return { from: c.name, name, type: c.type };
      });
      const cols: Column[] = [...l.columns, ...rightCols.map((c) => ({ name: c.name, type: c.type }))];
      for (const [i, c] of cols.entries()) {
        if (!IDENT.test(c.name)) return ctx.err(path, 'BAD_API_NAME', `Joined column name "${c.name}" is too long or invalid; set a shorter rightPrefix.`);
        if (cols.findIndex((x) => x.name === c.name) !== i) {
          return ctx.err(path, 'DUPLICATE_API_NAME', `Two joined columns would be called "${c.name}"; set rightPrefix.`);
        }
      }
      const list = [
        ...l.columns.map((c) => `l.${q(c.name)}`),
        ...rightCols.map((c) => (c.from === c.name ? `r.${q(c.from)}` : `r.${q(c.from)} AS ${q(c.name)}`)),
      ];
      const how = n.how === 'inner' ? 'JOIN' : 'LEFT JOIN';
      return { ...base, columns: cols, body: `SELECT ${list.join(', ')} FROM ${q(l.id)} l ${how} ${q(r.id)} r ON ${conds.join(' AND ')}` };
    }
    case 'union': {
      if (!Array.isArray(n.inputs) || n.inputs.length < 2) return ctx.err(`${path}.inputs`, 'INVALID_NODE', 'A union needs at least two inputs.');
      const srcs = n.inputs.map((id, i) => one(id, `${path}.inputs[${i}]`));
      if (srcs.some((s) => !s)) return null;
      const first = srcs[0]!;
      const cols = first.columns.map((c) => ({ ...c }));
      for (const [i, s] of srcs.entries()) {
        const names = s!.columns.map((c) => c.name).sort().join(',');
        if (names !== first.columns.map((c) => c.name).sort().join(',')) {
          return ctx.err(`${path}.inputs[${i}]`, 'TYPE_MISMATCH', `"${s!.id}" doesn't have the same columns as "${first.id}"; use select / rename first.`);
        }
        for (const c of cols) {
          const t = s!.columns.find((x) => x.name === c.name)!.type;
          if (!compatible(c.type, t)) return ctx.err(`${path}.inputs[${i}]`, 'TYPE_MISMATCH', `Column "${c.name}" is ${c.type} in "${first.id}" but ${t} in "${s!.id}".`);
          if (t === 'double') c.type = 'double';
        }
      }
      const parts = srcs.map((s) => {
        const list = cols.map((c) => {
          const t = s!.columns.find((x) => x.name === c.name)!.type;
          return t === c.type ? q(c.name) : `${q(c.name)}::${SQL_TYPE[c.type]} AS ${q(c.name)}`;
        });
        return `SELECT ${list.join(', ')} FROM ${q(s!.id)}`;
      });
      return { ...base, columns: cols, body: parts.join(' UNION ALL ') };
    }
    case 'aggregate': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      if (!Array.isArray(n.groupBy)) return ctx.err(`${path}.groupBy`, 'INVALID_NODE', 'groupBy must be a list of columns (it may be empty).');
      if (!Array.isArray(n.measures) || n.measures.length === 0) return ctx.err(`${path}.measures`, 'INVALID_NODE', 'An aggregate needs at least one measure.');
      const groups = n.groupBy.map((g, i) => colOf(ctx, src.columns, g, `${path}.groupBy[${i}]`, n.id));
      const cols: Column[] = [];
      const list: string[] = [];
      let ok = !groups.some((g) => !g);
      for (const g of groups) if (g) {
        cols.push(g);
        list.push(q(g.name));
      }
      n.measures.forEach((m, i) => {
        const p = `${path}.measures[${i}]`;
        if (!checkName(ctx, m.as, `${p}.as`, 'Measure name')) return (ok = false);
        if (cols.some((c) => c.name === m.as)) {
          ctx.err(`${p}.as`, 'DUPLICATE_API_NAME', `Column "${m.as}" already exists in this aggregate.`);
          return (ok = false);
        }
        let col: Column | null = null;
        if (m.column !== undefined) col = colOf(ctx, src.columns, m.column, `${p}.column`, n.id);
        else if (m.fn !== 'count') {
          ctx.err(`${p}.column`, 'INVALID_NODE', `"${m.fn}" needs a column.`);
          return (ok = false);
        }
        if (m.column !== undefined && !col) return (ok = false);
        const c = col ? q(col.name) : '';
        let expr: string;
        let type: BaseType;
        switch (m.fn) {
          case 'count':
            expr = col ? `count(${c})::bigint` : 'count(*)::bigint';
            type = 'integer';
            break;
          case 'countDistinct':
            expr = `count(DISTINCT ${c})::bigint`;
            type = 'integer';
            break;
          case 'sum':
          case 'avg':
            if (!isNum(col!.type)) {
              ctx.err(`${p}.column`, 'TYPE_MISMATCH', `Can't ${m.fn} "${col!.name}": it is ${col!.type}, not a number.`);
              return (ok = false);
            }
            type = m.fn === 'avg' || col!.type === 'double' ? 'double' : 'integer';
            expr = `${m.fn}(${c})::${SQL_TYPE[type]}`;
            break;
          case 'min':
          case 'max':
            expr = `${m.fn}(${c})`;
            type = col!.type;
            break;
          default:
            ctx.err(`${p}.fn`, 'INVALID_NODE', `Unknown measure "${String(m.fn)}".`);
            return (ok = false);
        }
        cols.push({ name: m.as, type });
        list.push(`${expr} AS ${q(m.as)}`);
        return undefined;
      });
      if (!ok) return null;
      const groupBy = groups.length ? ` GROUP BY ${groups.map((g) => q(g!.name)).join(', ')}` : '';
      return { ...base, columns: cols, body: `SELECT ${list.join(', ')} FROM ${q(src.id)}${groupBy}` };
    }
    case 'deduplicate': {
      const src = one(n.input, `${path}.input`);
      if (!src) return null;
      if (!Array.isArray(n.keys) || n.keys.length === 0) return ctx.err(`${path}.keys`, 'INVALID_NODE', 'Deduplicate needs at least one key column.');
      if (n.keep !== 'first' && n.keep !== 'last') return ctx.err(`${path}.keep`, 'INVALID_NODE', 'keep is "first" or "last".');
      const keys = n.keys.map((k, i) => colOf(ctx, src.columns, k, `${path}.keys[${i}]`, n.id));
      const order = (n.orderBy ?? []).map((o, i) => {
        const c = colOf(ctx, src.columns, o.column, `${path}.orderBy[${i}].column`, n.id);
        if (!c) return null;
        const asc = o.direction !== 'desc';
        // keep: 'last' = the last row in the given order = the first row in the reversed order.
        return `${q(c.name)} ${asc === (n.keep === 'first') ? 'ASC' : 'DESC'}`;
      });
      if (keys.some((k) => !k) || order.some((o) => o === null)) return null;
      const keyList = keys.map((k) => q(k!.name)).join(', ');
      const cols = src.columns.map((c) => q(c.name)).join(', ');
      return {
        ...base,
        columns: src.columns,
        body: `SELECT DISTINCT ON (${keyList}) ${cols} FROM ${q(src.id)} ORDER BY ${[keyList, ...order].join(', ')}`,
      };
    }
  }
}

// ───────────────────────── Entry points ─────────────────────────

// Structure + types + references. `path` prefixes every FieldError path (e.g. "pipelines[2]").
export function compilePipeline(def: PipelineDef, resolver: PipelineResolver, path = 'pipeline'): CompiledPipeline {
  const ctx = new Ctx(new ParamList());
  const result: CompiledPipeline = {
    apiName: def?.apiName,
    errors: ctx.errors,
    order: [],
    nodes: new Map(),
    outputs: [],
    inputVersions: {},
    params: ctx.params,
  };
  if (!def || typeof def !== 'object') {
    ctx.err(path, 'INVALID_PIPELINE', 'The pipeline definition is missing.');
    return result;
  }
  checkName(ctx, def.apiName, `${path}.apiName`, 'Pipeline name');
  const nodes = Array.isArray(def.nodes) ? def.nodes : [];
  if (nodes.length === 0) ctx.err(`${path}.nodes`, 'INVALID_PIPELINE', 'A pipeline needs at least one node.');

  // Node ids, kinds, duplicates.
  const byId = new Map<string, { node: PipelineNode; index: number }>();
  nodes.forEach((n, i) => {
    const p = `${path}.nodes[${i}]`;
    if (!n || typeof n !== 'object') return ctx.err(p, 'INVALID_NODE', 'A node must be an object.');
    if (!NODE_KINDS.includes(n.kind)) {
      return ctx.err(`${p}.kind`, 'UNKNOWN_BLOCK_KIND', `Unknown node kind "${String(n.kind)}". Known kinds: ${NODE_KINDS.join(', ')}.`);
    }
    if (!checkName(ctx, n.id, `${p}.id`, 'Node id')) return null;
    if (byId.has(n.id)) return ctx.err(`${p}.id`, 'DUPLICATE_API_NAME', `Two nodes have the id "${n.id}".`);
    byId.set(n.id, { node: n, index: i });
    return null;
  });

  // Dependency order with cycle detection.
  const state = new Map<string, 'visiting' | 'done'>();
  const cyclic = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    const st = state.get(id);
    if (st === 'done') return;
    if (st === 'visiting') {
      const loop = trail.slice(trail.indexOf(id));
      loop.forEach((x) => cyclic.add(x));
      const at = byId.get(id)!;
      ctx.err(`${path}.nodes[${at.index}]`, 'PIPELINE_CYCLE', `The nodes form a loop: ${[...loop, id].join(' → ')}.`);
      return;
    }
    const entry = byId.get(id);
    if (!entry) return;
    state.set(id, 'visiting');
    for (const dep of nodeInputs(entry.node)) if (typeof dep === 'string') visit(dep, [...trail, id]);
    state.set(id, 'done');
    result.order.push(id);
  };
  for (const id of byId.keys()) visit(id, []);
  result.order = result.order.filter((id) => !cyclic.has(id));

  // Compile in dependency order; a node whose input failed is skipped (its own error says why).
  const failed = new Set<string>(cyclic);
  for (const id of result.order) {
    const { node, index } = byId.get(id)!;
    const p = `${path}.nodes[${index}]`;
    const deps = nodeInputs(node);
    const missing = deps.find((d) => !byId.has(d));
    if (missing !== undefined) {
      ctx.err(p, 'UNKNOWN_REFERENCE', `Node "${id}" reads "${String(missing)}", which is not a node of this pipeline.`);
      failed.add(id);
      continue;
    }
    if (deps.some((d) => failed.has(d))) {
      failed.add(id);
      continue;
    }
    const compiled = compileNode(ctx, node, p, (d) => result.nodes.get(d), resolver, result.inputVersions);
    if (compiled) result.nodes.set(id, compiled);
    else failed.add(id);
  }
  result.order = result.order.filter((id) => result.nodes.has(id));

  // Outputs.
  const outputs = Array.isArray(def.outputs) ? def.outputs : [];
  if (outputs.length === 0) ctx.err(`${path}.outputs`, 'INVALID_PIPELINE', 'A pipeline needs at least one output.');
  const outNames = new Set<string>();
  outputs.forEach((o, i) => {
    const p = `${path}.outputs[${i}]`;
    if (!checkName(ctx, o?.apiName, `${p}.apiName`, 'Output name')) return;
    if (outNames.has(o.apiName)) return void ctx.err(`${p}.apiName`, 'DUPLICATE_API_NAME', `Two outputs are called "${o.apiName}".`);
    outNames.add(o.apiName);
    if (typeof def.apiName === 'string' && !IDENT.test(`pl_${def.apiName}_${o.apiName}_v999`)) {
      ctx.err(`${p}.apiName`, 'BAD_API_NAME', `The table name pl_${def.apiName}_${o.apiName}_v… would be longer than 63 characters; shorten the names.`);
    }
    if (!byId.has(o.node)) return void ctx.err(`${p}.node`, 'UNKNOWN_REFERENCE', `Output "${o.apiName}" points at node "${String(o.node)}", which doesn't exist.`);
    if (result.nodes.has(o.node)) result.outputs.push({ apiName: o.apiName, node: o.node });
  });

  // Checks (static part: output and columns exist).
  (Array.isArray(def.checks) ? def.checks : []).forEach((c, i) => checkCheck(ctx, def, c, result, `${path}.checks[${i}]`));

  return result;
}

function checkCheck(ctx: Ctx, def: PipelineDef, c: PipelineCheck, r: CompiledPipeline, p: string): void {
  const out = (def.outputs ?? []).find((o) => o.apiName === c?.output);
  if (!out) return void ctx.err(`${p}.output`, 'UNKNOWN_REFERENCE', `Check on output "${String(c?.output)}", which doesn't exist.`);
  if (!['unique', 'notNull', 'rowCount'].includes(c.kind)) {
    return void ctx.err(`${p}.kind`, 'UNKNOWN_BLOCK_KIND', `Unknown check "${String(c.kind)}" (unique, notNull or rowCount).`);
  }
  if (c.kind === 'rowCount') {
    if (c.min === undefined && c.max === undefined) ctx.err(p, 'INVALID_NODE', 'A rowCount check needs min or max.');
    return;
  }
  if (!Array.isArray(c.columns) || c.columns.length === 0) return void ctx.err(`${p}.columns`, 'INVALID_NODE', `A ${c.kind} check needs columns.`);
  const node = r.nodes.get(out.node);
  if (!node) return; // the node's own error is reported
  c.columns.forEach((col, j) => colOf(ctx, node.columns, col, `${p}.columns[${j}]`, out.node));
}

// ───────────────────────── Checks ─────────────────────────

// One row: n (failing count) and up to two examples. `from` is a CTE name or a qualified table.
export function checkQuery(check: PipelineCheck, from: string): string {
  const cols = (check.columns ?? []).map(q);
  switch (check.kind) {
    case 'unique': {
      const list = cols.join(', ');
      return (
        `SELECT (SELECT count(*) FROM (SELECT 1 FROM ${from} GROUP BY ${list} HAVING count(*) > 1) d)::bigint AS n, ` +
        `(SELECT json_agg(x) FROM (SELECT ${list}, count(*) AS times FROM ${from} GROUP BY ${list} HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 2) x) AS examples`
      );
    }
    case 'notNull':
      return `SELECT count(*)::bigint AS n, NULL::json AS examples FROM ${from} WHERE ${cols.map((c) => `${c} IS NULL`).join(' OR ')}`;
    case 'rowCount':
      return `SELECT count(*)::bigint AS n, NULL::json AS examples FROM ${from}`;
  }
}

export type CheckResult = { check: PipelineCheck; ok: boolean; detail: string };

export function evaluateCheck(check: PipelineCheck, row: { n: unknown; examples: unknown }): CheckResult {
  const n = Number(row.n);
  const cols = (check.columns ?? []).join(', ');
  switch (check.kind) {
    case 'unique': {
      if (n === 0) return { check, ok: true, detail: `Every value of (${cols}) appears once.` };
      const ex = Array.isArray(row.examples) ? (row.examples as Record<string, unknown>[]) : [];
      const shown = ex
        .map((e) => `${(check.columns ?? []).map((c) => JSON.stringify(e[c])).join(' / ')} ×${String(e.times)}`)
        .join(', ');
      return { check, ok: false, detail: `${n} values of (${cols}) appear more than once${shown ? `, e.g. ${shown}` : ''}.` };
    }
    case 'notNull':
      return n === 0
        ? { check, ok: true, detail: `No empty values in (${cols}).` }
        : { check, ok: false, detail: `${n} rows have an empty value in (${cols}).` };
    case 'rowCount': {
      const tooFew = check.min !== undefined && n < check.min;
      const tooMany = check.max !== undefined && n > check.max;
      const bounds = [check.min !== undefined ? `at least ${check.min}` : '', check.max !== undefined ? `at most ${check.max}` : '']
        .filter(Boolean)
        .join(' and ');
      return { check, ok: !tooFew && !tooMany, detail: `${n} rows (expected ${bounds}).` };
    }
  }
}
