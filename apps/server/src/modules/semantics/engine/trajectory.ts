// Trajectories: one record per analyst question (feature book ch. 8 §4).
// Ported from EvoOntology trajectory/trajectory.py (`truncate_result`, `from_message_trace`),
// https://github.com/ruc-datalab/EvoOntology, MIT, Copyright (c) 2026 Meiduo Chong.
// No chain-of-thought is kept: only tool inputs, results and the final answer.

import type { Trajectory } from '@mini/shared';
import { RESULT_MAX_CHARS, RESULT_MAX_LINES } from './vocab.js';

export type Truncated = { result: unknown; result_truncated: boolean; result_summary: string };

const asText = (result: unknown): string => (typeof result === 'string' ? result : JSON.stringify(result) ?? String(result));

/** Trim an oversized tool result to a bounded preview and a stable summary. */
export function truncateResult(result: unknown): Truncated {
  const text = asText(result);
  const lines = text.split(/\r\n|\r|\n/);
  if (text.length <= RESULT_MAX_CHARS && lines.length <= RESULT_MAX_LINES) {
    return { result, result_truncated: false, result_summary: text };
  }
  return {
    result: lines.slice(0, RESULT_MAX_LINES).join('\n').slice(0, RESULT_MAX_CHARS),
    result_truncated: true,
    result_summary: `${lines.length} lines, ${text.length} chars; preview shows first ${RESULT_MAX_LINES} lines / ${RESULT_MAX_CHARS} chars.`,
  };
}

/** A result as stored text: whole when small, otherwise the preview followed by the summary. */
export function truncateText(result: unknown): string {
  const t = truncateResult(result);
  return t.result_truncated ? `${asText(t.result)}\n… ${t.result_summary}` : t.result_summary;
}

export type TraceMessage = { tool_call?: { tool: string; arguments?: unknown }; tool_result?: unknown };
export type NewTrajectory = Omit<Trajectory, 'id' | 'createdAt'>;

const SEMANTIC_TOOLS = new Set(['browse_semantics', 'resolve_semantics']);

/**
 * Builds a trajectory from the tool calls of one question, in order: semantic calls keep their full
 * result (evolution diagnoses them), other tool results are cut to about 2 KB.
 */
export function fromMessageTrace(input: {
  sessionId: string; question: string; semVersion: string; messages: TraceMessage[];
  answer: string; status: Trajectory['status'];
}): NewTrajectory {
  const semanticCalls: Trajectory['semanticCalls'] = [];
  const toolCalls: Trajectory['toolCalls'] = [];
  let pending: { tool: string; input: unknown } | null = null;
  for (const message of input.messages) {
    if (message.tool_call?.tool) pending = { tool: message.tool_call.tool, input: message.tool_call.arguments ?? {} };
    if (message.tool_result === undefined || message.tool_result === null || !pending) continue;
    if (SEMANTIC_TOOLS.has(pending.tool)) {
      semanticCalls.push({ tool: pending.tool as 'browse_semantics' | 'resolve_semantics', input: pending.input, result: message.tool_result });
    } else {
      toolCalls.push({ tool: pending.tool, input: pending.input, resultSummary: truncateText(message.tool_result) });
    }
    pending = null;
  }
  return { sessionId: input.sessionId, question: input.question, semVersion: input.semVersion, semanticCalls, toolCalls, answer: input.answer, status: input.status };
}
