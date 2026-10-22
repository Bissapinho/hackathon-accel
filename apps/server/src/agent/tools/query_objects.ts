import { z } from 'zod';
import { queryObjectsRequestSchema } from '../../modules/objects/schemas.js';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

const MAX_TOOL_PAGE = 50; // catalog: max 50 per call

export const queryObjects = defineTool({
  name: 'query_objects',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: queryObjectsRequestSchema.extend({
    pageSize: z.number().int().min(1).max(MAX_TOOL_PAGE).optional(),
    rationale: rationaleSchema,
  }),
  run: ({ rationale: _r, ...req }, ctx) =>
    runTool(ctx, 'read', async () => {
      const res = await ctx.services.objects.query(ctx.projectId, { ...req, pageSize: req.pageSize ?? 20 });
      const type = res.rows[0]?.ref.objectType ?? 'objects';
      const summary = `${res.total} ${type} found, showing ${res.rows.length}${res.nextPageToken ? ' (more with nextPageToken)' : ''}.`;
      return { summary, result: { ...res, truncated: Boolean(res.nextPageToken) } };
    }),
});
