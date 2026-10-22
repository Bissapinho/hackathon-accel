// Owner: Alfred (09 §3). Chat blocks parser (05-agent.md §9): pulls the ```block fences out of assistant text and
// validates each one against the ChatBlock union with zod. A fence whose JSON is invalid,
// whose kind is unknown or whose fields don't match stays in the text verbatim (G9).

import { z } from 'zod';
import type { ChatBlock } from '@mini/shared';

const str = z.string();
const finite = z.number().finite();

const planStep = z.object({
  text: str,
  status: z.enum(['todo', 'doing', 'done', 'skipped']),
  stage: z.enum(['ingest', 'semantics', 'ontology', 'logic']),
});

const chatBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), steps: z.array(planStep) }),
  z.object({
    kind: z.literal('proposal'),
    rows: z.array(z.object({ item: str, whatItDoes: str, rows: finite.optional() })),
    caveats: z.array(str),
  }),
  z.object({
    kind: z.literal('verification'),
    checks: z.array(z.object({ label: str, ok: z.boolean(), detail: str })),
  }),
  z.object({
    kind: z.literal('definition'),
    termId: str,
    name: str,
    definition: str,
    evidence: z.array(z.object({ what: str, result: str })),
  }),
  z.object({ kind: z.literal('decision'), constraintId: str, question: str, choice: str }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(str),
    rows: z.array(z.array(z.union([str, finite, z.null()]))),
  }),
  z.object({
    kind: z.literal('barChart'),
    x: str,
    y: str,
    data: z.array(z.record(z.union([str, finite]))),
  }),
  z.object({
    kind: z.literal('objectLink'),
    ref: z.object({ objectType: str, primaryKey: str }),
    label: str,
  }),
  z.object({ kind: z.literal('appLink'), appId: str, label: str }),
]);

// Compile-time guard: the schema's output is exactly a ChatBlock, and every ChatBlock kind is covered.
type SchemaBlock = z.infer<typeof chatBlockSchema>;
const _sameShape: [SchemaBlock extends ChatBlock ? true : false, ChatBlock extends SchemaBlock ? true : false] = [true, true];
void _sameShape;

export const CHAT_BLOCK_KINDS: readonly ChatBlock['kind'][] = chatBlockSchema.options.map((o) => o.shape.kind.value);

/** One piece of an assistant message, in order. Local view type, not part of packages/shared. */
export type MessageSegment = { type: 'text'; text: string } | { type: 'block'; block: ChatBlock };

export type ParsedAssistantText = {
  /** The text without its valid blocks (invalid fences kept verbatim), for `AgentItemView.text`. */
  text: string;
  /** The valid blocks in order, for `AgentItemView.blocks`. */
  blocks: ChatBlock[];
  /** Text and blocks interleaved in their original order. */
  segments: MessageSegment[];
};

/** Result of validating one block's JSON source. */
export type BlockParseResult = { ok: true; block: ChatBlock } | { ok: false; reason: 'invalid_json' | 'invalid_block' };

// A fence opens on its own line with ```block and closes on its own line with ```.
const FENCE = /^```block[ \t]*\r?\n([\s\S]*?)\r?\n?^```[ \t]*$/gm;

export function parseBlockJson(source: string): BlockParseResult {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = chatBlockSchema.safeParse(json);
  return parsed.success ? { ok: true, block: parsed.data } : { ok: false, reason: 'invalid_block' };
}

export function parseAssistantText(input: string): ParsedAssistantText {
  const segments: MessageSegment[] = [];
  let pending = ''; // text accumulated since the last valid block (invalid fences included)

  const flushText = (): void => {
    const text = trimBlankLines(pending);
    if (text !== '') segments.push({ type: 'text', text });
    pending = '';
  };

  let last = 0;
  for (const match of input.matchAll(FENCE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    pending += input.slice(last, start);
    const result = parseBlockJson(match[1] ?? '');
    if (result.ok) {
      flushText();
      segments.push({ type: 'block', block: result.block });
    } else {
      pending += match[0];
    }
    last = end;
  }
  pending += input.slice(last);
  flushText();

  const texts: string[] = [];
  const blocks: ChatBlock[] = [];
  for (const s of segments) {
    if (s.type === 'text') texts.push(s.text);
    else blocks.push(s.block);
  }
  return { text: texts.join('\n\n'), blocks, segments };
}

// Removes leading and trailing blank lines but keeps indentation of the first line and the inner text.
function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
}
