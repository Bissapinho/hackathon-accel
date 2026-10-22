import type { SqlResponse } from '@mini/shared';
import { sql, type Kysely } from 'kysely';
import { withReadOnly as realWithReadOnly } from '../../db/readonly.js';
import type { DB } from '../../db/types.js';
import type { AppDeps } from '../../services.js';
import { isSqlError, sqlError, sqlRejected, sqlTimeout } from './errors.js';
import { checkReadOnlySql } from './parse.js';
import type { SqlRequest } from './schemas.js';

// Read-only SQL service (T-16): runs one checked SELECT as `mini_reader` through the Phase 0 helper
// `withReadOnly` (09 §4.3: BEGIN READ ONLY; SET LOCAL ROLE mini_reader; statement_timeout; ROLLBACK),
// with a 5 s timeout and a 500-row cap. Used by POST /api/projects/:pid/sql, the agent's `run_sql`
// tool and the semantic bank's Evidence queries (`runEvidenceQuery`).

export const SQL_TIMEOUT_MS = 5_000; // 01-architecture §9 "Rules for this plan": agent SQL 5 s
export const SQL_MAX_ROWS = 500;
export const SUMMARY_MAX_BYTES = 2_048;

export type WithReadOnly = <T>(opts: { timeoutMs: number }, fn: (db: Kysely<DB>) => Promise<T>) => Promise<T>;
export type SqlColumn = SqlResponse['columns'][number];

export type SqlServiceDeps = {
  /** Defaults to the real helper of db/readonly.ts; tests may wrap it. */
  withReadOnly?: WithReadOnly;
  timeoutMs?: number;
  maxRows?: number;
  now?: () => number;
};

export type SqlService = {
  /** Throws ApiError SQL_REJECTED (400), SQL_TIMEOUT (422) or SQL_ERROR (400). */
  run(projectId: string, input: SqlRequest): Promise<SqlResponse>;
  /** The semantic bank's hook for Evidence queries: a ≤ 2 KB text summary; SQL failures become text too. */
  runEvidenceQuery(projectId: string, query: string): Promise<string>;
};

// Column names and types: Kysely returns rows as objects only (no field metadata, and duplicate names
// collapse), and a READ ONLY transaction can't CREATE TEMP VIEW. So the query is described with two
// cheap `LIMIT 0` wrappers, then read with positional column names c1…cN:
//   1. names, in order and with duplicates: the keys of row_to_json() of a one-row LEFT JOIN on the
//      empty query (all values NULL, but the row exists);
//   2. types: pg_typeof() of each column of that same NULL row (typed NULLs keep their type);
//   3. rows: SELECT * FROM (query) AS _q(c1, …, cN) LIMIT maxRows + 1.
// The parser guarantees one statement with balanced parentheses, so the query stays inside the wrapper.

function namesQuery(body: string): string {
  return `SELECT k.name FROM (
  SELECT row_to_json(_r) AS j FROM (
    SELECT _q.* FROM (VALUES (1)) AS _d(x) LEFT JOIN (SELECT * FROM (
${body}
) AS _i LIMIT 0) AS _q ON true
  ) AS _r
) AS _s, json_object_keys(_s.j) WITH ORDINALITY AS k(name, n) ORDER BY k.n`;
}

function aliases(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i + 1}`);
}

function typesQuery(body: string, n: number): string {
  const cols = aliases(n);
  return `SELECT ${cols.map((c) => `pg_typeof(_q.${c})::text AS ${c}`).join(', ')}
FROM (VALUES (1)) AS _d(x) LEFT JOIN (SELECT * FROM (
${body}
) AS _i(${cols.join(', ')}) LIMIT 0) AS _q ON true`;
}

function rowsQuery(body: string, n: number, limit: number): string {
  // A query with no columns (SELECT FROM t) still has rows: count them with a constant.
  if (n === 0) return `SELECT 1 AS c0 FROM (\n${body}\n) AS _q LIMIT ${limit}`;
  return `SELECT * FROM (\n${body}\n) AS _q(${aliases(n).join(', ')}) LIMIT ${limit}`;
}

export function createSqlService(deps: SqlServiceDeps = {}): SqlService {
  const withReadOnly = deps.withReadOnly ?? realWithReadOnly;
  const timeoutMs = deps.timeoutMs ?? SQL_TIMEOUT_MS;
  const maxRows = deps.maxRows ?? SQL_MAX_ROWS;
  const now = deps.now ?? (() => performance.now());

  async function run(_projectId: string, input: SqlRequest): Promise<SqlResponse> {
    const { body } = checkReadOnlySql(input.sql);
    const started = now();
    try {
      const { columns, rows } = await withReadOnly({ timeoutMs }, async (db) => {
        const names = (await sql.raw<{ name: string }>(namesQuery(body)).execute(db)).rows.map((r) => r.name);
        const keys = aliases(names.length);
        let types: string[] = [];
        if (names.length > 0) {
          const t = await sql.raw<Record<string, string>>(typesQuery(body, names.length)).execute(db);
          types = keys.map((k) => t.rows[0]?.[k] ?? 'unknown');
        }
        const data = await sql.raw<Record<string, unknown>>(rowsQuery(body, names.length, maxRows + 1)).execute(db);
        return {
          columns: names.map((name, i) => ({ name, type: types[i] ?? 'unknown' })),
          rows: data.rows.map((o) => keys.map((k) => o[k])),
        };
      });
      const truncated = rows.length > maxRows;
      return {
        columns,
        rows: truncated ? rows.slice(0, maxRows) : rows,
        truncated,
        ms: Math.round(now() - started),
      };
    } catch (e) {
      throw toSqlError(e, timeoutMs);
    }
  }

  async function runEvidenceQuery(projectId: string, query: string): Promise<string> {
    try {
      return summarizeResult(await run(projectId, { sql: query }));
    } catch (e) {
      if (isSqlError(e)) return truncateBytes(`Query failed (${e.code}): ${e.message}`, SUMMARY_MAX_BYTES);
      throw e;
    }
  }

  return { run, runEvidenceQuery };
}

/** Builder for services.alfred.ts: `{ ...buildSqlServices(deps) }` adds `services.sql`. */
export function buildSqlServices(_deps: AppDeps): { sql: SqlService } {
  return { sql: createSqlService() };
}

type PgError = { code: string; message: string; hint?: string };

function isPgError(e: unknown): e is PgError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((e as { code: string }).code) &&
    typeof (e as { message?: unknown }).message === 'string'
  );
}

/** Postgres errors from the user's query become SQL_* ApiErrors; anything else (connection lost…) is returned as is. */
export function toSqlError(e: unknown, timeoutMs: number): unknown {
  if (isSqlError(e) || !isPgError(e)) return e;
  switch (e.code) {
    case '57014': // query_canceled (statement_timeout)
      return sqlTimeout(timeoutMs);
    case '42501': // insufficient_privilege
    case '25006': // read_only_sql_transaction
      return sqlRejected(
        'The query tried to change something or to read outside the logic, ont and data schemas.',
        'Only read from logic.*, ont.* and data.* tables and views.',
      );
    default:
      return sqlError(
        `Postgres could not run the query: ${e.message}.`,
        e.hint ?? 'Check the table and column names (data.*, ont.*, logic.*) and the SQL syntax.',
      );
  }
}

// ---------- text summary for Evidence `result` ----------

const CELL_MAX = 80;

function cell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = 'NULL';
  else if (v instanceof Date) s = Number.isNaN(v.getTime()) ? String(v) : v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  s = s.replace(/\s+/g, ' ');
  return s.length > CELL_MAX ? `${s.slice(0, CELL_MAX - 1)}…` : s;
}

function bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function truncateBytes(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let out = s.slice(0, max);
  while (bytes(`${out}…`) > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** A short plain-text table of a result, at most `maxBytes` bytes (UTF-8): header, column names, rows, footer. */
export function summarizeResult(r: SqlResponse, maxBytes = SUMMARY_MAX_BYTES): string {
  const n = r.rows.length;
  const count = r.truncated ? `more than ${n} rows (first ${n} fetched)` : `${n} row${n === 1 ? '' : 's'}`;
  const header = `${count}; columns: ${r.columns.map((c) => `${c.name} (${c.type})`).join(', ')}`;
  const lines = [header, r.columns.map((c) => c.name).join(' | ')];
  let used = bytes(lines.join('\n'));
  if (used > maxBytes) return truncateBytes(header, maxBytes);

  const reserve = 80; // room for the footer line
  let shown = 0;
  for (const row of r.rows) {
    const line = row.map(cell).join(' | ');
    if (used + 1 + bytes(line) > maxBytes - reserve) break;
    lines.push(line);
    used += 1 + bytes(line);
    shown++;
  }
  const hidden = n - shown;
  if (hidden > 0) lines.push(`… ${hidden} of ${n} rows not shown${r.truncated ? ', and more exist' : ''}`);
  else if (r.truncated) lines.push('… more rows exist');
  return truncateBytes(lines.join('\n'), maxBytes);
}
