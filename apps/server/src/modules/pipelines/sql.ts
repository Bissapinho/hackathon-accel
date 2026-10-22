import type { BaseType } from '@mini/shared';
import { assertIdent } from '../../db/ident.js';

// Small SQL text helpers for the pipeline compiler. Names always go through assertIdent (ident() rule);
// values never appear in the text: they are collected in a list and referenced by markers that
// `finalize` renumbers to $1, $2… for the statement actually sent (so unused fragments add no params).

export const SQL_TYPE: Record<BaseType, string> = {
  string: 'text',
  integer: 'bigint',
  double: 'double precision',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
};

export function q(name: string): string {
  assertIdent(name);
  return `"${name}"`;
}

export function qq(schema: string, name: string): string {
  return `${q(schema)}.${q(name)}`;
}

// Never in compiled text otherwise: names are ident()-checked and values never enter the text.
const MARKER = /⟦(\d+)⟧/g;

export class ParamList {
  readonly values: unknown[] = [];

  // A typed placeholder: the cast keeps Postgres from guessing the parameter's type.
  add(value: unknown, type: BaseType, array = false): string {
    this.values.push(value);
    return `⟦${this.values.length - 1}⟧::${SQL_TYPE[type]}${array ? '[]' : ''}`;
  }
}

export type Statement = { text: string; params: unknown[] };

export function finalize(text: string, values: readonly unknown[]): Statement {
  const seen = new Map<number, number>();
  const params: unknown[] = [];
  const out = text.replace(MARKER, (_m, k: string) => {
    const i = Number(k);
    let n = seen.get(i);
    if (n === undefined) {
      params.push(values[i]);
      n = params.length;
      seen.set(i, n);
    }
    return `$${n}`;
  });
  return { text: out, params };
}
