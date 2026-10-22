import { z } from 'zod';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const diffDraft = defineTool({
  name: 'diff_draft',
  modes: ['build'],
  risk: 'draft',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    runTool(ctx, 'read', async () => {
      const diff = await ctx.services.workspace.diffDraft(ctx.projectId);
      const summary = `Publishing would add ${diff.added.length}, change ${diff.changed.length} and remove ${diff.removed.length} item(s)`;
      return { summary, result: diff };
    }),
});
