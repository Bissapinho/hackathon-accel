import { z } from 'zod';
import { MAX_BROWSE_ITEMS } from '../../modules/semantics/engine/index.js';
import { versionRefSchema } from '../../modules/semantics/schemas.js';
import { runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

export const browseSemantics = defineTool({
  name: 'browse_semantics',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    query: z.string().trim().min(1).max(200).describe('A few words in the user\'s language, e.g. "taux de retour"'),
    kind: z
      .enum(['term', 'mapping', 'relation', 'constraint', 'all'])
      .optional()
      .describe("Which records to search; default 'term'. 'all' also searches mappings, relations and rules"),
    limit: z.number().int().min(1).max(MAX_BROWSE_ITEMS).optional().describe(`At most ${MAX_BROWSE_ITEMS}`),
    version: versionRefSchema.optional().describe("Default 'active'; 'draft' while building the bank"),
  }),
  run: ({ query, kind, limit, version }, ctx) =>
    runSemTool(ctx, 'read', async () => {
      const ref = version ?? 'active';
      const items = await ctx.services.semantics.browse(ctx.projectId, { query, kind, limit: limit ?? MAX_BROWSE_ITEMS, version: ref });
      const empty = !items.length && ref === 'active' && !(await ctx.services.semantics.activeVersion(ctx.projectId));
      const summary = items.length
        ? `${items.length} match${items.length === 1 ? '' : 'es'} for "${query}": ${items.map((i) => `${i.name || i.id} (${i.kind})`).join(', ')}.`
        : empty
          ? `No published meaning yet, so nothing matches "${query}". Search the draft with version: 'draft'.`
          : `Nothing in the ${ref} bank matches "${query}". Try other words or a synonym.`;
      return { summary, result: { version: ref, items } };
    }),
});
