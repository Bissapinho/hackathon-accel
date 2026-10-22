import { z } from 'zod';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

// Recent firings of an automation and what its effects did.
export const getAutomationEventsTool = defineTool({
  name: 'get_automation_events',
  modes: ['explore', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    automationId: z.string().min(1),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  run: (i, ctx) =>
    runTool(ctx, 'read', async () => {
      const events = await ctx.services.automations.events(ctx.projectId, i.automationId, i.limit);
      return {
        summary: events.length === 0 ? 'It has not fired yet.' : `${events.length} recent firing(s); the last one on ${events[0]!.firedAt}.`,
        result: events,
      };
    }),
});
