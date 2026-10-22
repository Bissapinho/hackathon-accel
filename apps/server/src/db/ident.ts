import { sql, type RawBuilder } from 'kysely';
import { ApiError } from '../errors.js';

const IDENT = /^[a-z][a-z0-9_]{0,62}$/;

// The only way a name from a document or a user reaches SQL (CLAUDE.md conventions, rule 9).
export function ident(name: string): RawBuilder<unknown> {
  assertIdent(name);
  return sql.id(name);
}

// `schema.name`, both parts checked.
export function qualified(schema: string, name: string): RawBuilder<unknown> {
  assertIdent(schema);
  assertIdent(name);
  return sql.id(schema, name);
}

export function assertIdent(name: string): void {
  if (!IDENT.test(name)) {
    throw new ApiError(400, 'INVALID_IDENTIFIER', `"${name}" can't be used as a table or column name.`, {
      hint: 'Use lowercase letters, digits and underscores, starting with a letter (max 63 characters).',
    });
  }
}
