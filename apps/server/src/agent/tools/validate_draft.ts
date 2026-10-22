import { z } from 'zod';
import { asTool, countLine } from './part-a-helpers.js';
import { defineTool, rationaleSchema } from './types.js';

export const validateDraft = defineTool({
  name: 'validate_draft',
  modes: ['build'],
  risk: 'draft',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    asTool(ctx, 'write', async () => {
      const validation = await ctx.services.workspace.validateDraft(ctx.projectId);
      const verdict = validation.errors.length ? 'not publishable yet' : 'publishable';
      return { summary: `Draft is ${verdict}: ${countLine(validation)}`, result: validation };
    }),
});
