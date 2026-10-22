import { z } from 'zod';
import { entityKindSchema } from '../../modules/workspace/schemas.js';
import { findEntity, inventory } from '../../modules/workspace/service.js';
import { asTool } from './part-a-helpers.js';
import { defineTool, rationaleSchema } from './types.js';

export const getWorkspace = defineTool({
  name: 'get_workspace',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    which: z.enum(['published', 'draft']),
    entity: z.object({ kind: entityKindSchema, apiName: z.string().min(1), objectType: z.string().optional() }).optional(),
    inventoryOnly: z.boolean().default(false),
  }),
  run: (input, ctx) =>
    asTool(ctx, 'read', async () => {
      const ws = ctx.services.workspace;
      const draft = input.which === 'draft' ? await ws.getDraft(ctx.projectId) : null;
      const doc = draft?.doc ?? (await ws.readDoc(ctx.projectId, 'published'));
      const label = draft ? `draft (revision ${draft.revision})` : 'published workspace';

      if (input.entity) {
        const { kind, apiName, objectType } = input.entity;
        const found = findEntity(doc, kind, apiName, objectType);
        if (!found) {
          return { summary: `No ${kind} "${apiName}" in the ${label}`, result: { found: false, inventory: inventory(doc) } };
        }
        return { summary: `${kind} ${apiName} from the ${label}`, result: found };
      }
      const inv = inventory(doc);
      const summary = `${label}: ${inv.pipelines.length} pipelines, ${inv.objectTypes.length} object types, ${inv.linkTypes.length} links, ${inv.logic.length} logic items, ${inv.actionTypes.length} actions`;
      if (input.inventoryOnly) return { summary, result: { inventory: inv, validation: draft?.validation } };
      return { summary, result: { doc, validation: draft?.validation, revision: draft?.revision } };
    }),
});
