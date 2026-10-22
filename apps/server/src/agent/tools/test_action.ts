import { z } from 'zod';
import { asToolResult, runToolResult } from './action-support.js';
import { defineTool, rationaleSchema } from './types.js';

// Dry-run of the DRAFT definition of an action against current objects; nothing is written.
export const testActionTool = defineTool({
  name: 'test_action',
  modes: ['build'],
  risk: 'draft',
  input: z.object({
    rationale: rationaleSchema,
    action: z.string().min(1),
    params: z.record(z.unknown()).default({}),
  }),
  run: (input, ctx) =>
    asToolResult(async () => {
      await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, 'write');
      const res = await ctx.services.actions.testDraftAction({
        projectId: ctx.projectId,
        user: ctx.user,
        apiName: input.action,
        request: { params: input.params, dryRun: true },
        via: 'agent',
        agentSessionId: ctx.sessionId,
      });
      return runToolResult(res, `Test of ${input.action}`);
    }),
});
