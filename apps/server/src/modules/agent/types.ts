import type { AgentMode, AgentStatus, ChatBlock, ClarifyingQuestion, ToolRisk } from '@mini/shared';
import type { ToolResult } from '../../agent/tools/types.js';
import type { BetaMessage, ToolCallCheck } from '../llm/types.js';

// Item payloads of meta.agent_items (05-agent §8). The model's message list is rebuilt from them, in order,
// on every step; nothing here is ever edited once written.

export type ItemKind =
  | 'user_message' | 'assistant_message' | 'tool_call' | 'tool_results' | 'approval_request' | 'approval_decision'
  | 'question' | 'answer' | 'mode_change' | 'system_note' | 'note';

export type Rationale = { title: string; why: string };

/** One tool result as stored; `content` of the tool_results item is what the model saw. */
export type StoredResult = {
  callId: string;
  tool: string;
  /** Seq of the tool_call item; the assistant_message seq for a call refused before it got one. */
  callSeq: number;
  ok: boolean;
  summary: string;
  result?: unknown;
  error?: { code: string; message: string; hint?: string };
};

/** The exact tool_result block sent to the model (replayed as stored). */
export type ToolResultContent = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type ItemPayloads = {
  user_message: { text: string };
  /**
   * `content` is Claude's content as returned (thinking and fallback blocks included). jsonb reorders object
   * keys, so `contentJson` keeps the exact JSON text as received: that is what is replayed (G7).
   */
  assistant_message: {
    content: BetaMessage['content']; contentJson: string; blocks?: ChatBlock[]; stopReason: string | null; servedBy?: string; fellBack?: boolean;
  };
  tool_call: { callId: string; tool: string; args: unknown; risk: ToolRisk; rationale: Rationale };
  tool_results: { results: StoredResult[]; content: ToolResultContent[] };
  approval_request: { approvalId: string; tool: string; summary: string; args: unknown; callSeq: number };
  approval_decision: { approvalId: string; decision: 'allowed' | 'rejected'; note?: string };
  question: { questionId: string; questions: ClarifyingQuestion[]; callSeq: number };
  answer: { questionId: string; answers: Record<string, string | string[]> };
  mode_change: { from: AgentMode; to: AgentMode };
  /** Sent to the model as a mid-conversation system message. */
  system_note: { text: string; about: 'mode' | 'facts' | 'continue'; mode?: AgentMode };
  /** UI only. */
  note: { text: string };
};

export type AgentItem<K extends ItemKind = ItemKind> = K extends ItemKind
  ? { seq: number; kind: K; payload: ItemPayloads[K]; tokenEstimate: number; createdAt: string }
  : never;

/** A tool call's outcome inside one model response. */
export type ExecResult = { callId: string; tool: string; callSeq: number; input: unknown; result: ToolResult };

/** The paused response, kept on the session row (agent_sessions.pending) until the decision or answer. */
export type PendingState = {
  kind: 'approval' | 'question';
  approvalId?: string;
  questionId?: string;
  assistantSeq: number;
  /** Every tool call of the paused response, as validated by the gateway. */
  calls: ToolCallCheck[];
  /** Index in `calls` of the paused call, and its tool_call item. */
  index: number;
  callSeq: number;
  /** Results of the calls before it. */
  results: ExecResult[];
  /** Repeated-failure counters of the current run (05-agent §11). */
  failures: Record<string, number>;
};

export type AgentSessionRow = {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  mode: AgentMode;
  status: AgentStatus;
  pending: PendingState | null;
  tokenEstimate: number;
  createdAt: string;
  updatedAt: string;
};
