import { ApiError } from '../../errors.js';
import type { Access } from '../../modules/resources/service.js';
import type { ToolContext, ToolResult } from './types.js';

// Shared by Part A tools: run a service call as the session's user and turn errors into tool results
// (tool errors are returned, never thrown: 05-agent §3).
export async function asTool(
  ctx: ToolContext,
  access: Access,
  fn: () => Promise<{ summary: string; result: unknown }>,
): Promise<ToolResult> {
  try {
    await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, access);
    const { summary, result } = await fn();
    return { ok: true, summary, result };
  } catch (err) {
    if (err instanceof ApiError) {
      const hint = err.extra.hint ?? err.extra.details?.map((d) => `${d.path}: ${d.message}`).join('; ');
      return { ok: false, code: err.code, message: err.message, ...(hint ? { hint } : {}) };
    }
    return { ok: false, code: 'INTERNAL', message: `The server failed while running this tool: ${(err as Error).message}` };
  }
}

export function countLine(v: { errors: unknown[]; warnings: unknown[] }): string {
  if (v.errors.length === 0 && v.warnings.length === 0) return 'no problems';
  return `${v.errors.length} error(s), ${v.warnings.length} warning(s)`;
}
