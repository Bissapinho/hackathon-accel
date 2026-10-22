import type { BaseType } from '@mini/shared';
import { assertIdent } from '../../db/ident.js';

// SQL text helpers for the logic compiler. Names always go through assertIdent (rule 9).
// Values go through a ValueSink: bound parameters for queries (testLogic), escaped literals for
// view DDL (CREATE VIEW can't take bind parameters).

// snake_case SQL name of an API name: CuisineJour → cuisine_jour, tauxRetour → taux_retour (03 §8).
export function sqlName(apiName: string): string {
  return apiName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

// A checked, quoted identifier.
export function q(name: string): string {
  assertIdent(name);
  return `"${name}"`;
}

export const PG_TYPE: Record<BaseType, string> = {
  string: 'text',
  integer: 'bigint',
  double: 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
};

export type SqlValue = string | number | boolean | null | (string | number)[];

export interface ValueSink {
  // Returns SQL text standing for `value`, cast to `type` when given.
  value(value: SqlValue, type?: BaseType): string;
}

export class ParamSink implements ValueSink {
  readonly params: unknown[] = [];
  value(value: SqlValue, type?: BaseType): string {
    if (value === null) return type ? `NULL::${PG_TYPE[type]}` : 'NULL';
    this.params.push(value);
    const ref = `$${this.params.length}`;
    if (!type) return ref;
    return Array.isArray(value) ? `${ref}::${PG_TYPE[type]}[]` : `${ref}::${PG_TYPE[type]}`;
  }
}

export class InlineSink implements ValueSink {
  value(value: SqlValue, type?: BaseType): string {
    if (Array.isArray(value)) {
      const items = value.map((v) => literal(v));
      return `ARRAY[${items.join(', ')}]${type ? `::${PG_TYPE[type]}[]` : ''}`;
    }
    const text = literal(value);
    return type && value !== null ? `${text}::${PG_TYPE[type]}` : type ? `NULL::${PG_TYPE[type]}` : text;
  }
}

// The one escaping function for inlined values.
export function literal(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
    return String(value);
  }
  if (value.includes('\0')) throw new Error('Text values cannot contain NUL characters.');
  return `'${value.replace(/'/g, "''")}'`;
}

// Escapes LIKE wildcards so a user value matches literally (used with ESCAPE '\').
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
