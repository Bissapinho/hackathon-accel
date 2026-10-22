import type { ActionRunResponse, FieldError } from '@mini/shared';
import { z } from 'zod';

// Request bodies and params of the actions routes (04-api §1 Actions). The ActionTypeDef document itself
// is validated by the workspace module (T-13); here we only read it from published / draft documents.

export const objectRefSchema = z.object({ objectType: z.string().min(1), primaryKey: z.string().min(1) });

export const actionRunRequestSchema = z.object({
  params: z.record(z.unknown()).default({}),
  dryRun: z.boolean().optional(),
});

export const actionRunParamsSchema = z.object({
  pid: z.string().uuid(),
  apiName: z.string().min(1).max(100),
});

export const actionLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().min(1).optional(),
  objectType: z.string().min(1).optional(),
  primaryKey: z.string().min(1).optional(),
});

export type ActionRunStatus = ActionRunResponse['status'];
export type ActionEdit = ActionRunResponse['edits'][number];

// One row of the action log (GET /api/projects/:pid/actions/log). Not in packages/shared yet.
export type ActionLogEntry = {
  runId: string;
  action: string;
  params: Record<string, unknown>;
  dryRun: boolean;
  status: ActionRunStatus;
  errors: FieldError[];
  edits: ActionEdit[];
  runBy: { id: string; displayName: string };
  via: 'ui' | 'agent' | 'automation';
  agentSessionId: string | null;
  workspaceVersion: number; // 0 = test of the draft definition
  createdAt: string;
};
