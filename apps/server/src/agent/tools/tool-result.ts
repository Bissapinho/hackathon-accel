import { ZodError } from 'zod';
import { ApiError, zodDetails } from '../../errors.js';
import type { ToolResult } from './types.js';

// Runs a tool body and turns service errors into tool errors: tools return errors, never throw (05-agent §3).
export async function toolResult(fn: () => Promise<{ summary: string; result: unknown }>): Promise<ToolResult> {
  try {
    const { summary, result } = await fn();
    return { ok: true, summary, result };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message, ...(err.extra.hint ? { hint: err.extra.hint } : {}) };
    }
    if (err instanceof ZodError) {
      const fields = zodDetails(err).map((d) => `${d.path}: ${d.message}`).join('; ');
      return { ok: false, code: 'BAD_ARGUMENTS', message: `Some arguments are invalid: ${fields}.` };
    }
    return { ok: false, code: 'INTERNAL', message: `The tool failed: ${(err as Error).message}` };
  }
}
