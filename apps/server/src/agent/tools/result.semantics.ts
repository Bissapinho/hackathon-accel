import type { FieldError, Validation } from '@mini/shared';
import { ZodError } from 'zod';
import { ApiError, zodDetails } from '../../errors.js';
import type { ToolContext, ToolResult } from './types.js';

// Shared by Part B's semantics and SQL tools: check the user's project access, run the service call,
// and return errors instead of throwing them (05-agent §3, CLAUDE.md rule 11).

/** Field errors listed in a tool error message (the ToolResult error shape has no `details`). */
const MAX_DETAILS = 10;

export function fieldLines(details: FieldError[], max = MAX_DETAILS): string {
  const shown = details.slice(0, max).map((d) => `- ${d.path} [${d.code}]: ${d.message}`);
  if (details.length > max) shown.push(`- … and ${details.length - max} more`);
  return shown.join('\n');
}

export function toToolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    const details = err.extra.details?.length ? `\n${fieldLines(err.extra.details)}` : '';
    return { ok: false, code: err.code, message: `${err.message}${details}`, ...(err.extra.hint ? { hint: err.extra.hint } : {}) };
  }
  if (err instanceof ZodError) {
    return { ok: false, code: 'BAD_ARGUMENTS', message: `Some arguments are invalid.\n${fieldLines(zodDetails(err))}` };
  }
  return { ok: false, code: 'INTERNAL', message: `Unexpected error: ${(err as Error).message}` };
}

export async function runSemTool(
  ctx: ToolContext,
  access: 'read' | 'write',
  fn: () => Promise<{ summary: string; result: unknown }>,
): Promise<ToolResult> {
  try {
    await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, access);
    const { summary, result } = await fn();
    return { ok: true, summary, result };
  } catch (err) {
    return toToolError(err);
  }
}

/** Plural helper for summaries: plural(3, 'error') → "3 errors". */
export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;

/** Cuts a long text for a compact tool result. */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const MAX_LISTED = 15;

/** Compact validation for tool results: totals and the first field errors. */
export function compactValidation(v: Validation) {
  return {
    errorCount: v.errors.length,
    warningCount: v.warnings.length,
    errors: v.errors.slice(0, MAX_LISTED),
    warnings: v.warnings.slice(0, MAX_LISTED),
    truncated: v.errors.length > MAX_LISTED || v.warnings.length > MAX_LISTED,
  };
}

export function validationSummary(v: Validation): string {
  if (!v.errors.length && !v.warnings.length) return 'No problems found.';
  const head = `${plural(v.errors.length, 'error')}, ${plural(v.warnings.length, 'warning')}`;
  return v.errors.length ? `${head}. To fix:\n${fieldLines(v.errors, 5)}` : `${head}.`;
}
