import type { ActionRunResponse } from '@mini/shared';
import { ApiError } from '../../errors.js';
import type { ToolResult } from './types.js';

// Shared by the action tools: tool errors are returned, never thrown (05-agent §3).
export async function asToolResult(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message, ...(err.extra.hint ? { hint: err.extra.hint } : {}) };
    }
    throw err;
  }
}

// A refused run is a normal result for the agent (it explains why); only a crash is a tool error.
export function runToolResult(res: ActionRunResponse, label: string): ToolResult {
  if (res.status === 'failed') {
    return { ok: false, code: 'ACTION_FAILED', message: res.message, hint: res.errors[0]?.message };
  }
  const changes = res.edits.map((e) => `${e.op} ${e.ref.objectType} ${e.ref.primaryKey}`).join('; ');
  const summary =
    res.status === 'rejected'
      ? `${label}: refused — ${res.message}`
      : `${label}: ${res.status}${changes ? ` (${changes})` : ''}. ${res.message}`.trim();
  return { ok: true, summary, result: res };
}
