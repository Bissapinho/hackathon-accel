import { z } from 'zod';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const discardDraft = defineTool({
  name: 'discard_draft',
  modes: ['build'],
  risk: 'draft',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    runTool(ctx, 'write', async () => {
      const out = await ctx.services.workspace.discardDraft(ctx.projectId, ctx.user.id);
      return { summary: `Draft reset to the published version (revision ${out.revision})`, result: out };
    }),
});
