import { z } from 'zod';
import { draftOpSchema } from '../../modules/workspace/schemas.js';
import { runTool, countLine } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const editDraft = defineTool({
  name: 'edit_draft',
  modes: ['build'],
  risk: 'draft',
  input: z.object({
    rationale: rationaleSchema,
    expectedRevision: z.number().int().min(0),
    ops: z.array(draftOpSchema).min(1).max(200),
  }),
  run: (input, ctx) =>
    runTool(ctx, 'write', async () => {
      const out = await ctx.services.workspace.patchDraft(ctx.projectId, ctx.user.id, input.expectedRevision, input.ops);
      return {
        summary: `Applied ${input.ops.length} change(s) to the draft, now revision ${out.revision}: ${countLine(out.validation)}`,
        result: out,
      };
    }),
});
