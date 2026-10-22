import type { ActionRunResponse } from '@mini/shared';
import type { ToolResult } from './types.js';

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
