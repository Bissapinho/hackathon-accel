// Reads a final Claude message the same way for the real and the mock gateway:
// stop reason first, then the tool calls, each validated with its zod schema.

import type { BetaMessage, LlmOutcome, LlmTool, LlmTurn, ToolCallCheck } from './types.js';

const OUTCOMES: Record<string, LlmOutcome> = {
  tool_use: 'tool_use', end_turn: 'end_turn', max_tokens: 'max_tokens', refusal: 'refusal', pause_turn: 'pause_turn',
};

export function interpretMessage(message: BetaMessage, tools: LlmTool[]): LlmTurn {
  const outcome = OUTCOMES[message.stop_reason ?? ''] ?? 'other';
  const byName = new Map(tools.map((t) => [t.name, t]));

  // Never read tool calls of a refused turn: a refusal can cut a tool_use off mid-input.
  const toolCalls: ToolCallCheck[] = outcome === 'refusal' ? [] : message.content.flatMap((block): ToolCallCheck[] => {
    if (block.type !== 'tool_use') return [];
    const base = { id: block.id, name: block.name, rawInput: block.input };
    if (outcome === 'max_tokens') {
      // A tool input cut off at max_tokens usually parses as a valid partial object: never run it.
      return [{ ...base, ok: false, code: 'TRUNCATED', message: 'The tool input was cut off before it was complete.', issues: [] }];
    }
    const tool = byName.get(block.name);
    if (!tool) return [{ ...base, ok: false, code: 'UNKNOWN_TOOL', message: `There is no tool named "${block.name}".`, issues: [] }];
    const parsed = tool.schema.safeParse(block.input);
    if (parsed.success) return [{ id: block.id, name: block.name, ok: true, input: parsed.data }];
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return [{ ...base, ok: false, code: 'BAD_ARGUMENTS', message: `Invalid input for ${block.name}: ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`, issues }];
  });

  const stopDetails = message.stop_details as { category?: string | null; explanation?: string | null } | null | undefined;
  const iterations = (message.usage.iterations ?? []) as { type?: string }[];
  const fellBack = message.content.some((b) => b.type === 'fallback') || iterations.some((i) => i.type === 'fallback_message');

  return {
    message,
    outcome,
    toolCalls,
    ...(outcome === 'refusal' ? { refusal: { category: stopDetails?.category ?? null, explanation: stopDetails?.explanation ?? null } } : {}),
    servedBy: message.model,
    fellBack,
    usage: {
      input: message.usage.input_tokens ?? 0,
      output: message.usage.output_tokens ?? 0,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
