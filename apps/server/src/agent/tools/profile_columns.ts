import { z } from 'zod';
import { matchAgainstSchema } from '../../modules/datasets/schemas.js';
import { toolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const profileColumns = defineTool({
  name: 'profile_columns',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    datasetId: z.string().min(1).describe('Dataset id or exact name'),
    columns: z.array(z.string().min(1)).min(1).max(50),
    matchAgainst: matchAgainstSchema
      .optional()
      .describe('Count how many rows of this dataset find their key (one or several columns) in another dataset'),
  }),
  run: (input, ctx) =>
    toolResult(async () => {
      const svc = ctx.services.datasets;
      const ds = await svc.resolveDataset(ctx.projectId, ctx.user.id, input.datasetId);

      let match;
      if (input.matchAgainst) {
        const target = await svc.resolveDataset(ctx.projectId, ctx.user.id, input.matchAgainst.datasetId);
        match = await svc.matchRate(ds, target, input.matchAgainst.keys);
      }
      const matchLine = match ? `; ${(match.rate * 100).toFixed(1)} % of ${match.nonNull} keys match` : '';

      const all = await svc.profile(ds, {});
      if (all.status !== 'done') {
        return {
          summary: `The profile of ${ds.name} is still ${all.status}${matchLine}`,
          result: { status: all.status, ...(match ? { matchRate: match } : {}) },
        };
      }
      const profiles = [];
      for (const column of input.columns) {
        const one = await svc.profile(ds, { column });
        profiles.push(...(one.profiles ?? []));
      }
      return {
        summary: `Profiled ${profiles.length} columns of ${ds.name}${matchLine}`,
        result: { status: 'done', profiles, ...(match ? { matchRate: match } : {}) },
      };
    }),
});
