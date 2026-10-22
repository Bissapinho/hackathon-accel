import { z } from 'zod';
import { plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// TODO(T-09): move to modules/semantics/schemas.ts (the same body as the workload route).
export const workloadQuestionSchema = z.object({
  id: z.string().trim().min(1).max(40).describe('Short stable id, e.g. "Q01"'),
  text: z.string().trim().min(1).max(300).describe("The question in the user's words"),
  useCase: z.string().trim().max(200).optional(),
  source: z.enum(['proposed', 'user']).describe("'proposed' by you, or written by the 'user'"),
  picked: z.boolean().describe('Ticked by the user'),
});

export const workloadSchema = z.object({
  goal: z.string().trim().min(1).max(500).describe("The user's goal in one sentence"),
  questions: z
    .array(workloadQuestionSchema)
    .max(20)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: 'Question ids must be unique.' }),
});

export const setWorkload = defineTool({
  name: 'set_workload',
  modes: ['semantics'],
  risk: 'bankDraft',
  input: workloadSchema.extend({ rationale: rationaleSchema }),
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
