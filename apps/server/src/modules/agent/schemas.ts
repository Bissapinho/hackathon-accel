import type { AgentItemView, AgentMode, AgentStatus } from '@mini/shared';
import { z } from 'zod';
import { uuidSchema } from '../resources/schemas.js';

// Agent routes (04-api §1 "Agent"): params and bodies.

export const sessionParamsSchema = z.object({ sid: uuidSchema });
export const projectSessionParamsSchema = z.object({ pid: uuidSchema });
export const approvalParamsSchema = z.object({ sid: uuidSchema, aid: uuidSchema });
export const answerParamsSchema = z.object({ sid: uuidSchema, qid: uuidSchema });

export const createSessionBodySchema = z.object({ title: z.string().trim().min(1).max(120).optional() }).default({});
export const messageBodySchema = z.object({ text: z.string().trim().min(1).max(20_000) });
export const decisionBodySchema = z.object({
  decision: z.enum(['allow', 'reject']),
  /** Fields that replace the call's arguments (validated again with the tool's schema). */
  editedArgs: z.record(z.unknown()).optional(),
  note: z.string().max(2000).optional(),
});
export const answerBodySchema = z.object({
  answers: z.record(z.union([z.string().max(5000), z.array(z.string().max(5000)).max(50)])),
});
export const eventsQuerySchema = z.object({ after: z.coerce.number().int().min(0).optional() });

export type DecisionBody = z.infer<typeof decisionBodySchema>;

/**
 * A session as the API returns it. Not in packages/shared yet (no session DTO there): candidate to move via
 * 09 §6.2 together with the front team.
 */
export type AgentSessionView = {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  mode: AgentMode;
  status: AgentStatus;
  /** What the session waits for, when paused. */
  waitingFor: { kind: 'approval'; approvalId: string } | { kind: 'question'; questionId: string } | null;
  tokenEstimate: number;
  tokenBudget: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentSessionWithItems = { session: AgentSessionView; items: AgentItemView[] };
