import { z } from 'zod';
import { toolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

export const listDatasets = defineTool({
  name: 'list_datasets',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    toolResult(async () => {
      const list = await ctx.services.datasets.listDatasets(ctx.projectId, ctx.user.id);
      const datasets = list.map((d) => ({
        id: d.id,
        name: d.name,
        simulated: d.simulated,
        currentVersion: d.currentVersion,
        rowCount: d.current?.rowCount ?? 0,
        columnCount: d.current?.columnCount ?? 0,
        profileStatus: d.current?.profileStatus ?? null,
      }));
      const simulated = datasets.filter((d) => d.simulated).length;
      return {
        summary: `${datasets.length} datasets${simulated ? ` (${simulated} simulated)` : ''}`,
        result: { total: datasets.length, truncated: false, datasets },
      };
    }),
});
