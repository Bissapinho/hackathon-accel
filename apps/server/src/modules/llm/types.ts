// The LLM gateway's contract with the agent loop (05-agent §1 "Claude specifics").
// The loop builds the conversation; the gateway owns everything specific to Claude:
// model, thinking, effort, betas, fallbacks, caching, eager input streaming, validation of tool inputs.

import type Anthropic from '@anthropic-ai/sdk';
import type { ZodTypeAny } from 'zod';

export type BetaMessage = Anthropic.Beta.BetaMessage;
export type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
export type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

/** One tool as the loop declares it: the JSON schema is generated from `schema` (CLAUDE.md rule 2). */
export type LlmTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: ZodTypeAny;
};

export type LlmRequest = {
  /** Stable top-level system text (base prompt + rarely changing facts): cached with the tools. */
  system: string;
  /** All tools, same order in every mode (the cached prefix must not change). */
  tools: LlmTool[];
  /** The append-only conversation, mode guides included as mid-conversation system messages. */
  messages: BetaMessageParam[];
  /** Ask the API to clear old tool results (05-agent §7): set once the token estimate passes the budget. */
  contextEditing?: boolean;
  signal?: AbortSignal;
};

/** Streaming callbacks: deltas feed the SSE stream ("Working…" line, live text). */
export type LlmHandlers = {
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolStart?: (call: { id: string; name: string }) => void;
};

export type FieldIssue = { path: string; message: string };

/** One tool_use block of the response, checked against its zod schema before anything runs. */
export type ToolCallCheck =
  | { id: string; name: string; ok: true; input: unknown }
  | { id: string; name: string; ok: false; code: 'BAD_ARGUMENTS' | 'UNKNOWN_TOOL' | 'TRUNCATED'; message: string; issues: FieldIssue[]; rawInput: unknown };

export type LlmOutcome = 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal' | 'pause_turn' | 'other';

export type LlmTurn = {
  /** Stored and replayed exactly as returned (thinking and fallback blocks included). */
  message: BetaMessage;
  outcome: LlmOutcome;
  /** Empty on a refusal: a refused turn's tools never run. */
  toolCalls: ToolCallCheck[];
  refusal?: { category: string | null; explanation: string | null };
  /** The model that produced the final answer, and whether a server-side fallback ran. */
  servedBy: string;
  fellBack: boolean;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

export interface LlmGateway {
  readonly kind: 'anthropic' | 'mock' | 'recording';
  stream(req: LlmRequest, handlers?: LlmHandlers): Promise<LlmTurn>;
}

export type LlmErrorCode =
  | 'LLM_BAD_REQUEST' | 'LLM_AUTH' | 'LLM_RATE_LIMITED' | 'LLM_UNAVAILABLE' | 'LLM_ABORTED'
  | 'LLM_INVALID_TOOL_JSON' | 'LLM_MOCK_EXHAUSTED' | 'LLM_ERROR';

/** The loop ends the step with a plain message and keeps the details in the trace. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly details: { status?: number; requestId?: string; cause?: unknown } = {},
  ) {
    super(message);
  }
}
