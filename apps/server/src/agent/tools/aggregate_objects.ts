import { aggregateRequestSchema } from '../../modules/objects/schemas.js';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

const MAX_TOOL_GROUPS = 100;

export const aggregateObjects = defineTool({
  name: 'aggregate_objects',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: aggregateRequestSchema.extend({ rationale: rationaleSchema }),
  run: ({ rationale: _r, ...req }, ctx) =>
    runTool(ctx, 'read', async () => {
      const res = await ctx.services.objects.aggregate(ctx.projectId, req);
      const groups = res.groups.slice(0, MAX_TOOL_GROUPS);
      const truncated = res.groups.length > MAX_TOOL_GROUPS;
      const summary = req.groupBy?.length
        ? `${res.groups.length} groups${truncated ? `, showing ${MAX_TOOL_GROUPS}` : ''}.`
        : `Result: ${groups[0]?.values.join(', ') ?? 'no value'}.`;
      return { summary, result: { groups, total: res.groups.length, truncated } };
    }),
});
