// The ordering rules of the Messages API that a rebuilt conversation must respect, checked without the network.
// The mock gateway runs this check on every request, so a loop path that would get a 400 from Claude fails the
// tests the same way. Rules (Claude API docs, mid-conversation system messages and tool use):
// - the first message is a user message;
// - a text system message follows a user message (or another system message of the same run) and is either the
//   last message or followed by an assistant message; a directive-only system message (`content: []`) may sit
//   anywhere;
// - every tool_use of an assistant message gets its tool_result in the very next user turn (consecutive user
//   messages are merged into one turn), tool_result blocks first;
// - a tool_result answers a tool_use of the assistant message just before it;
// - the conversation does not end with an assistant message (prefill is refused on current models).

import type { BetaMessageParam } from './types.js';

export type SequenceIssue = { index: number; code: string; message: string };

type Block = { type?: string; id?: string; tool_use_id?: string };

function blocks(m: BetaMessageParam): Block[] {
  return typeof m.content === 'string' ? [{ type: 'text' }] : (m.content as Block[]);
}

/** A system message with no content only carries a directive (e.g. output_config) and is exempt from placement. */
function isDirectiveOnly(m: BetaMessageParam): boolean {
  return m.role === 'system' && Array.isArray(m.content) && m.content.length === 0;
}

export function checkMessageSequence(messages: BetaMessageParam[]): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const issue = (index: number, code: string, message: string) => issues.push({ index, code, message });
  if (messages.length === 0) return [{ index: 0, code: 'EMPTY', message: 'messages is empty.' }];
  if (messages[0]!.role !== 'user') issue(0, 'FIRST_NOT_USER', `messages.0 is a ${messages[0]!.role} message; the first message must be a user message.`);

  // Text system messages: placement.
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== 'system' || isDirectiveOnly(m)) continue;
    let p = i - 1;
    while (p >= 0 && messages[p]!.role === 'system') p--;
    const prev = p >= 0 ? messages[p]! : undefined;
    const prevOk = prev?.role === 'user' || (prev?.role === 'assistant' && blocks(prev).at(-1)?.type === 'server_tool_use');
    if (!prevOk) issue(i, 'SYSTEM_PLACEMENT', `messages.${i}: a system message must follow a user message (it follows ${prev ? `a ${prev.role} message` : 'nothing'}).`);
    let n = i + 1;
    while (n < messages.length && messages[n]!.role === 'system') n++;
    const next = messages[n];
    if (next && next.role !== 'assistant') {
      issue(i, 'SYSTEM_PLACEMENT', `messages.${i}: role 'system' must precede an 'assistant' message or end the array (it precedes a ${next.role} message).`);
    }
  }

  // Tool use / tool result pairing, on turns (consecutive user messages are one turn; system messages are skipped).
  let open: { index: number; ids: Set<string> } | undefined;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      if (open && open.ids.size > 0) {
        issue(open.index, 'TOOL_USE_UNANSWERED', `messages.${open.index}: tool_use ${[...open.ids].join(', ')} has no tool_result in the next user turn.`);
      }
      const ids = blocks(m).filter((b) => b.type === 'tool_use' && b.id).map((b) => b.id!);
      open = { index: i, ids: new Set(ids) };
      continue;
    }
    // A user turn: this message and the user messages right after it.
    let end = i;
    while (end + 1 < messages.length && messages[end + 1]!.role === 'user') end++;
    const turn = messages.slice(i, end + 1).flatMap(blocks);
    const expected = open?.ids ?? new Set<string>();
    let seenOther = false;
    for (const b of turn) {
      if (b.type !== 'tool_result') {
        seenOther = true;
        continue;
      }
      if (seenOther && expected.size > 0) issue(i, 'TOOL_RESULT_ORDER', `messages.${i}: tool_result blocks must come first in the user turn.`);
      if (!b.tool_use_id || !expected.has(b.tool_use_id)) {
        issue(i, 'TOOL_RESULT_UNKNOWN', `messages.${i}: tool_result ${b.tool_use_id ?? '(no id)'} does not answer a tool_use of the previous assistant message.`);
      } else {
        expected.delete(b.tool_use_id);
      }
    }
    if (expected.size > 0) {
      issue(open!.index, 'TOOL_USE_UNANSWERED', `messages.${open!.index}: tool_use ${[...expected].join(', ')} has no tool_result in the next user turn.`);
    }
    open = undefined;
    i = end;
  }
  if (open && open.ids.size > 0) {
    issue(open.index, 'TOOL_USE_UNANSWERED', `messages.${open.index}: tool_use ${[...open.ids].join(', ')} has no tool_result.`);
  }

  const last = messages.length - 1;
  if (messages[last]!.role === 'assistant') {
    issue(last, 'ENDS_WITH_ASSISTANT', `messages.${last}: the conversation ends with an assistant message (prefill is not supported).`);
  }
  return issues;
}
