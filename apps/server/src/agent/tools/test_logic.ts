import { z } from 'zod';
import { toToolError } from './tool-result.js';
import { logicTestRequestSchema } from '../../modules/logic/schemas.js';
import { defineTool, rationaleSchema } from './types.js';

// Evaluate draft derived properties and rules on published objects (tools/catalog.json).
export const testLogicTool = defineTool({
  name: 'test_logic',
  modes: ['build'],
  risk: 'draft',
  input: logicTestRequestSchema.extend({ rationale: rationaleSchema }),
  async run(input: z.infer<typeof logicTestRequestSchema>, ctx) {
    try {
      const res = await ctx.services.logic.testDraftLogic(ctx.projectId, {
        objectType: input.objectType,
        apiNames: input.apiNames,
        primaryKeys: input.primaryKeys,
        limit: input.limit,
      });
      if (res.errors.length > 0) {
        const first = res.errors[0]!;
        return {
          ok: false,
          code: first.code,
          message: res.errors.map((e) => `${e.path}: ${e.message}`).join('\n'),
          hint: 'Fix the draft logic with edit_draft, then test again.',
        };
      }
      return {
        ok: true,
        summary: `Computed ${input.apiNames.join(', ')} for ${res.rows.length} ${input.objectType} object(s).`,
        result: res.rows,
      };
    } catch (err) {
      return toToolError(err);
    }
  },
});
