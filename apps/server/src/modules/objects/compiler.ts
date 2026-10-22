import type { Filter, ObjectSet } from '@mini/shared';
import { sql, type RawBuilder } from 'kysely';
import { ident, qualified } from '../../db/ident.js';
import { ApiError } from '../../errors.js';
import { getColumn, getLink, getType, type ObjectModel, type ObjectTypeModel } from './model.js';

// ObjectSet / Filter → SQL over logic.<type> views (04-api §4). Names go through ident(), values are
// parameters (CLAUDE.md rule 9). The compiled set is a SELECT returning the view's columns.

export type CompiledSet = { type: ObjectTypeModel; sql: RawBuilder<unknown> };

const MAX_DEPTH = 10;

export function objectView(t: ObjectTypeModel): RawBuilder<unknown> {
  return qualified('logic', t.sqlName);
}

export function col(alias: string, sqlName: string): RawBuilder<unknown> {
  return sql`${ident(alias)}.${ident(sqlName)}`;
}

export function compileObjectSet(model: ObjectModel, set: ObjectSet, depth = 0): CompiledSet {
  if (depth > MAX_DEPTH) {
    throw new ApiError(400, 'OBJECT_SET_TOO_DEEP', `This object set nests more than ${MAX_DEPTH} levels.`, {
      hint: 'Combine filters with "and" instead of nesting filter sets.',
    });
  }
  const alias = `s${depth}`;
  switch (set.kind) {
    case 'all': {
      const t = getType(model, set.objectType);
      return { type: t, sql: sql`SELECT * FROM ${objectView(t)}` };
    }
    case 'filter': {
      const inner = compileObjectSet(model, set.of, depth + 1);
      const where = compileFilter(set.where, inner.type, alias);
      return { type: inner.type, sql: sql`SELECT ${ident(alias)}.* FROM (${inner.sql}) AS ${ident(alias)} WHERE ${where}` };
    }
    case 'linked': {
      const inner = compileObjectSet(model, set.of, depth + 1);
      const side = getLink(model, inner.type.apiName, set.link);
      const target = getType(model, side.target);
      const src = `${alias}_src`;
      const conds = side.keys.map(
        (k) =>
          sql`${col(src, getColumn(inner.type, k.sourceProperty).sqlName)} = ${col(alias, getColumn(target, k.targetProperty).sqlName)}`,
      );
      return {
        type: target,
        sql: sql`SELECT ${ident(alias)}.* FROM ${objectView(target)} AS ${ident(alias)} WHERE EXISTS (SELECT 1 FROM (${inner.sql}) AS ${ident(src)} WHERE ${sql.join(conds, sql` AND `)})`,
      };
    }
    case 'refs': {
      const types = [...new Set(set.refs.map((r) => r.objectType))];
      if (types.length !== 1) {
        throw new ApiError(400, 'MIXED_OBJECT_TYPES', 'All objects in a "refs" set must be of the same object type.', {
          hint: `Found: ${types.join(', ') || 'no objects'}.`,
        });
      }
      const t = getType(model, types[0]!);
      const keys = set.refs.map((r) => r.primaryKey);
      return {
        type: t,
        sql: sql`SELECT ${ident(alias)}.* FROM ${objectView(t)} AS ${ident(alias)} WHERE ${col(alias, t.primaryKey.sqlName)}::text = ANY(${keys}::text[])`,
      };
    }
    default:
      throw unknownKind('object set', (set as { kind?: unknown }).kind, 'all, filter, linked, refs');
  }
}

// A Filter evaluated on the row `alias` of type `t`. Also used by rules (03-data-model §7).
export function compileFilter(filter: Filter, t: ObjectTypeModel, alias: string): RawBuilder<unknown> {
  switch (filter.kind) {
    case 'and':
    case 'or': {
      if (filter.filters.length === 0) return filter.kind === 'and' ? sql`TRUE` : sql`FALSE`;
      const parts = filter.filters.map((f) => sql`(${compileFilter(f, t, alias)})`);
      return sql.join(parts, filter.kind === 'and' ? sql` AND ` : sql` OR `);
    }
    case 'not':
      return sql`NOT (${compileFilter(filter.filter, t, alias)})`;
    case 'cmp': {
      const c = col(alias, getColumn(t, filter.property).sqlName);
      const v = filter.value;
      switch (filter.op) {
        case 'isNull':
          return sql`${c} IS NULL`;
        case 'notNull':
          return sql`${c} IS NOT NULL`;
        case 'in':
        case 'notIn': {
          if (!Array.isArray(v)) throw badValue(filter.property, filter.op, 'a list of values');
          return filter.op === 'in' ? sql`${c} = ANY(${v})` : sql`NOT (${c} = ANY(${v}))`;
        }
        case 'startsWith':
          if (typeof v !== 'string') throw badValue(filter.property, filter.op, 'a text value');
          return sql`starts_with(${c}::text, ${v})`;
        default: {
          if (v === undefined || v === null || Array.isArray(v)) throw badValue(filter.property, filter.op, 'one value');
          return sql`${c} ${sql.raw(SQL_OPS[filter.op])} ${v}`;
        }
      }
    }
    case 'cmpProps': {
      const l = col(alias, getColumn(t, filter.left).sqlName);
      const r = col(alias, getColumn(t, filter.right).sqlName);
      return sql`${l} ${sql.raw(SQL_OPS[filter.op])} ${r}`;
    }
    case 'rule':
      return sql`${col(alias, getColumn(t, filter.rule, ['rule']).sqlName)} IS TRUE`;
    case 'search': {
      const strings = [...t.columns.values()].filter((c) => c.type === 'string' && c.kind !== 'rule');
      if (strings.length === 0) return sql`FALSE`;
      const parts = strings.map((s) => sql`strpos(lower(${col(alias, s.sqlName)}), lower(${filter.text})) > 0`);
      return sql`(${sql.join(parts, sql` OR `)})`;
    }
    default:
      throw unknownKind('filter', (filter as { kind?: unknown }).kind, 'and, or, not, cmp, cmpProps, rule, search');
  }
}

const SQL_OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

function badValue(property: string, op: string, expected: string): ApiError {
  return new ApiError(400, 'INVALID_FILTER_VALUE', `The filter "${op}" on ${property} needs ${expected}.`);
}

function unknownKind(what: string, kind: unknown, known: string): ApiError {
  return new ApiError(400, 'UNKNOWN_KIND', `Unknown ${what} kind "${String(kind)}".`, { hint: `Known kinds: ${known}.` });
}
