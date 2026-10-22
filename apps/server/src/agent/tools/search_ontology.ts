import { z } from 'zod';
import { searchOntology } from '../../modules/workspace/service.js';
import { asTool } from './part-a-helpers.js';
import { defineTool, rationaleSchema } from './types.js';

export const searchOntologyTool = defineTool({
  name: 'search_ontology',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    queries: z.array(z.string().min(1)).min(1).max(5),
    kinds: z.array(z.enum(['objectType', 'property', 'linkType', 'logic', 'actionType'])).optional(),
    which: z.enum(['published', 'draft']),
  }),
  run: (input, ctx) =>
    asTool(ctx, 'read', async () => {
      const doc = await ctx.services.workspace.readDoc(ctx.projectId, input.which);
      const hits = searchOntology(doc, input.queries, input.kinds);
      const summary = hits.length
        ? `${hits.length} match(es), best: ${hits.slice(0, 3).map((h) => (h.objectType && h.kind !== 'objectType' ? `${h.objectType}.${h.apiName}` : h.apiName)).join(', ')}`
        : `Nothing in the ${input.which} workspace matches ${input.queries.join(' / ')}`;
      return { summary, result: hits };
    }),
});
