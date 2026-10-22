import { z } from 'zod';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

const input = z.object({ rationale: rationaleSchema, automationId: z.string().min(1) });

async function alertName(automationId: string, projectId: string, get: (p: string, id: string) => Promise<{ def: { name: string } }>) {
  try {
    return (await get(projectId, automationId)).def.name;
  } catch {
    return automationId;
  }
}

// Switches on a PUBLISHED automation. Gated: leaving the draft starts background behavior.
export const enableAutomationTool = defineTool({
  name: 'enable_automation',
  modes: ['build'],
  risk: 'gated',
  input,
  run: (i, ctx) =>
    runTool(ctx, 'write', async () => {
      const state = await ctx.services.automations.enable(ctx.projectId, i.automationId, ctx.user);
      const view = await ctx.services.automations.get(ctx.projectId, i.automationId);
      return {
        summary: `"${view.def.name}" is on. Only objects that enter its set from now on will fire it.`,
        result: state,
      };
    }),
  // "Switch on the alert '{automation.name}'" (tools/catalog.json approvalSummary).
  async summarize(i, ctx) {
    return `Switch on the alert '${await alertName(i.automationId, ctx.projectId, ctx.services.automations.get)}'`;
  },
});

export { alertName };
