import type { BaseType, FieldError, Filter, LogicDef, LogicExpr, Validation } from '@mini/shared';
import { findMember, findType, resolveLink, type LogicDoc } from './model.js';

// Structural validation of the logic part of a workspace document (04-api §5, 03-data-model §7).
// Pure: no database. Data checks (EMPTY_SET on rules) belong to the workspace validation with data.

const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

type Ctx = {
  doc: LogicDoc;
  objectType: string;
  inAggregate: boolean; // compiling against the target of an aggregate (one level of nesting)
  errors: FieldError[];
};

const isNumeric = (t: BaseType | null): boolean => t === 'integer' || t === 'double';

// Can a value of type `actual` be stored where `expected` is declared? (04 §5 TYPE_MISMATCH)
export function fits(actual: BaseType | null, expected: BaseType): boolean {
  if (actual === null || actual === expected) return true;
  return actual === 'integer' && expected === 'double';
}

// Does a literal (from a document) parse as `type`?
export function valueFits(value: string | number | boolean, type: BaseType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^-?\d+$/.test(value));
    case 'double':
      return (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    case 'timestamp':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
  }
}

// The type an expression evaluates to (null = unknown, e.g. a null literal). Records errors in ctx.
function checkExpr(ctx: Ctx, expr: LogicExpr, path: string, expected?: BaseType): BaseType | null {
  const err = (code: string, message: string, p = path) => ctx.errors.push({ path: p, code, message });

  if ('property' in expr) {
    const m = findMember(ctx.doc, ctx.objectType, expr.property);
    if (!m) {
      err('UNKNOWN_REFERENCE', `${ctx.objectType} has no property or logic named "${expr.property}".`);
      return null;
    }
    if (ctx.inAggregate && m.kind !== 'property' && containsAggregate(ctx.doc, ctx.objectType, m.def.apiName)) {
      err(
        'LOGIC_TOO_DEEP',
        `"${ctx.objectType}.${m.def.apiName}" itself sums over linked objects; only one level of nesting is allowed.`,
      );
    }
    return m.type;
  }
  if ('literal' in expr) {
    const v = expr.literal;
    if (v === null) return null;
    if (expected && !valueFits(v, expected)) {
      err('TYPE_MISMATCH', `The value ${JSON.stringify(v)} is not a valid ${expected}.`);
      return expected;
    }
    if (expected) return expected;
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'double';
    return 'string';
  }
  if ('now' in expr) return 'timestamp';
  if ('today' in expr) return 'date';

  for (const op of ['add', 'sub', 'mul', 'div'] as const) {
    if (op in expr) {
      const [a, b] = (expr as Record<typeof op, [LogicExpr, LogicExpr]>)[op];
      const hintA = 'literal' in a ? undefined : peekType(ctx, a);
      const hintB = 'literal' in b ? undefined : peekType(ctx, b);
      const ta = checkExpr(ctx, a, `${path}.${op}[0]`, numericHint(hintB, op));
      const tb = checkExpr(ctx, b, `${path}.${op}[1]`, numericHint(hintA, op));
      // Date arithmetic: date ± integer days, date − date = days.
      if ((op === 'add' || op === 'sub') && ta === 'date' && tb === 'integer') return 'date';
      if (op === 'add' && ta === 'integer' && tb === 'date') return 'date';
      if (op === 'sub' && ta === 'date' && tb === 'date') return 'integer';
      if ((ta !== null && !isNumeric(ta)) || (tb !== null && !isNumeric(tb))) {
        err('TYPE_MISMATCH', `"${op}" needs numbers (or date ± days), got ${ta ?? 'null'} and ${tb ?? 'null'}.`);
        return null;
      }
      if (op === 'div') return 'double';
      return ta === 'integer' && tb === 'integer' ? 'integer' : ta === null && tb === null ? null : 'double';
    }
  }

  if ('coalesce' in expr) {
    if (expr.coalesce.length === 0) err('TYPE_MISMATCH', '"coalesce" needs at least one value.');
    const hint = expected ?? firstKnown(ctx, expr.coalesce);
    let out: BaseType | null = null;
    expr.coalesce.forEach((e, i) => {
      const t = checkExpr(ctx, e, `${path}.coalesce[${i}]`, hint ?? undefined);
      out = unify(ctx, out, t, `${path}.coalesce[${i}]`);
    });
    return out;
  }

  if ('case' in expr) {
    const hint = expected ?? firstKnown(ctx, [...expr.case.map((c) => c.then), ...(expr.else ? [expr.else] : [])]);
    let out: BaseType | null = null;
    expr.case.forEach((c, i) => {
      checkFilter(ctx, c.when, `${path}.case[${i}].when`);
      out = unify(ctx, out, checkExpr(ctx, c.then, `${path}.case[${i}].then`, hint ?? undefined), `${path}.case[${i}].then`);
    });
    if (expr.else) out = unify(ctx, out, checkExpr(ctx, expr.else, `${path}.else`, hint ?? undefined), `${path}.else`);
    return out;
  }

  if ('aggregate' in expr) {
    const { link, fn, property, where } = expr.aggregate;
    if (ctx.inAggregate) {
      err('LOGIC_TOO_DEEP', 'An aggregate inside an aggregate is not supported; only one level of nesting is allowed.');
      return null;
    }
    const resolved = resolveLink(ctx.doc, ctx.objectType, link);
    if (!resolved) {
      err('LOGIC_UNKNOWN_LINK', `No link "${link}" starts from ${ctx.objectType} (neither a link nor a reverse link).`);
      return null;
    }
    if (!findType(ctx.doc, resolved.target)) {
      err('UNKNOWN_REFERENCE', `The link "${link}" leads to ${resolved.target}, which doesn't exist.`);
      return null;
    }
    const inner: Ctx = { ...ctx, objectType: resolved.target, inAggregate: true };
    if (where) checkFilter(inner, where, `${path}.aggregate.where`);
    if (fn === 'count') return 'integer';
    if (!property) {
      err('UNKNOWN_REFERENCE', `"${fn}" needs a property of ${resolved.target} to work on.`, `${path}.aggregate.property`);
      return null;
    }
    const t = checkExpr(inner, { property }, `${path}.aggregate.property`);
    if ((fn === 'sum' || fn === 'avg') && t !== null && !isNumeric(t)) {
      err('TYPE_MISMATCH', `"${fn}" needs a number, but ${resolved.target}.${property} is ${t}.`, `${path}.aggregate.property`);
      return null;
    }
    if (fn === 'avg') return 'double';
    return t;
  }

  err('UNKNOWN_BLOCK_KIND', `Unknown expression: ${JSON.stringify(expr).slice(0, 80)}.`);
  return null;
}

function numericHint(other: BaseType | null | undefined, op: string): BaseType | undefined {
  if (other === 'integer' || other === 'double') return op === 'div' ? 'double' : other;
  if (other === 'date') return 'integer';
  return undefined;
}

// Type of an expression without recording errors (used as a hint for literals next to it).
function peekType(ctx: Ctx, expr: LogicExpr): BaseType | null {
  return checkExpr({ ...ctx, errors: [] }, expr, '');
}

function firstKnown(ctx: Ctx, exprs: LogicExpr[]): BaseType | null {
  for (const e of exprs) {
    if ('literal' in e) continue;
    const t = peekType(ctx, e);
    if (t) return t;
  }
  return null;
}

function unify(ctx: Ctx, a: BaseType | null, b: BaseType | null, path: string): BaseType | null {
  if (a === null) return b;
  if (b === null || a === b) return a;
  if (isNumeric(a) && isNumeric(b)) return 'double';
  ctx.errors.push({ path, code: 'TYPE_MISMATCH', message: `This branch is ${b} but the others are ${a}.` });
  return a;
}

export function checkFilter(ctx: Ctx, f: Filter, path: string): void {
  const err = (code: string, message: string): void => {
    ctx.errors.push({ path, code, message });
  };
  switch (f.kind) {
    case 'and':
    case 'or':
      f.filters.forEach((sub, i) => checkFilter(ctx, sub, `${path}.filters[${i}]`));
      return;
    case 'not':
      checkFilter(ctx, f.filter, `${path}.filter`);
      return;
    case 'rule': {
      const m = findMember(ctx.doc, ctx.objectType, f.rule);
      if (!m || m.kind !== 'rule') err('UNKNOWN_REFERENCE', `${ctx.objectType} has no rule named "${f.rule}".`);
      return;
    }
    case 'search':
      if (!findType(ctx.doc, ctx.objectType)?.properties.some((p) => p.type === 'string')) {
        err('TYPE_MISMATCH', `${ctx.objectType} has no text property to search in.`);
      }
      return;
    case 'cmpProps': {
      const l = checkExpr(ctx, { property: f.left }, `${path}.left`);
      const r = checkExpr(ctx, { property: f.right }, `${path}.right`);
      if (l && r && l !== r && !(isNumeric(l) && isNumeric(r))) {
        err('TYPE_MISMATCH', `Can't compare "${f.left}" (${l}) with "${f.right}" (${r}).`);
      }
      if (l === 'boolean' && f.op !== 'eq' && f.op !== 'neq') err('TYPE_MISMATCH', `"${f.op}" doesn't apply to yes/no values.`);
      return;
    }
    case 'cmp': {
      const t = checkExpr(ctx, { property: f.property }, `${path}.property`);
      if (t === null) return;
      if (f.op === 'isNull' || f.op === 'notNull') return;
      if (f.value === undefined) return err('TYPE_MISMATCH', `"${f.op}" needs a value.`);
      if (f.op === 'in' || f.op === 'notIn') {
        if (!Array.isArray(f.value)) return err('TYPE_MISMATCH', `"${f.op}" needs a list of values.`);
        const bad = f.value.find((v) => !valueFits(v, t));
        if (bad !== undefined) err('TYPE_MISMATCH', `${JSON.stringify(bad)} is not a valid ${t} for "${f.property}".`);
        return;
      }
      if (Array.isArray(f.value)) return err('TYPE_MISMATCH', `"${f.op}" needs a single value, not a list.`);
      if (f.op === 'startsWith' && t !== 'string') return err('TYPE_MISMATCH', `"startsWith" only applies to text; "${f.property}" is ${t}.`);
      if (t === 'boolean' && f.op !== 'eq' && f.op !== 'neq') return err('TYPE_MISMATCH', `"${f.op}" doesn't apply to yes/no values.`);
      if (!valueFits(f.value, t)) err('TYPE_MISMATCH', `${JSON.stringify(f.value)} is not a valid ${t} for "${f.property}".`);
      return;
    }
    default:
      err('UNKNOWN_BLOCK_KIND', `Unknown filter kind "${(f as { kind: string }).kind}".`);
  }
}

// Does this derived property (or rule) of objectType use an aggregate, directly or through same-type logic?
export function containsAggregate(doc: LogicDoc, objectType: string, name: string, seen = new Set<string>()): boolean {
  const key = `${objectType}.${name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const l = doc.logic.find((x) => x.objectType === objectType && x.apiName === name);
  if (!l) return false;
  const refs = l.kind === 'derived' ? exprRefs(l.expr) : filterRefs(l.condition);
  if (refs.aggregate) return true;
  return refs.names.some((n) => containsAggregate(doc, objectType, n, seen));
}

type Refs = { names: string[]; aggregates: { link: string; property?: string; where?: Filter }[]; aggregate: boolean };

function exprRefs(expr: LogicExpr, out: Refs = { names: [], aggregates: [], aggregate: false }): Refs {
  if ('property' in expr) out.names.push(expr.property);
  else if ('add' in expr) expr.add.forEach((e) => exprRefs(e, out));
  else if ('sub' in expr) expr.sub.forEach((e) => exprRefs(e, out));
  else if ('mul' in expr) expr.mul.forEach((e) => exprRefs(e, out));
  else if ('div' in expr) expr.div.forEach((e) => exprRefs(e, out));
  else if ('coalesce' in expr) expr.coalesce.forEach((e) => exprRefs(e, out));
  else if ('case' in expr) {
    expr.case.forEach((c) => {
      filterRefs(c.when, out);
      exprRefs(c.then, out);
    });
    if (expr.else) exprRefs(expr.else, out);
  } else if ('aggregate' in expr) {
    out.aggregate = true;
    out.aggregates.push(expr.aggregate);
  }
  return out;
}

function filterRefs(f: Filter, out: Refs = { names: [], aggregates: [], aggregate: false }): Refs {
  switch (f.kind) {
    case 'and':
    case 'or':
      f.filters.forEach((s) => filterRefs(s, out));
      break;
    case 'not':
      filterRefs(f.filter, out);
      break;
    case 'cmp':
      out.names.push(f.property);
      break;
    case 'cmpProps':
      out.names.push(f.left, f.right);
      break;
    case 'rule':
      out.names.push(f.rule);
      break;
  }
  return out;
}

// The type an expression evaluates to on objectType (null = unknown). No errors reported.
export function exprType(doc: LogicDoc, objectType: string, expr: LogicExpr): BaseType | null {
  return checkExpr({ doc, objectType, inAggregate: false, errors: [] }, expr, '');
}

// Direct logic dependencies of one logic item, as "Type.apiName" (same type, and targets of aggregates).
function directDeps(doc: LogicDoc, l: LogicDef): string[] {
  // Same lookup order as findMember: a property wins over a logic item of the same name.
  const isLogic = (type: string, name: string) => findMember(doc, type, name)?.kind !== 'property' &&
    doc.logic.some((x) => x.objectType === type && x.apiName === name);
  const refs = l.kind === 'derived' ? exprRefs(l.expr) : filterRefs(l.condition);
  const out = refs.names.filter((n) => isLogic(l.objectType, n)).map((n) => `${l.objectType}.${n}`);
  for (const a of refs.aggregates) {
    const link = resolveLink(doc, l.objectType, a.link);
    if (!link) continue;
    const targetRefs = [...(a.property ? [a.property] : []), ...(a.where ? filterRefs(a.where).names : [])];
    out.push(...targetRefs.filter((n) => isLogic(link.target, n)).map((n) => `${link.target}.${n}`));
  }
  return out;
}

// Every logic item that objectType.name uses, directly or not.
export function dependencies(doc: LogicDoc, objectType: string, name: string): string[] {
  const seen = new Set<string>();
  const visit = (key: string) => {
    const l = doc.logic.find((x) => `${x.objectType}.${x.apiName}` === key);
    if (!l) return;
    for (const d of directDeps(doc, l)) {
      if (!seen.has(d)) {
        seen.add(d);
        visit(d);
      }
    }
  };
  visit(`${objectType}.${name}`);
  seen.delete(`${objectType}.${name}`);
  return [...seen];
}

// Cycles between logic items (03 §7 LOGIC_CYCLE), across types through aggregates.
// Returns each cycle as a list of "Type.apiName", first item repeated at the end.
export function detectCycles(doc: LogicDoc): string[][] {
  const edges = new Map<string, string[]>();
  for (const l of doc.logic) edges.set(`${l.objectType}.${l.apiName}`, directDeps(doc, l));

  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string) => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (s === undefined) visit(next);
    }
    stack.pop();
    state.set(node, 'done');
  };
  for (const node of edges.keys()) if (!state.has(node)) visit(node);
  return cycles;
}

// All structural checks of doc.logic. Paths point into the document ("logic[2].expr.div[1]").
export function validateLogic(doc: LogicDoc): Validation {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  const seen = new Set<string>();

  doc.logic.forEach((l: LogicDef, i) => {
    const path = `logic[${i}]`;
    const type = findType(doc, l.objectType);
    if (!type) {
      errors.push({ path: `${path}.objectType`, code: 'UNKNOWN_REFERENCE', message: `There is no object type "${l.objectType}".` });
      return;
    }
    if (!CAMEL.test(l.apiName)) {
      errors.push({ path: `${path}.apiName`, code: 'BAD_API_NAME', message: `"${l.apiName}" must be camelCase (e.g. tauxRetour).` });
    }
    const key = `${l.objectType}.${l.apiName}`;
    if (seen.has(key) || type.properties.some((p) => p.apiName === l.apiName)) {
      errors.push({
        path: `${path}.apiName`,
        code: 'DUPLICATE_API_NAME',
        message: `${l.objectType} already has a property or logic named "${l.apiName}".`,
      });
    }
    seen.add(key);
    if (!l.description?.trim()) {
      errors.push({ path: `${path}.description`, code: 'MISSING_DESCRIPTION', message: `Describe what "${l.apiName}" means in plain words.` });
    }

    const ctx: Ctx = { doc, objectType: l.objectType, inAggregate: false, errors };
    if (l.kind === 'derived') {
      const t = checkExpr(ctx, l.expr, `${path}.expr`, l.type);
      const nowAsDate = 'now' in l.expr && l.type === 'date';
      if (!fits(t, l.type) && !nowAsDate) {
        errors.push({ path: `${path}.type`, code: 'TYPE_MISMATCH', message: `"${l.apiName}" is declared ${l.type} but computes a ${t}.` });
      }
    } else if (l.kind === 'rule') {
      checkFilter(ctx, l.condition, `${path}.condition`);
    } else {
      errors.push({ path: `${path}.kind`, code: 'UNKNOWN_BLOCK_KIND', message: `Unknown logic kind "${(l as { kind: string }).kind}".` });
    }
  });

  for (const cycle of detectCycles(doc)) {
    const first = cycle[0]!;
    const index = doc.logic.findIndex((l) => `${l.objectType}.${l.apiName}` === first);
    errors.push({
      path: `logic[${index}]`,
      code: 'LOGIC_CYCLE',
      message: `These calculations depend on each other in a loop: ${cycle.join(' → ')}.`,
    });
  }
  return { errors, warnings };
}
