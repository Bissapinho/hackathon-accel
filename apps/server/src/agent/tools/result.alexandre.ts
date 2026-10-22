import { ZodError } from 'zod';
import { ApiError, zodDetails } from '../../errors.js';
import type { ToolContext, ToolResult } from './types.js';

// Part A tools: check the user's project access, run the service call, and return errors instead of
// throwing them (05-agent §3).
export async function runTool(
  ctx: ToolContext,
  access: 'read' | 'write',
  fn: () => Promise<{ summary: string; result: unknown }>,
): Promise<ToolResult> {
  try {
    await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, access);
    const { summary, result } = await fn();
    return { ok: true, summary, result };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message, ...(err.extra.hint ? { hint: err.extra.hint } : {}) };
    }
    if (err instanceof ZodError) {
      const first = zodDetails(err)[0];
      return { ok: false, code: 'BAD_ARGUMENTS', message: first ? `${first.path}: ${first.message}` : 'Invalid arguments.' };
    }
    return { ok: false, code: 'INTERNAL', message: `Unexpected error: ${(err as Error).message}` };
  }
}
