import { z } from 'zod';
import { runTool, countLine } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const validateDraft = defineTool({
  name: 'validate_draft',
  modes: ['build'],
  risk: 'draft',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    runTool(ctx, 'write', async () => {
      const validation = await ctx.services.workspace.validateDraft(ctx.projectId);
      const verdict = validation.errors.length ? 'not publishable yet' : 'publishable';
      return { summary: `Draft is ${verdict}: ${countLine(validation)}`, result: validation };
    }),
});
