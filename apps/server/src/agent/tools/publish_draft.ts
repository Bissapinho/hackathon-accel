import { z } from 'zod';
import { asTool } from './part-a-helpers.js';
import { defineTool, rationaleSchema } from './types.js';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Publishes the workspace draft. Gated: the loop asks the user first, showing summarize().
export const publishDraftTool = defineTool({
  name: 'publish_draft',
  modes: ['build'],
  risk: 'gated',
  input: z.object({
    rationale: rationaleSchema,
    expectedRevision: z.number().int().min(0),
    message: z.string().min(1).max(500),
  }),
  run: (input, ctx) =>
    asTool(ctx, 'write', async () => {
      const res = await ctx.services.publish.publish({
        projectId: ctx.projectId,
        userId: ctx.user.id,
        via: 'agent',
        expectedRevision: input.expectedRevision,
        message: input.message,
      });
      const built = res.builds.filter((b) => b.status === 'built').length;
      const upToDate = res.builds.filter((b) => b.status === 'upToDate').length;
      return {
        summary: `Published version ${res.version}: ${plural(built, 'table')} built, ${upToDate} already up to date`,
        result: res,
      };
    }),
  // "Publish: {diff.summary}" (tools/catalog.json approvalSummary).
  async summarize(_input, ctx) {
    try {
      const d = (await ctx.services.workspace.getDraft(ctx.projectId)).doc;
      const diff = await ctx.services.workspace.diffDraft(ctx.projectId);
      const changes = diff.added.length + diff.changed.length + diff.removed.length;
      return (
        `Publish ${plural(d.pipelines.length, 'pipeline')}, ${plural(d.objectTypes.length, 'object type')}, ` +
        `${plural(d.linkTypes.length, 'link')}, ${plural(d.logic.length, 'logic item')} and ${plural(d.actionTypes.length, 'action')}` +
        (changes ? ` (${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed)` : ' (no changes)')
      );
    } catch {
      return 'Publish the workspace draft';
    }
  },
});
