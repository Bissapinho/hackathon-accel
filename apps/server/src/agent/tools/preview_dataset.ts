import { z } from 'zod';
import { toolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const previewDataset = defineTool({
  name: 'preview_dataset',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    datasetId: z.string().min(1).describe('Dataset id or exact name'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  run: (input, ctx) =>
    toolResult(async () => {
      const ds = await ctx.services.datasets.resolveDataset(ctx.projectId, ctx.user.id, input.datasetId);
      const p = await ctx.services.datasets.preview(ds, { limit: input.limit, offset: 0 });
      return {
        summary: `First ${p.rows.length} of ${p.total} rows of ${ds.name}`,
        result: {
          columns: p.columns.map((c) => c.name),
          rows: p.rows,
          total: p.total,
          truncated: p.rows.length < p.total,
        },
      };
    }),
});
