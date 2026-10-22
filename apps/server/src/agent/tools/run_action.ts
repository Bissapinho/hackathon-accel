import { z } from 'zod';
import { toObjectRef } from '../../modules/actions/evaluate.js';
import { runToolResult } from './action-support.js';
import { asToolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

// Runs a PUBLISHED action on real objects. Gated: the loop asks the user first, showing summarize().
export const runActionTool = defineTool({
  name: 'run_action',
  modes: ['explore', 'build'],
  risk: 'gated',
  input: z.object({
    rationale: rationaleSchema,
    action: z.string().min(1),
    params: z.record(z.unknown()).default({}),
  }),
  run: (input, ctx) =>
    asToolResult(async () => {
      await ctx.services.resources.requireAccess(ctx.projectId, ctx.user.id, 'write');
      const res = await ctx.services.actions.runAction({
        projectId: ctx.projectId,
        user: ctx.user,
        apiName: input.action,
        request: { params: input.params },
        via: 'agent',
        agentSessionId: ctx.sessionId,
      });
      return runToolResult(res, input.action);
    }),
  // "Run '{action.displayName}' on {objects}" (tools/catalog.json approvalSummary).
  async summarize(input, ctx) {
    try {
      const { action, doc } = await ctx.services.actions.getPublishedAction(ctx.projectId, input.action);
      const parts: string[] = [];
      for (const p of action.parameters) {
        const raw = input.params[p.id];
        if (raw === undefined || raw === null || raw === '') continue;
        if (p.kind === 'object') {
          const ref = toObjectRef(p, raw);
          const typeName = doc.objectTypes.find((t) => t.apiName === p.objectType)?.displayName ?? p.objectType;
          parts.push(`${typeName} ${ref?.primaryKey ?? JSON.stringify(raw)}`);
        } else {
          parts.push(`${p.displayName}: ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`);
        }
      }
      return `Run '${action.displayName}' on ${parts.length ? parts.join(', ') : 'no object'}`;
    } catch {
      return `Run the action '${input.action}'`;
    }
  },
});
