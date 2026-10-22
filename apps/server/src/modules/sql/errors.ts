import { ApiError } from '../../errors.js';

// Errors of the read-only SQL module (T-16, 09 §4.3). They are ApiErrors, so routes return them as is
// and `run_sql` turns them into `{ok: false, code, message, hint}`.

export type SqlErrorCode = 'SQL_REJECTED' | 'SQL_TIMEOUT' | 'SQL_ERROR';

const DEFAULT_REJECT_HINT = 'Send a single SELECT (or WITH … SELECT) query that only reads data.';

export function sqlRejected(message: string, hint = DEFAULT_REJECT_HINT): ApiError {
  return new ApiError(400, 'SQL_REJECTED', message, { hint });
}

export function sqlTimeout(timeoutMs: number): ApiError {
  return new ApiError(422, 'SQL_TIMEOUT', `The query took longer than ${timeoutMs / 1000} seconds and was stopped.`, {
    hint: 'Narrow it down: filter on fewer rows, aggregate, or query a logic.* / ont.* view instead of raw tables.',
  });
}

export function sqlError(message: string, hint: string): ApiError {
  return new ApiError(400, 'SQL_ERROR', message, { hint });
}

export function isSqlError(e: unknown): e is ApiError & { code: SqlErrorCode } {
  return e instanceof ApiError && (e.code === 'SQL_REJECTED' || e.code === 'SQL_TIMEOUT' || e.code === 'SQL_ERROR');
}
