import { z } from 'zod';
import { objectRefSchema } from '../../modules/actions/schemas.js';
import { asToolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

// Recent action runs: who, when, what changed on which objects, status.
export const getActionLogTool = defineTool({
  name: 'get_action_log',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    limit: z.number().int().min(1).max(50).default(20),
    action: z.string().min(1).optional(),
    object: objectRefSchema.optional(),
  }),
  run: (input, ctx) =>
    asToolResult(async () => {
      await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, 'read');
      const entries = await ctx.services.actions.listActionLog(ctx.projectId, {
        limit: input.limit,
        action: input.action,
        object: input.object,
      });
      const applied = entries.filter((e) => e.status === 'applied').length;
      return {
        ok: true,
        summary: `${entries.length} action run(s), ${applied} applied.`,
        result: entries,
      };
    }),
});
