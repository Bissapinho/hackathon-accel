import { ZodError } from 'zod';
import { ApiError, zodDetails } from '../../errors.js';
import type { Access } from '../../modules/resources/service.js';
import type { ToolContext, ToolResult } from './types.js';

// The one place where Part A tools turn errors into tool results: tools return errors, never throw (05-agent §3).
export function toToolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    const details = err.extra.details?.map((d) => `${d.path}: ${d.message}`).join('\n');
    const hint = err.extra.hint;
    return {
      ok: false,
      code: err.code,
      message: details ? `${err.message}\n${details}` : err.message,
      ...(hint ? { hint } : {}),
    };
  }
  if (err instanceof ZodError) {
    const fields = zodDetails(err).map((d) => `${d.path}: ${d.message}`).join('; ');
    return { ok: false, code: 'BAD_ARGUMENTS', message: `Some arguments are invalid: ${fields}.` };
  }
  return { ok: false, code: 'INTERNAL', message: `The tool failed: ${(err as Error).message}` };
}

// Runs a tool body and returns its summary and result, or the error as a tool result.
export async function toolResult(fn: () => Promise<{ summary: string; result: unknown }>): Promise<ToolResult> {
  try {
    const { summary, result } = await fn();
    return { ok: true, summary, result };
  } catch (err) {
    return toToolError(err);
  }
}

// Same, after checking the session user's access to the project.
export async function runTool(
  ctx: ToolContext,
  access: Access,
  fn: () => Promise<{ summary: string; result: unknown }>,
): Promise<ToolResult> {
  return toolResult(async () => {
    await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, access);
    return fn();
  });
}

// For bodies that build their own ToolResult (action tools): only errors are converted.
export async function asToolResult(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return toToolError(err);
  }
}

export function countLine(v: { errors: unknown[]; warnings: unknown[] }): string {
  if (v.errors.length === 0 && v.warnings.length === 0) return 'no problems';
  return `${v.errors.length} error(s), ${v.warnings.length} warning(s)`;
}
