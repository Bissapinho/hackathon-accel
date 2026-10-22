import type {
  ActionTypeDef,
  BaseType,
  FieldError,
  Filter,
  LinkTypeDef,
  LogicDef,
  LogicExpr,
  ObjectSet,
  ObjectTypeDef,
  PipelineDef,
  Validation,
  ValueExpr,
  WorkspaceDoc,
} from '@mini/shared';
import type { SemanticsPort } from '../../ports.js';
import { sqlName as toSqlName } from '../logic/sqltext.js';
import { validateLogic } from '../logic/validate.js';

// Validation of the workspace document (04-api §5). This file holds the structural half (T-13): names,
// duplicates, references between entities, descriptions, cycles, types that can be known without running
// SQL, and references to the semantic bank through SemanticsPort (09 §4.1). Checks that need data (pipeline
// previews and checks, PK uniqueness, link match rates, empty sets) plug in through `DataChecker`.

// ───────────────────────────── Extension points ─────────────────────────────

// Columns of a dataset's current version, as stored in meta.dataset_versions.columns.
export type DatasetColumns = { sqlName: string; type: BaseType }[];

// What validation knows about the project's datasets: id → columns of the current version.
// `undefined` for an id means the dataset doesn't exist in the project.
export type DatasetCatalog = Map<string, DatasetColumns>;

// Data checks (T-13 data half), filled by the pipelines / datasets parts: PIPELINE_SQL_ERROR,
// PIPELINE_CHECK_FAILED, PK_NOT_UNIQUE, PK_HAS_NULLS, LINK_KEY_NOT_UNIQUE, LINK_LOW_MATCH, EMPTY_SET.
// Called only when the structure has no errors, so it may assume every reference resolves.
export interface DataChecker {
  check(doc: WorkspaceDoc, ctx: { projectId: string; datasets: DatasetCatalog }): Promise<Validation>;
}

export type ValidateContext = {
  projectId: string;
  semantics: SemanticsPort;
  datasets?: DatasetCatalog; // omit to skip dataset existence and column checks
  dataChecker?: DataChecker;
};

// ───────────────────────────── Names and types ─────────────────────────────

const SNAKE = /^[a-z][a-z0-9_]{0,62}$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const KEBAB = /^[a-z][a-z0-9-]*$/;
const SQL_IDENT = /^[a-z][a-z0-9_]{0,62}$/;

// SQL name of an API name (03-data-model §8): the same function publish uses for view columns.
export { toSqlName };

// `null` = unknown (e.g. a null literal): fits anything.
type T = BaseType | null;

// Integers fit doubles; `now` (timestamp) fits dates; null fits anything (04-api §5 TYPE_MISMATCH).
export function fits(expected: BaseType, actual: T): boolean {
  if (actual === null || actual === expected) return true;
  if (expected === 'double' && actual === 'integer') return true;
  if (expected === 'date' && actual === 'timestamp') return true;
  return false;
}

const isNumeric = (t: T) => t === 'integer' || t === 'double';

// ───────────────────────────── Collector ─────────────────────────────

class Report {
  errors: FieldError[] = [];
  warnings: FieldError[] = [];
  err(path: string, code: string, message: string) {
    this.errors.push({ path, code, message });
  }
  warn(path: string, code: string, message: string) {
    this.warnings.push({ path, code, message });
  }
}

function checkName(r: Report, path: string, value: string, re: RegExp, rule: string) {
  if (!re.test(value)) r.err(path, 'BAD_API_NAME', `"${value}" doesn't follow the naming rule: ${rule}.`);
  else if (re !== KEBAB && !SQL_IDENT.test(toSqlName(value))) {
    r.err(path, 'BAD_API_NAME', `"${value}" is too long once turned into a SQL name (max 63 characters).`);
  }
}

function checkDuplicates(r: Report, items: { path: string; key: string }[], what: string) {
  const seen = new Map<string, string>();
  for (const it of items) {
    const first = seen.get(it.key);
    if (first) r.err(it.path, 'DUPLICATE_API_NAME', `${what} "${it.key}" is defined twice (first at ${first}).`);
    else seen.set(it.key, it.path);
  }
}

function needDescription(r: Report, path: string, text: string, what: string) {
  if (!text.trim()) r.err(`${path}.description`, 'MISSING_DESCRIPTION', `${what} needs a description in plain words.`);
}

// ───────────────────────────── The model the checks run on ─────────────────────────────

type Member = { kind: 'property' | 'derived' | 'rule'; type: BaseType; editable: boolean; isPk: boolean };
type LinkEnd = { target: string; keys: { here: string; there: string }[] };

class Model {
  readonly types = new Map<string, ObjectTypeDef>();
  readonly members = new Map<string, Map<string, Member>>(); // type → property / logic name → member
  readonly links = new Map<string, Map<string, LinkEnd>>(); // type → link or reverse-link name → end

  constructor(readonly doc: WorkspaceDoc) {
    for (const t of doc.objectTypes) {
      if (this.types.has(t.apiName)) continue;
      this.types.set(t.apiName, t);
      const m = new Map<string, Member>();
      for (const p of t.properties) {
        if (!m.has(p.apiName)) m.set(p.apiName, { kind: 'property', type: p.type, editable: p.editable, isPk: p.apiName === t.primaryKey });
      }
      this.members.set(t.apiName, m);
      this.links.set(t.apiName, new Map());
    }
    for (const l of doc.logic) {
      const m = this.members.get(l.objectType);
      if (!m || m.has(l.apiName)) continue;
      m.set(l.apiName, { kind: l.kind, type: l.kind === 'rule' ? 'boolean' : l.type, editable: false, isPk: false });
    }
    for (const l of doc.linkTypes) {
      const fwd = this.links.get(l.from);
      const rev = this.links.get(l.to);
      if (fwd && !fwd.has(l.apiName)) {
        fwd.set(l.apiName, { target: l.to, keys: l.keys.map((k) => ({ here: k.fromProperty, there: k.toProperty })) });
      }
      if (rev && !rev.has(l.reverseApiName)) {
        rev.set(l.reverseApiName, { target: l.from, keys: l.keys.map((k) => ({ here: k.toProperty, there: k.fromProperty })) });
      }
    }
  }

  member(type: string, name: string): Member | undefined {
    return this.members.get(type)?.get(name);
  }

  isRule(type: string, name: string): boolean {
    return this.member(type, name)?.kind === 'rule';
  }
}

// ───────────────────────────── Filters and expressions ─────────────────────────────

// Where a filter or expression is evaluated: an object type (properties + logic) or a pipeline node (columns).
type Scope =
  | { kind: 'type'; type: string; model: Model }
  | { kind: 'columns'; columns: Map<string, BaseType> | null }; // null = columns unknown, skip

function lookup(scope: Scope, name: string): { found: boolean; type: T } {
  if (scope.kind === 'columns') {
    if (!scope.columns) return { found: true, type: null };
    const t = scope.columns.get(name);
    return { found: t !== undefined, type: t ?? null };
  }
  const m = scope.model.member(scope.type, name);
  return { found: !!m, type: m?.type ?? null };
}

function scopeLabel(scope: Scope): string {
  return scope.kind === 'type' ? `object type ${scope.type}` : 'this pipeline step';
}

function literalType(v: unknown): T {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'double';
  return 'string';
}

function checkFilter(r: Report, path: string, f: Filter, scope: Scope): void {
  switch (f.kind) {
    case 'and':
    case 'or':
      f.filters.forEach((g, i) => checkFilter(r, `${path}.filters[${i}]`, g, scope));
      return;
    case 'not':
      checkFilter(r, `${path}.filter`, f.filter, scope);
      return;
    case 'cmp': {
      const { found, type } = lookup(scope, f.property);
      if (!found) {
        r.err(`${path}.property`, 'UNKNOWN_REFERENCE', `"${f.property}" doesn't exist on ${scopeLabel(scope)}.`);
        return;
      }
      if (f.op === 'isNull' || f.op === 'notNull') return;
      if (f.value === undefined) {
        r.err(`${path}.value`, 'TYPE_MISMATCH', `The comparison "${f.op}" needs a value.`);
        return;
      }
      const isList = Array.isArray(f.value);
      if ((f.op === 'in' || f.op === 'notIn') !== isList) {
        r.err(`${path}.value`, 'TYPE_MISMATCH', `"${f.op}" ${isList ? "doesn't take" : 'needs'} a list of values.`);
        return;
      }
      if (f.op === 'startsWith' && type !== null && type !== 'string') {
        r.err(`${path}.op`, 'TYPE_MISMATCH', `"startsWith" only works on text; "${f.property}" is ${type}.`);
        return;
      }
      const values = Array.isArray(f.value) ? f.value : [f.value];
      for (const v of values) {
        if (type !== null && !literalFits(type, v)) {
          r.err(`${path}.value`, 'TYPE_MISMATCH', `${JSON.stringify(v)} isn't a valid ${type} for "${f.property}".`);
          return;
        }
      }
      return;
    }
    case 'cmpProps': {
      const a = lookup(scope, f.left);
      const b = lookup(scope, f.right);
      if (!a.found) r.err(`${path}.left`, 'UNKNOWN_REFERENCE', `"${f.left}" doesn't exist on ${scopeLabel(scope)}.`);
      if (!b.found) r.err(`${path}.right`, 'UNKNOWN_REFERENCE', `"${f.right}" doesn't exist on ${scopeLabel(scope)}.`);
      if (a.found && b.found && a.type && b.type && !fits(a.type, b.type) && !fits(b.type, a.type)) {
        r.err(path, 'TYPE_MISMATCH', `"${f.left}" (${a.type}) can't be compared with "${f.right}" (${b.type}).`);
      }
      return;
    }
    case 'rule':
      if (scope.kind === 'columns') {
        r.err(`${path}.rule`, 'UNKNOWN_REFERENCE', 'Rules can only be used on object types, not in pipelines.');
      } else if (!scope.model.isRule(scope.type, f.rule)) {
        r.err(`${path}.rule`, 'UNKNOWN_REFERENCE', `There is no rule "${f.rule}" on object type ${scope.type}.`);
      }
      return;
    case 'search':
      return;
  }
}

// Literals in filters: dates and timestamps are written as text; they must parse.
function literalFits(type: BaseType, v: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof v === 'string';
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'double':
      return typeof v === 'number';
    case 'boolean':
      return typeof v === 'boolean';
    case 'date':
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    case 'timestamp':
      return typeof v === 'string' && !Number.isNaN(Date.parse(v));
  }
}

// Infers the type of an expression; reports unknown names and impossible arithmetic. `deps` collects the
// logic items it reads (for cycle detection): "Type.name".
function exprType(r: Report, path: string, e: LogicExpr, scope: Scope, deps?: Set<string>): T {
  if ('property' in e) {
    const { found, type } = lookup(scope, e.property);
    if (!found) {
      r.err(`${path}.property`, 'UNKNOWN_REFERENCE', `"${e.property}" doesn't exist on ${scopeLabel(scope)}.`);
      return null;
    }
    if (scope.kind === 'type' && deps && scope.model.member(scope.type, e.property)?.kind !== 'property') {
      deps.add(`${scope.type}.${e.property}`);
    }
    return type;
  }
  if ('literal' in e) return literalType(e.literal);
  if ('now' in e) return 'timestamp';
  if ('today' in e) return 'date';
  if ('div' in e) {
    const [a, b] = e.div.map((x, i) => exprType(r, `${path}.div[${i}]`, x, scope, deps));
    if ((a && !isNumeric(a)) || (b && !isNumeric(b))) r.err(path, 'TYPE_MISMATCH', 'Division needs two numbers.');
    return 'double';
  }
  if ('add' in e) return arithmetic(r, path, 'add', e.add, scope, deps);
  if ('sub' in e) return arithmetic(r, path, 'sub', e.sub, scope, deps);
  if ('mul' in e) return arithmetic(r, path, 'mul', e.mul, scope, deps);
  if ('coalesce' in e) {
    const types = e.coalesce.map((x, i) => exprType(r, `${path}.coalesce[${i}]`, x, scope, deps));
    return unify(r, path, types);
  }
  if ('case' in e) {
    const types: T[] = [];
    e.case.forEach((c, i) => {
      checkFilter(r, `${path}.case[${i}].when`, c.when, scope);
      types.push(exprType(r, `${path}.case[${i}].then`, c.then, scope, deps));
    });
    if (e.else) types.push(exprType(r, `${path}.else`, e.else, scope, deps));
    return unify(r, path, types);
  }
  // aggregate over a link
  const a = e.aggregate;
  if (scope.kind === 'columns') {
    r.err(path, 'UNKNOWN_REFERENCE', 'Aggregates over links only work in logic, not in pipelines (use an aggregate step).');
    return null;
  }
  const end = scope.model.links.get(scope.type)?.get(a.link);
  if (!end) {
    r.err(`${path}.aggregate.link`, 'LOGIC_UNKNOWN_LINK', `There is no link "${a.link}" starting from ${scope.type}.`);
    return null;
  }
  const target: Scope = { kind: 'type', type: end.target, model: scope.model };
  if (a.where) checkFilter(r, `${path}.aggregate.where`, a.where, target);
  if (a.fn === 'count') return 'integer';
  if (!a.property) {
    r.err(`${path}.aggregate.property`, 'UNKNOWN_REFERENCE', `"${a.fn}" needs the property to aggregate.`);
    return null;
  }
  const m = scope.model.member(end.target, a.property);
  if (!m) {
    r.err(`${path}.aggregate.property`, 'UNKNOWN_REFERENCE', `"${a.property}" doesn't exist on object type ${end.target}.`);
    return null;
  }
  if (m.kind !== 'property' && deps) deps.add(`${end.target}.${a.property}`);
  if (a.fn === 'avg' || a.fn === 'sum') {
    if (!isNumeric(m.type)) {
      r.err(`${path}.aggregate`, 'TYPE_MISMATCH', `"${a.fn}" needs a number; "${a.property}" is ${m.type}.`);
      return null;
    }
    return a.fn === 'avg' ? 'double' : m.type;
  }
  return m.type;
}

function arithmetic(
  r: Report,
  path: string,
  op: 'add' | 'sub' | 'mul',
  args: [LogicExpr, LogicExpr],
  scope: Scope,
  deps?: Set<string>,
): T {
  const a = exprType(r, `${path}.${op}[0]`, args[0], scope, deps);
  const b = exprType(r, `${path}.${op}[1]`, args[1], scope, deps);
  if (a === null || b === null) return a ?? b;
  if (isNumeric(a) && isNumeric(b)) return a === 'double' || b === 'double' ? 'double' : 'integer';
  if (op === 'sub' && a === 'date' && b === 'date') return 'integer'; // days between
  if (op !== 'mul' && a === 'date' && b === 'integer') return 'date';
  r.err(path, 'TYPE_MISMATCH', `"${op}" can't combine ${a} and ${b}.`);
  return null;
}

function unify(r: Report, path: string, types: T[]): T {
  const known = types.filter((t): t is BaseType => t !== null);
  if (known.length === 0) return null;
  if (known.every(isNumeric)) return known.includes('double') ? 'double' : 'integer';
  const first = known[0]!;
  if (!known.every((t) => t === first)) r.err(path, 'TYPE_MISMATCH', `The branches give different types: ${[...new Set(known)].join(', ')}.`);
  return first;
}

// ───────────────────────────── Pipelines ─────────────────────────────

// Columns of every node, inferred without SQL. null when a source dataset is unknown (catalog missing).
export function inferPipelineColumns(
  p: PipelineDef,
  datasets: DatasetCatalog | undefined,
  r: Report = new Report(),
  basePath = '',
): Map<string, Map<string, BaseType> | null> {
  const out = new Map<string, Map<string, BaseType> | null>();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const visiting = new Set<string>();

  const cols = (id: string): Map<string, BaseType> | null => {
    if (out.has(id)) return out.get(id)!;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return null; // reported elsewhere (unknown input / cycle)
    visiting.add(id);
    const i = p.nodes.indexOf(node);
    const path = `${basePath}nodes[${i}]`;
    let result: Map<string, BaseType> | null = null;
    const need = (m: Map<string, BaseType> | null, col: string, field: string) => {
      if (m && !m.has(col)) r.err(`${path}.${field}`, 'UNKNOWN_REFERENCE', `Column "${col}" doesn't exist at step "${node.id}".`);
    };
    switch (node.kind) {
      case 'source': {
        const ds = datasets?.get(node.datasetId);
        result = ds ? new Map(ds.map((c) => [c.sqlName, c.type])) : null;
        break;
      }
      case 'filter': {
        result = cols(node.input);
        checkFilter(r, `${path}.where`, node.where, { kind: 'columns', columns: result });
        break;
      }
      case 'select': {
        const input = cols(node.input);
        node.columns.forEach((c, j) => need(input, c, `columns[${j}]`));
        result = input && new Map(node.columns.filter((c) => input.has(c)).map((c) => [c, input.get(c)!]));
        break;
      }
      case 'rename': {
        const input = cols(node.input);
        if (input) {
          result = new Map();
          for (const [c, t] of input) result.set(node.map[c] ?? c, t);
          for (const [from, to] of Object.entries(node.map)) {
            need(input, from, `map.${from}`);
            checkName(r, `${path}.map.${from}`, to, SNAKE, 'column names are snake_case');
          }
        }
        break;
      }
      case 'cast': {
        const input = cols(node.input);
        need(input, node.column, 'column');
        result = input && new Map(input).set(node.column, node.to);
        break;
      }
      case 'derive': {
        const input = cols(node.input);
        checkName(r, `${path}.as`, node.as, SNAKE, 'column names are snake_case');
        const t = exprType(r, `${path}.expr`, node.expr, { kind: 'columns', columns: input });
        result = input && new Map(input).set(node.as, t ?? 'string');
        break;
      }
      case 'join': {
        const left = cols(node.left);
        const right = cols(node.right);
        node.on.forEach((k, j) => {
          need(left, k.left, `on[${j}].left`);
          need(right, k.right, `on[${j}].right`);
          const lt = left?.get(k.left);
          const rt = right?.get(k.right);
          if (lt && rt && !fits(lt, rt) && !fits(rt, lt)) {
            r.err(`${path}.on[${j}]`, 'TYPE_MISMATCH', `Join keys "${k.left}" (${lt}) and "${k.right}" (${rt}) have different types.`);
          }
        });
        if (left && right) {
          result = new Map(left);
          const prefix = node.rightPrefix ?? '';
          for (const [c, t] of right) {
            const name = `${prefix}${c}`;
            if (result.has(name)) {
              if (!node.on.some((k) => k.right === c)) {
                r.err(path, 'DUPLICATE_API_NAME', `Column "${name}" exists on both sides of the join; set rightPrefix.`);
              }
            } else result.set(name, t);
          }
        }
        break;
      }
      case 'union': {
        const inputs = node.inputs.map(cols);
        const first = inputs[0];
        if (first && inputs.every((m) => m)) {
          inputs.slice(1).forEach((m, j) => {
            const same = m!.size === first.size && [...first].every(([c, t]) => m!.get(c) === t);
            if (!same) r.err(`${path}.inputs[${j + 1}]`, 'TYPE_MISMATCH', 'All inputs of a union need the same columns and types.');
          });
          result = first;
        }
        break;
      }
      case 'aggregate': {
        const input = cols(node.input);
        node.groupBy.forEach((c, j) => need(input, c, `groupBy[${j}]`));
        if (input) {
          result = new Map(node.groupBy.filter((c) => input.has(c)).map((c) => [c, input.get(c)!]));
          node.measures.forEach((m, j) => {
            checkName(r, `${path}.measures[${j}].as`, m.as, SNAKE, 'column names are snake_case');
            let t: BaseType = 'integer';
            if (m.fn !== 'count' || m.column) {
              if (!m.column) {
                r.err(`${path}.measures[${j}].column`, 'UNKNOWN_REFERENCE', `"${m.fn}" needs a column.`);
              } else {
                need(input, m.column, `measures[${j}].column`);
                const ct = input.get(m.column);
                if ((m.fn === 'sum' || m.fn === 'avg') && ct && !isNumeric(ct)) {
                  r.err(`${path}.measures[${j}]`, 'TYPE_MISMATCH', `"${m.fn}" needs a number; "${m.column}" is ${ct}.`);
                }
                if (m.fn === 'avg') t = 'double';
                else if (m.fn === 'sum') t = ct === 'double' ? 'double' : 'integer';
                else if (m.fn === 'min' || m.fn === 'max') t = ct ?? 'string';
              }
            }
            result!.set(m.as, t);
          });
        }
        break;
      }
      case 'deduplicate': {
        const input = cols(node.input);
        node.keys.forEach((c, j) => need(input, c, `keys[${j}]`));
        node.orderBy?.forEach((o, j) => need(input, o.column, `orderBy[${j}].column`));
        result = input;
        break;
      }
    }
    visiting.delete(id);
    out.set(id, result);
    return result;
  };

  for (const n of p.nodes) cols(n.id);
  return out;
}

function nodeInputs(n: PipelineDef['nodes'][number]): string[] {
  switch (n.kind) {
    case 'source':
      return [];
    case 'join':
      return [n.left, n.right];
    case 'union':
      return n.inputs;
    default:
      return [n.input];
  }
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    if (state.get(n) === 'done') return null;
    if (state.get(n) === 'visiting') return [...stack.slice(stack.indexOf(n)), n];
    state.set(n, 'visiting');
    stack.push(n);
    for (const d of graph.get(n) ?? []) {
      if (!graph.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(n, 'done');
    return null;
  };
  for (const n of graph.keys()) {
    const c = visit(n);
    if (c) return c;
  }
  return null;
}

function checkPipelines(r: Report, doc: WorkspaceDoc, datasets: DatasetCatalog | undefined) {
  checkDuplicates(r, doc.pipelines.map((p, i) => ({ path: `pipelines[${i}].apiName`, key: p.apiName })), 'Pipeline');
  const outputs = new Map<string, Map<string, BaseType> | null>(); // "pipeline.output" → columns
  doc.pipelines.forEach((p, i) => {
    const base = `pipelines[${i}]`;
    checkName(r, `${base}.apiName`, p.apiName, SNAKE, 'pipeline names are snake_case');
    checkDuplicates(r, p.nodes.map((n, j) => ({ path: `${base}.nodes[${j}].id`, key: n.id })), 'Step');
    checkDuplicates(r, p.outputs.map((o, j) => ({ path: `${base}.outputs[${j}].apiName`, key: o.apiName })), 'Output');
    const ids = new Set(p.nodes.map((n) => n.id));
    p.nodes.forEach((n, j) => {
      checkName(r, `${base}.nodes[${j}].id`, n.id, SNAKE, 'step ids are snake_case');
      for (const input of nodeInputs(n)) {
        if (!ids.has(input)) r.err(`${base}.nodes[${j}]`, 'UNKNOWN_REFERENCE', `Step "${n.id}" reads "${input}", which isn't a step of this pipeline.`);
      }
      if (n.kind === 'source' && datasets && !datasets.has(n.datasetId)) {
        r.err(`${base}.nodes[${j}].datasetId`, 'UNKNOWN_REFERENCE', `Dataset "${n.datasetId}" doesn't exist in this project or has no uploaded version.`);
      }
    });
    const cycle = findCycle(new Map(p.nodes.map((n) => [n.id, nodeInputs(n)])));
    if (cycle) {
      r.err(`${base}.nodes`, 'PIPELINE_CYCLE', `The steps loop back on themselves: ${cycle.join(' → ')}.`);
      return;
    }
    const cols = inferPipelineColumns(p, datasets, r, `${base}.`);
    p.outputs.forEach((o, j) => {
      checkName(r, `${base}.outputs[${j}].apiName`, o.apiName, SNAKE, 'output names are snake_case');
      if (!ids.has(o.node)) r.err(`${base}.outputs[${j}].node`, 'UNKNOWN_REFERENCE', `Output "${o.apiName}" points at missing step "${o.node}".`);
      outputs.set(`${p.apiName}.${o.apiName}`, cols.get(o.node) ?? null);
    });
    p.checks.forEach((c, j) => {
      const path = `${base}.checks[${j}]`;
      const out = p.outputs.find((o) => o.apiName === c.output);
      if (!out) {
        r.err(`${path}.output`, 'UNKNOWN_REFERENCE', `Check on missing output "${c.output}".`);
        return;
      }
      if (c.kind === 'rowCount') {
        if (c.min === undefined && c.max === undefined) r.err(path, 'TYPE_MISMATCH', 'A rowCount check needs min and/or max.');
      } else if (!c.columns?.length) {
        r.err(`${path}.columns`, 'TYPE_MISMATCH', `A ${c.kind} check needs at least one column.`);
      } else {
        const known = cols.get(out.node);
        c.columns.forEach((col, k) => {
          if (known && !known.has(col)) r.err(`${path}.columns[${k}]`, 'UNKNOWN_REFERENCE', `Column "${col}" isn't in output "${c.output}".`);
        });
      }
    });
  });
  return outputs;
}

// ───────────────────────────── Object types and links ─────────────────────────────

function checkObjectTypes(
  r: Report,
  doc: WorkspaceDoc,
  model: Model,
  outputs: Map<string, Map<string, BaseType> | null>,
  datasets: DatasetCatalog | undefined,
) {
  checkDuplicates(r, doc.objectTypes.map((t, i) => ({ path: `objectTypes[${i}].apiName`, key: t.apiName })), 'Object type');
  const aliasOwner = new Map<string, string>();
  doc.objectTypes.forEach((t, i) => {
    const base = `objectTypes[${i}]`;
    checkName(r, `${base}.apiName`, t.apiName, PASCAL, 'object types are PascalCase');
    needDescription(r, base, t.description, `Object type ${t.apiName}`);
    if (!t.term) r.warn(`${base}.term`, 'MISSING_TERM', `Object type ${t.apiName} isn't tied to a Term of the meaning bank.`);

    for (const a of t.aliases) {
      const key = a.trim().toLowerCase();
      const owner = aliasOwner.get(key);
      if (owner && owner !== t.apiName) r.warn(`${base}.aliases`, 'ALIAS_COLLISION', `Alias "${a}" is also used by ${owner}.`);
      else aliasOwner.set(key, t.apiName);
    }

    // Source and its columns.
    let columns: Map<string, BaseType> | null = null;
    if (t.source.kind === 'pipeline') {
      const key = `${t.source.pipeline}.${t.source.output}`;
      if (!outputs.has(key)) {
        r.err(`${base}.source`, 'UNKNOWN_REFERENCE', `Pipeline output "${key}" doesn't exist in the draft.`);
      } else columns = outputs.get(key) ?? null;
    } else if (datasets) {
      const ds = datasets.get(t.source.datasetId);
      if (!ds) r.err(`${base}.source.datasetId`, 'UNKNOWN_REFERENCE', `Dataset "${t.source.datasetId}" doesn't exist in this project or has no uploaded version.`);
      else columns = new Map(ds.map((c) => [c.sqlName, c.type]));
    }

    checkDuplicates(
      r,
      [
        ...t.properties.map((p, j) => ({ path: `${base}.properties[${j}].apiName`, key: p.apiName })),
        ...doc.logic.flatMap((l, j) => (l.objectType === t.apiName ? [{ path: `logic[${j}].apiName`, key: l.apiName }] : [])),
      ],
      `Property or logic of ${t.apiName}`,
    );
    t.properties.forEach((p, j) => {
      const path = `${base}.properties[${j}]`;
      checkName(r, `${path}.apiName`, p.apiName, CAMEL, 'properties are camelCase');
      needDescription(r, path, p.description, `Property ${t.apiName}.${p.apiName}`);
      if (p.column === undefined) {
        if (!p.editable) r.err(`${path}.column`, 'UNKNOWN_REFERENCE', `Property ${p.apiName} has no column, so it must be editable (set by actions).`);
        return;
      }
      if (!SQL_IDENT.test(p.column)) {
        r.err(`${path}.column`, 'BAD_API_NAME', `Column "${p.column}" isn't a valid column name (snake_case).`);
        return;
      }
      if (columns) {
        const ct = columns.get(p.column);
        if (!ct) r.err(`${path}.column`, 'UNKNOWN_REFERENCE', `Column "${p.column}" doesn't exist in the source of ${t.apiName}.`);
        else if (!fits(p.type, ct)) r.err(`${path}.type`, 'TYPE_MISMATCH', `Property ${p.apiName} is ${p.type} but column "${p.column}" is ${ct}.`);
      }
      if (p.allowedValues && p.type !== 'string') {
        r.err(`${path}.allowedValues`, 'TYPE_MISMATCH', 'Allowed values are only for text properties.');
      }
    });
    // SQL names must stay distinct once snake_cased (view columns).
    checkDuplicates(
      r,
      t.properties.map((p, j) => ({ path: `${base}.properties[${j}].apiName`, key: toSqlName(p.apiName) })),
      `SQL column of ${t.apiName}`,
    );

    const pk = t.properties.find((p) => p.apiName === t.primaryKey);
    if (!pk) r.err(`${base}.primaryKey`, 'UNKNOWN_REFERENCE', `Primary key "${t.primaryKey}" isn't a property of ${t.apiName}.`);
    else {
      if (pk.editable) r.err(`${base}.primaryKey`, 'PK_EDITABLE', `The primary key ${pk.apiName} can't be editable.`);
      if (pk.column === undefined) r.err(`${base}.primaryKey`, 'UNKNOWN_REFERENCE', `The primary key ${pk.apiName} must come from a source column.`);
    }
    if (!model.member(t.apiName, t.titleProperty)) {
      r.err(`${base}.titleProperty`, 'UNKNOWN_REFERENCE', `Title property "${t.titleProperty}" isn't a property of ${t.apiName}.`);
    }
  });
}

function checkLinks(r: Report, doc: WorkspaceDoc, model: Model) {
  checkDuplicates(
    r,
    [
      ...doc.linkTypes.map((l, i) => ({ path: `linkTypes[${i}].apiName`, key: `${l.from}.${l.apiName}` })),
      ...doc.linkTypes.map((l, i) => ({ path: `linkTypes[${i}].reverseApiName`, key: `${l.to}.${l.reverseApiName}` })),
    ],
    'Link',
  );
  doc.linkTypes.forEach((l: LinkTypeDef, i) => {
    const base = `linkTypes[${i}]`;
    checkName(r, `${base}.apiName`, l.apiName, CAMEL, 'links are camelCase');
    checkName(r, `${base}.reverseApiName`, l.reverseApiName, CAMEL, 'links are camelCase');
    needDescription(r, base, l.description, `Link ${l.from}.${l.apiName}`);
    if (!l.relation) r.warn(`${base}.relation`, 'MISSING_TERM', `Link ${l.from}.${l.apiName} isn't tied to a Relation of the meaning bank.`);
    const fromOk = model.types.has(l.from);
    const toOk = model.types.has(l.to);
    if (!fromOk) r.err(`${base}.from`, 'UNKNOWN_REFERENCE', `Object type "${l.from}" doesn't exist in the draft.`);
    if (!toOk) r.err(`${base}.to`, 'UNKNOWN_REFERENCE', `Object type "${l.to}" doesn't exist in the draft.`);
    l.keys.forEach((k, j) => {
      const a = fromOk ? model.member(l.from, k.fromProperty) : undefined;
      const b = toOk ? model.member(l.to, k.toProperty) : undefined;
      if (fromOk && a?.kind !== 'property') r.err(`${base}.keys[${j}].fromProperty`, 'UNKNOWN_REFERENCE', `"${k.fromProperty}" isn't a property of ${l.from}.`);
      if (toOk && b?.kind !== 'property') r.err(`${base}.keys[${j}].toProperty`, 'UNKNOWN_REFERENCE', `"${k.toProperty}" isn't a property of ${l.to}.`);
      if (a && b && !fits(a.type, b.type) && !fits(b.type, a.type)) {
        r.err(`${base}.keys[${j}]`, 'TYPE_MISMATCH', `Key "${k.fromProperty}" (${a.type}) can't match "${k.toProperty}" (${b.type}).`);
      }
    });
  });
}

// ───────────────────────────── Logic ─────────────────────────────

function checkLogic(r: Report, doc: WorkspaceDoc, model: Model) {
  const deps = new Map<string, string[]>();
  doc.logic.forEach((l: LogicDef, i) => {
    const base = `logic[${i}]`;
    checkName(r, `${base}.apiName`, l.apiName, CAMEL, 'logic names are camelCase');
    needDescription(r, base, l.description, `Logic ${l.objectType}.${l.apiName}`);
    if (!model.types.has(l.objectType)) {
      r.err(`${base}.objectType`, 'UNKNOWN_REFERENCE', `Object type "${l.objectType}" doesn't exist in the draft.`);
      return;
    }
    const scope: Scope = { kind: 'type', type: l.objectType, model };
    const used = new Set<string>();
    if (l.kind === 'derived') {
      const t = exprType(r, `${base}.expr`, l.expr, scope, used);
      if (t && !fits(l.type, t)) r.err(`${base}.type`, 'TYPE_MISMATCH', `${l.apiName} is declared ${l.type} but its formula gives ${t}.`);
    } else {
      checkFilter(r, `${base}.condition`, l.condition, scope);
      collectRuleDeps(l.condition, l.objectType, used);
    }
    deps.set(`${l.objectType}.${l.apiName}`, [...used]);
  });
  const cycle = findCycle(deps);
  if (cycle) {
    const at = doc.logic.findIndex((l) => `${l.objectType}.${l.apiName}` === cycle[0]);
    r.err(`logic[${at}]`, 'LOGIC_CYCLE', `These calculations depend on each other in a loop: ${cycle.join(' → ')}.`);
  }
  // Publish compiles logic with the logic module's own checks (cycles through `case`/aggregate filters,
  // nesting depth, stricter types): report what they refuse on items not flagged above, so a draft that
  // validates also publishes.
  const logicIndex = (path: string) => /^logic\[(\d+)\]/.exec(path)?.[1];
  const flagged = new Set(r.errors.map((e) => logicIndex(e.path)).filter((i) => i !== undefined));
  for (const e of validateLogic(doc).errors) {
    const i = logicIndex(e.path);
    if (i !== undefined && !flagged.has(i)) r.errors.push(e);
  }
}

function collectRuleDeps(f: Filter, type: string, into: Set<string>) {
  if (f.kind === 'and' || f.kind === 'or') f.filters.forEach((g) => collectRuleDeps(g, type, into));
  else if (f.kind === 'not') collectRuleDeps(f.filter, type, into);
  else if (f.kind === 'rule') into.add(`${type}.${f.rule}`);
  else if (f.kind === 'cmp') into.add(`${type}.${f.property}`);
  else if (f.kind === 'cmpProps') {
    into.add(`${type}.${f.left}`);
    into.add(`${type}.${f.right}`);
  }
}

// ───────────────────────────── Actions ─────────────────────────────

function checkActions(r: Report, doc: WorkspaceDoc, model: Model) {
  checkDuplicates(r, doc.actionTypes.map((a, i) => ({ path: `actionTypes[${i}].apiName`, key: a.apiName })), 'Action');
  doc.actionTypes.forEach((a: ActionTypeDef, i) => {
    const base = `actionTypes[${i}]`;
    checkName(r, `${base}.apiName`, a.apiName, PASCAL, 'actions are PascalCase (verb + noun)');
    needDescription(r, base, a.description, `Action ${a.apiName}`);
    if (!a.agentDescription.trim()) r.err(`${base}.agentDescription`, 'MISSING_DESCRIPTION', `Action ${a.apiName} needs a description for the agent.`);
    checkDuplicates(r, a.parameters.map((p, j) => ({ path: `${base}.parameters[${j}].id`, key: p.id })), 'Parameter');

    const params = new Map(a.parameters.map((p) => [p.id, p]));
    a.parameters.forEach((p, j) => {
      const path = `${base}.parameters[${j}]`;
      checkName(r, `${path}.id`, p.id, CAMEL, 'parameters are camelCase');
      if (p.kind === 'object' && !model.types.has(p.objectType)) {
        r.err(`${path}.objectType`, 'UNKNOWN_REFERENCE', `Object type "${p.objectType}" doesn't exist in the draft.`);
      }
      if (p.kind === 'value' && p.default) {
        const t = valueType(r, `${path}.default`, p.default, params, model);
        if (t && !fits(p.type, t)) r.err(`${path}.default`, 'TYPE_MISMATCH', `The default of ${p.id} isn't a ${p.type}.`);
      }
    });

    const objectParam = (path: string, id: string) => {
      const p = params.get(id);
      if (!p) r.err(path, 'UNKNOWN_REFERENCE', `"${id}" isn't a parameter of ${a.apiName}.`);
      else if (p.kind !== 'object') r.err(path, 'TYPE_MISMATCH', `"${id}" must be an object parameter.`);
      else if (model.types.has(p.objectType)) return p.objectType;
      return null;
    };

    const checkSet = (path: string, type: string, set: Record<string, ValueExpr>, creating: boolean) => {
      for (const [prop, expr] of Object.entries(set)) {
        const m = model.member(type, prop);
        const at = `${path}.set.${prop}`;
        if (!m) {
          r.err(at, 'UNKNOWN_REFERENCE', `"${prop}" isn't a property of ${type}.`);
          continue;
        }
        if (m.kind !== 'property') r.err(at, 'RULE_SETS_READONLY', `"${prop}" is calculated by logic and can't be set.`);
        else if (!creating && (m.isPk || !m.editable)) r.err(at, 'RULE_SETS_READONLY', `"${prop}" of ${type} isn't editable.`);
        const t = valueType(r, at, expr, params, model);
        if (t && !fits(m.type, t)) r.err(at, 'TYPE_MISMATCH', `"${prop}" is ${m.type} but gets a ${t}.`);
      }
    };

    a.rules.forEach((rule, j) => {
      const path = `${base}.rules[${j}]`;
      if (rule.kind === 'modifyObject') {
        const type = objectParam(`${path}.object`, rule.object);
        if (type) checkSet(path, type, rule.set, false);
      } else if (rule.kind === 'deleteObject') {
        objectParam(`${path}.object`, rule.object);
      } else {
        if (!model.types.has(rule.objectType)) {
          r.err(`${path}.objectType`, 'UNKNOWN_REFERENCE', `Object type "${rule.objectType}" doesn't exist in the draft.`);
          return;
        }
        const pk = model.types.get(rule.objectType)!.primaryKey;
        const pkType = model.member(rule.objectType, pk)?.type;
        const t = valueType(r, `${path}.primaryKey`, rule.primaryKey, params, model);
        if (t && pkType && !fits(pkType, t)) r.err(`${path}.primaryKey`, 'TYPE_MISMATCH', `The primary key of ${rule.objectType} is ${pkType} but gets a ${t}.`);
        checkSet(path, rule.objectType, rule.set, true);
      }
    });

    a.submissionCriteria.forEach((c, j) => {
      const path = `${base}.submissionCriteria[${j}]`;
      if (c.kind === 'compare') {
        const lt = valueType(r, `${path}.left`, c.left, params, model);
        if (c.op === 'isNull' || c.op === 'notNull') return;
        if (!c.right) {
          r.err(`${path}.right`, 'TYPE_MISMATCH', `"${c.op}" needs a right-hand value.`);
          return;
        }
        if (c.right.kind === 'list') {
          if (c.op !== 'in' && c.op !== 'notIn') r.err(`${path}.right`, 'TYPE_MISMATCH', `A list only works with "in" / "notIn".`);
          return;
        }
        const rt = valueType(r, `${path}.right`, c.right, params, model);
        if (lt && rt && !fits(lt, rt) && !fits(rt, lt)) r.err(path, 'TYPE_MISMATCH', `Can't compare a ${lt} with a ${rt}.`);
        return;
      }
      if (!model.types.has(c.objectType)) {
        r.err(`${path}.objectType`, 'UNKNOWN_REFERENCE', `Object type "${c.objectType}" doesn't exist in the draft.`);
        return;
      }
      if (!model.isRule(c.objectType, c.rule)) {
        r.err(`${path}.rule`, 'CRITERION_UNKNOWN_RULE', `"${c.rule}" isn't a rule of ${c.objectType}.`);
      }
      if (c.object.kind === 'param') {
        const type = objectParam(`${path}.object.param`, c.object.param);
        if (type && type !== c.objectType) r.err(`${path}.object`, 'TYPE_MISMATCH', `Parameter "${c.object.param}" is a ${type}, not a ${c.objectType}.`);
      } else {
        if (c.object.objectType !== c.objectType) {
          r.err(`${path}.object.objectType`, 'TYPE_MISMATCH', `The lookup finds a ${c.object.objectType}, but the rule is on ${c.objectType}.`);
        } else {
          for (const [prop, expr] of Object.entries(c.object.keys)) {
            const m = model.member(c.objectType, prop);
            if (!m) r.err(`${path}.object.keys.${prop}`, 'UNKNOWN_REFERENCE', `"${prop}" isn't a property of ${c.objectType}.`);
            const t = valueType(r, `${path}.object.keys.${prop}`, expr, params, model);
            if (m && t && !fits(m.type, t)) r.err(`${path}.object.keys.${prop}`, 'TYPE_MISMATCH', `"${prop}" is ${m.type} but gets a ${t}.`);
          }
        }
      }
    });

    checkTemplate(r, `${base}.successMessage`, a.successMessage, params, model);
  });
}

type ParamMap = Map<string, ActionTypeDef['parameters'][number]>;

function valueType(r: Report, path: string, e: ValueExpr, params: ParamMap, model: Model): T {
  switch (e.kind) {
    case 'literal':
      return literalType(e.value);
    case 'now':
      return 'timestamp';
    case 'currentUser':
      return 'string';
    case 'param': {
      const p = params.get(e.param);
      if (!p) {
        r.err(path, 'UNKNOWN_REFERENCE', `"${e.param}" isn't a parameter of this action.`);
        return null;
      }
      if (p.kind === 'value') return p.type;
      // An object parameter used as a value stands for its primary key.
      const t = model.types.get(p.objectType);
      return t ? (model.member(p.objectType, t.primaryKey)?.type ?? null) : null;
    }
    case 'paramProperty': {
      const p = params.get(e.param);
      if (!p) {
        r.err(path, 'UNKNOWN_REFERENCE', `"${e.param}" isn't a parameter of this action.`);
        return null;
      }
      if (p.kind !== 'object') {
        r.err(path, 'TYPE_MISMATCH', `"${e.param}" is a value, so it has no property "${e.property}".`);
        return null;
      }
      if (!model.types.has(p.objectType)) return null;
      const m = model.member(p.objectType, e.property);
      if (!m) {
        r.err(path, 'UNKNOWN_REFERENCE', `"${e.property}" isn't a property of ${p.objectType}.`);
        return null;
      }
      return m.type;
    }
  }
}

// {{param}} and {{param.property}} in messages must name real parameters and properties.
function checkTemplate(r: Report, path: string, text: string, params: ParamMap, model: Model) {
  for (const m of text.matchAll(/\{\{\s*([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\s*\}\}/g)) {
    const [, id, prop] = m;
    const p = params.get(id!);
    if (!p) {
      r.err(path, 'UNKNOWN_REFERENCE', `The message uses {{${id}}}, which isn't a parameter.`);
    } else if (prop) {
      if (p.kind !== 'object') r.err(path, 'UNKNOWN_REFERENCE', `{{${id}.${prop}}}: ${id} is a value, not an object.`);
      else if (model.types.has(p.objectType) && !model.member(p.objectType, prop)) {
        r.err(path, 'UNKNOWN_REFERENCE', `{{${id}.${prop}}}: "${prop}" isn't a property of ${p.objectType}.`);
      }
    }
  }
}

// ───────────────────────────── Apps and automations (stretch) ─────────────────────────────

// Type of the objects in a set; reports unknown names.
function setType(r: Report, path: string, s: ObjectSet, model: Model): string | null {
  switch (s.kind) {
    case 'all':
      if (!model.types.has(s.objectType)) {
        r.err(`${path}.objectType`, 'UNKNOWN_REFERENCE', `Object type "${s.objectType}" doesn't exist in the draft.`);
        return null;
      }
      return s.objectType;
    case 'filter': {
      const t = setType(r, `${path}.of`, s.of, model);
      if (t) checkFilter(r, `${path}.where`, s.where, { kind: 'type', type: t, model });
      return t;
    }
    case 'linked': {
      const t = setType(r, `${path}.of`, s.of, model);
      if (!t) return null;
      const end = model.links.get(t)?.get(s.link);
      if (!end) r.err(`${path}.link`, 'UNKNOWN_REFERENCE', `There is no link "${s.link}" from ${t}.`);
      return end?.target ?? null;
    }
    case 'refs': {
      const types = new Set(s.refs.map((ref) => ref.objectType));
      for (const t of types) if (!model.types.has(t)) r.err(`${path}.refs`, 'UNKNOWN_REFERENCE', `Object type "${t}" doesn't exist in the draft.`);
      return types.size === 1 ? [...types][0]! : null;
    }
  }
}

function checkApps(r: Report, doc: WorkspaceDoc, model: Model) {
  checkDuplicates(r, doc.apps.map((a, i) => ({ path: `apps[${i}].id`, key: a.id })), 'App');
  doc.apps.forEach((app, i) => {
    const base = `apps[${i}]`;
    checkName(r, `${base}.id`, app.id, KEBAB, 'app ids are kebab-case');
    const lists = new Map<string, string | null>(); // objectList id → type
    for (const b of app.pages.flatMap((page) => page.blocks)) {
      // Errors in the list's set are reported once, below.
      if (b.kind === 'objectList') lists.set(b.id, setType(new Report(), '', b.set, model));
    }
    app.pages.forEach((page, j) =>
      page.blocks.forEach((b, k) => {
        const path = `${base}.pages[${j}].blocks[${k}]`;
        const prop = (t: string | null, at: string, name: string) => {
          if (t && !model.member(t, name)) r.err(at, 'UNKNOWN_REFERENCE', `"${name}" isn't a property of ${t}.`);
        };
        switch (b.kind) {
          case 'metric': {
            const t = setType(r, `${path}.set`, b.set, model);
            if (b.aggregate.fn !== 'count') prop(t, `${path}.aggregate.property`, b.aggregate.property);
            break;
          }
          case 'chart': {
            const t = setType(r, `${path}.set`, b.set, model);
            prop(t, `${path}.groupBy`, b.groupBy);
            if (b.aggregate.fn !== 'count') prop(t, `${path}.aggregate.property`, b.aggregate.property);
            break;
          }
          case 'objectList': {
            const t = setType(r, `${path}.set`, b.set, model);
            b.columns.forEach((c, n) => prop(t, `${path}.columns[${n}]`, c));
            b.sort.forEach((s, n) => prop(t, `${path}.sort[${n}].property`, s.property));
            b.filters.forEach((f, n) => prop(t, `${path}.filters[${n}].property`, f.property));
            break;
          }
          case 'objectDetail': {
            if (!lists.has(b.source)) {
              r.err(`${path}.source`, 'UNKNOWN_REFERENCE', `There is no object list "${b.source}" in this app.`);
              break;
            }
            const t = lists.get(b.source) ?? null;
            b.properties.forEach((p, n) => prop(t, `${path}.properties[${n}]`, p));
            b.links.forEach((l, n) => {
              if (t && !model.links.get(t)?.has(l)) r.err(`${path}.links[${n}]`, 'UNKNOWN_REFERENCE', `There is no link "${l}" from ${t}.`);
            });
            b.actions.forEach((a, n) => {
              if (!doc.actionTypes.some((x) => x.apiName === a)) r.err(`${path}.actions[${n}]`, 'UNKNOWN_REFERENCE', `There is no action "${a}".`);
            });
            break;
          }
          case 'markdown':
            break;
        }
      }),
    );
  });
}

function checkAutomations(r: Report, doc: WorkspaceDoc, model: Model) {
  checkDuplicates(r, doc.automations.map((a, i) => ({ path: `automations[${i}].id`, key: a.id })), 'Automation');
  doc.automations.forEach((a, i) => {
    const base = `automations[${i}]`;
    checkName(r, `${base}.id`, a.id, KEBAB, 'automation ids are kebab-case');
    setType(r, `${base}.condition.set`, a.condition.set, model);
    a.effects.forEach((e, j) => {
      if (e.kind !== 'runAction') return;
      const action = doc.actionTypes.find((x) => x.apiName === e.action);
      if (!action) {
        r.err(`${base}.effects[${j}].action`, 'UNKNOWN_REFERENCE', `There is no action "${e.action}".`);
        return;
      }
      for (const p of Object.keys(e.params)) {
        if (!action.parameters.some((x) => x.id === p)) {
          r.err(`${base}.effects[${j}].params.${p}`, 'UNKNOWN_REFERENCE', `"${p}" isn't a parameter of ${e.action}.`);
        }
      }
    });
  });
}

// ───────────────────────────── Semantic references (09 §4.1) ─────────────────────────────

type SemRef = { path: string; id: string; kind: 'term' | 'relation' | 'constraint' };
const PREFIX = { term: 'T_', relation: 'R_', constraint: 'C_' } as const;

function semanticRefs(doc: WorkspaceDoc): SemRef[] {
  const refs: SemRef[] = [];
  doc.pipelines.forEach((p, i) => p.terms?.forEach((id, j) => refs.push({ path: `pipelines[${i}].terms[${j}]`, id, kind: 'term' })));
  doc.objectTypes.forEach((t, i) => {
    if (t.term) refs.push({ path: `objectTypes[${i}].term`, id: t.term, kind: 'term' });
    t.properties.forEach((p, j) => {
      if (p.term) refs.push({ path: `objectTypes[${i}].properties[${j}].term`, id: p.term, kind: 'term' });
    });
  });
  doc.linkTypes.forEach((l, i) => {
    if (l.relation) refs.push({ path: `linkTypes[${i}].relation`, id: l.relation, kind: 'relation' });
  });
  doc.logic.forEach((l, i) => l.constraints?.forEach((id, j) => refs.push({ path: `logic[${i}].constraints[${j}]`, id, kind: 'constraint' })));
  doc.actionTypes.forEach((a, i) =>
    a.constraints?.forEach((id, j) => refs.push({ path: `actionTypes[${i}].constraints[${j}]`, id, kind: 'constraint' })),
  );
  return refs;
}

async function checkSemantics(r: Report, doc: WorkspaceDoc, ctx: ValidateContext) {
  const active = await ctx.semantics.activeVersion(ctx.projectId);
  if (!doc.semanticVersion) {
    r.err('semanticVersion', 'UNKNOWN_REFERENCE', 'The draft is not built on a published meaning version yet.');
    return;
  }
  if (active && active !== doc.semanticVersion) {
    r.warn('semanticVersion', 'SEM_VERSION_STALE', `A newer meaning version (${active}) is active; the draft is built on ${doc.semanticVersion}.`);
  }
  const exists = new Map<string, Promise<boolean>>();
  const checks = semanticRefs(doc).map(async (ref) => {
    if (!ref.id.startsWith(PREFIX[ref.kind])) {
      r.err(ref.path, 'UNKNOWN_REFERENCE', `"${ref.id}" isn't a ${ref.kind} id (they start with ${PREFIX[ref.kind]}).`);
      return;
    }
    if (!exists.has(ref.id)) exists.set(ref.id, ctx.semantics.recordExists(ctx.projectId, doc.semanticVersion, ref.id));
    if (!(await exists.get(ref.id))) {
      r.err(ref.path, 'UNKNOWN_REFERENCE', `${ref.kind[0]!.toUpperCase()}${ref.kind.slice(1)} "${ref.id}" doesn't exist in meaning version ${doc.semanticVersion}.`);
    }
  });
  await Promise.all(checks);
}

// ───────────────────────────── Entry points ─────────────────────────────

// Everything that needs no data and no database (pure).
export function validateStructure(doc: WorkspaceDoc, datasets?: DatasetCatalog): Validation {
  const r = new Report();
  const model = new Model(doc);
  const outputs = checkPipelines(r, doc, datasets);
  checkObjectTypes(r, doc, model, outputs, datasets);
  checkLinks(r, doc, model);
  checkLogic(r, doc, model);
  checkActions(r, doc, model);
  checkApps(r, doc, model);
  checkAutomations(r, doc, model);
  return { errors: r.errors, warnings: r.warnings };
}

// Structure + semantic references + data checks (when a DataChecker is given and the structure is clean).
export async function validateWorkspace(doc: WorkspaceDoc, ctx: ValidateContext): Promise<Validation> {
  const structure = validateStructure(doc, ctx.datasets);
  const sem = new Report();
  await checkSemantics(sem, doc, ctx);
  const result: Validation = {
    errors: [...structure.errors, ...sem.errors],
    warnings: [...structure.warnings, ...sem.warnings],
  };
  if (ctx.dataChecker && result.errors.length === 0) {
    const data = await ctx.dataChecker.check(doc, { projectId: ctx.projectId, datasets: ctx.datasets ?? new Map() });
    result.errors.push(...data.errors);
    result.warnings.push(...data.warnings);
  }
  return result;
}
