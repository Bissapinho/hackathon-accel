import { z } from 'zod';
import { runTool } from './result.alexandre.js';
import { defineTool, rationaleSchema } from './types.js';

export const getObject = defineTool({
  name: 'get_object',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({ objectType: z.string().min(1), primaryKey: z.string(), rationale: rationaleSchema }),
  run: ({ objectType, primaryKey }, ctx) =>
    runTool(ctx, 'read', async () => {
      const obj = await ctx.services.objects.getObject(ctx.projectId, objectType, primaryKey);
      const links = obj.links.map((l) => `${l.displayName}: ${l.rows.length}${l.truncated ? '+' : ''}`).join(', ');
      return { summary: `${objectType} ${obj.title}${links ? ` — ${links}` : ''}.`, result: obj };
    }),
});
