import { z } from 'zod';

// LogicTestRequest (types/shared.ts), POST /api/projects/:pid/workspace/draft/logic/test.
export const logicTestRequestSchema = z.object({
  objectType: z.string().min(1),
  apiNames: z.array(z.string().min(1)).min(1).max(20),
  primaryKeys: z.array(z.string()).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export type LogicTestRequestInput = z.infer<typeof logicTestRequestSchema>;
