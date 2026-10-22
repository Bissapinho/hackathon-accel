import { z } from 'zod';
import { defineTool, rationaleSchema } from './types.js';

// Owner: Alfred (09 §5). Records the plan in plain language; the UI shows it from the tool_call item's
// args (plan card + stage stepper).

export const planStepSchema = z.object({
  text: z.string().min(1).max(200),
  status: z.enum(['todo', 'doing', 'done', 'skipped']),
  stage: z.enum(['ingest', 'semantics', 'ontology', 'logic']),
});

export const setPlanInput = z.object({
  steps: z.array(planStepSchema).min(1).max(20),
  rationale: rationaleSchema,
});

export const setPlanTool = defineTool({
  name: 'set_plan',
  modes: ['router', 'explore', 'semantics', 'build'],
  risk: 'meta',
  input: setPlanInput,
  async run({ steps }) {
    const done = steps.filter((s) => s.status === 'done').length;
    return { ok: true, summary: `Plan saved: ${steps.length} steps, ${done} done.`, result: { steps } };
  },
});
