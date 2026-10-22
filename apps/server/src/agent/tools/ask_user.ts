import { z } from 'zod';
import { defineTool, rationaleSchema } from './types.js';

// Owner: Alfred (09 §5). Asks the user 1-3 questions with choices. The loop pauses the session on this call
// (awaiting_answer) and sends the answers back as its tool result (05-agent §1); `run` is only reached if
// a caller runs the tool outside the loop.

export const clarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(500),
  choices: z.array(z.string().min(1).max(300)).min(1).max(15).optional(),
  multiple: z.boolean().optional(),
  allowFreeText: z.boolean().default(true),
});

export const askUserInput = z.object({
  questions: z.array(clarifyingQuestionSchema).min(1).max(3)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: 'Question ids must be unique.' }),
  rationale: rationaleSchema,
});

export const askUserTool = defineTool({
  name: 'ask_user',
  modes: ['router', 'explore', 'semantics', 'build'],
  risk: 'meta',
  input: askUserInput,
  async run({ questions }) {
    return { ok: true, summary: `Asked the user ${questions.length} question(s).`, result: { questions } };
  },
});
