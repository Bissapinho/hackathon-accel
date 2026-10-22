import { z } from 'zod';

// Route and tool inputs for pipelines. The PipelineDef itself is validated by the compiler
// (TODO(merge with T-11): the workspace document's zod schema lives in modules/workspace/schemas.ts).

export const previewOptionsSchema = z.object({
  node: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const previewParamsSchema = z.object({ pid: z.string().uuid(), apiName: z.string().min(1) });

export const buildsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });
