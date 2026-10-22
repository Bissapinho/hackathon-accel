import { z } from 'zod';
import { alertName } from './enable_automation.js';
import { runTool } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

const input = z.object({ rationale: rationaleSchema, automationId: z.string().min(1) });

// Switches off an automation. Gated, like enabling it.
export const disableAutomationTool = defineTool({
  name: 'disable_automation',
  modes: ['build'],
  risk: 'gated',
  input,
  run: (i, ctx) =>
    runTool(ctx, 'write', async () => {
      const state = await ctx.services.automations.disable(ctx.projectId, i.automationId);
      const view = await ctx.services.automations.get(ctx.projectId, i.automationId);
      return { summary: `"${view.def.name}" is off.`, result: state };
    }),
  // "Switch off the alert '{automation.name}'" (tools/catalog.json approvalSummary).
  async summarize(i, ctx) {
    return `Switch off the alert '${await alertName(i.automationId, ctx.projectId, ctx.services.automations.get)}'`;
  },
});
