import type { AgentMode, ToolRisk } from '@mini/shared';
import { z } from 'zod';
import type { User } from '../../modules/resources/schemas.js';
import type { SemanticsPort } from '../../ports.js';
import type { Services } from '../../services.js';

// Shared contract (09 §4.4). Changes follow 09 §6.2.

export type ToolContext = {
  user: User;
  projectId: string;
  sessionId: string;
  mode: AgentMode;
  services: Services;
  semantics: SemanticsPort;
};

export type ToolResult =
  | { ok: true; summary: string; result: unknown }
  | { ok: false; code: string; message: string; hint?: string };

// Every tool input includes `rationale`, shown to the user as the step card (05-agent §3).
export const rationaleSchema = z.object({
  title: z.string().min(1).max(60),
  why: z.string().min(1).max(160),
});

export type ToolDef<I extends z.ZodTypeAny> = {
  name: string;
  modes: AgentMode[];
  risk: ToolRisk;
  input: I; // must include `rationale` (rationaleSchema)
  run(input: z.infer<I>, ctx: ToolContext): Promise<ToolResult>; // errors are returned, never thrown
  summarize?(input: z.infer<I>, ctx: ToolContext): Promise<string>; // required when risk === 'gated'
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a list of tools with different input schemas
export type AnyToolDef = ToolDef<any>;

export function defineTool<I extends z.ZodTypeAny>(def: ToolDef<I>): ToolDef<I> {
  if (def.risk === 'gated' && !def.summarize) {
    throw new Error(`Tool ${def.name} is gated and needs summarize() for its approval card.`);
  }
  return def;
}
