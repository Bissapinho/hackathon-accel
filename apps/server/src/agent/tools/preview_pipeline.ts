import { z } from 'zod';
import { ApiError } from '../../errors.js';
import { defineTool, rationaleSchema, type ToolResult } from './types.js';

// Errors are returned, never thrown (05-agent §3).
function toToolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    const details = err.extra.details?.map((d) => `${d.path}: ${d.message}`).join('\n');
    return {
      ok: false,
      code: err.code,
      message: details ? `${err.message}\n${details}` : err.message,
      ...(err.extra.hint ? { hint: err.extra.hint } : {}),
    };
  }
  return { ok: false, code: 'INTERNAL', message: (err as Error).message };
}

export const previewPipelineTool = defineTool({
  name: 'preview_pipeline',
  modes: ['build'],
  risk: 'draft',
  input: z.object({
    rationale: rationaleSchema,
    pipeline: z.string().min(1).describe('apiName of a pipeline in the workspace draft'),
    node: z.string().min(1).optional().describe('node id to preview; default: the first output'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run(input, ctx) {
    try {
      const p = await ctx.services.pipelines.previewDraftPipeline(ctx.projectId, input.pipeline, {
        node: input.node,
        limit: input.limit,
      });
      const failed = p.checks.filter((c) => !c.ok);
      const checks = p.checks.length
        ? failed.length
          ? `${failed.length} of ${p.checks.length} checks fail`
          : `all ${p.checks.length} checks pass`
        : 'no checks';
      return { ok: true, summary: `${p.rowCount} rows; ${checks}`, result: p };
    } catch (err) {
      return toToolError(err);
    }
  },
});
