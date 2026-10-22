import { uniqueQuestionIds, workloadObjectSchema } from '../../modules/semantics/schemas.js';
import { plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

export const setWorkload = defineTool({
  name: 'set_workload',
  modes: ['semantics'],
  risk: 'bankDraft',
  input: workloadObjectSchema.extend({ rationale: rationaleSchema }).superRefine(uniqueQuestionIds),
  run: ({ rationale: _r, ...workload }, ctx) =>
    runSemTool(ctx, 'write', async () => {
      const saved = await ctx.services.semantics.setWorkload(ctx.projectId, workload);
      const picked = saved.questions.filter((q) => q.picked).length;
      return {
        summary: `Saved the goal and ${plural(saved.questions.length, 'question')} (${picked} picked).`,
        result: saved,
      };
    }),
});
