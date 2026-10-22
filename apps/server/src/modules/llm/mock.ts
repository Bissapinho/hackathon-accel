// The mock gateway (LLM_MOCK=1, 05-agent §12): replays recorded Anthropic responses from a JSONL file,
// one line per model turn, in order. It streams their text and thinking to the handlers and reads them
// with the same interpretMessage() as the real gateway, so the loop can't tell the difference.
// The recording gateway writes that file from a live run (T-30: record on kumo-mini only, never real data).

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { buildParams, type Effort, type StreamParams } from './anthropic.js';
import { interpretMessage } from './interpret.js';
import { LlmError, type BetaMessage, type LlmErrorCode, type LlmGateway, type LlmHandlers, type LlmRequest, type LlmTurn } from './types.js';

/** One JSONL line: a recorded response, or an error to raise at that turn. `note` is for humans. */
export type MockLine =
  | { response: BetaMessage; note?: string }
  | { error: { code: LlmErrorCode; message: string; status?: number }; note?: string };

export function parseMockFile(text: string, source = 'mock file'): MockLine[] {
  return text.split('\n').flatMap((line, i): MockLine[] => {
    if (!line.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`${source}, line ${i + 1}: not valid JSON`);
    }
    const ok = typeof parsed === 'object' && parsed !== null && ('response' in parsed || 'error' in parsed);
    if (!ok) throw new Error(`${source}, line ${i + 1}: expected {"response": …} or {"error": …}`);
    return [parsed as MockLine];
  });
}

export class MockGateway implements LlmGateway {
  readonly kind = 'mock' as const;
  /** What the loop asked for, turn by turn, for assertions (e.g. G7: history replayed byte-for-byte). */
  readonly requests: LlmRequest[] = [];
  /** The request bodies the real gateway would have sent. */
  readonly sent: StreamParams[] = [];
  private cursor = 0;

  constructor(
    private readonly lines: MockLine[],
    private readonly params: { model: string; effort: Effort } = { model: 'claude-opus-5-5', effort: 'high' },
    /** Said when the mock runs out, e.g. that the recording file does not exist yet. */
    private readonly exhaustedHint = '',
  ) {}

  /**
   * A missing file gives an empty mock rather than a startup failure: the server and the API tests start
   * with LLM_MOCK=1 before fixtures/demo-session.jsonl is recorded (T-30); the first model turn then fails clearly.
   */
  static fromFile(path: string, params?: { model: string; effort: Effort }): MockGateway {
    if (!existsSync(path)) return new MockGateway([], params, ` No mock file at ${path}: record one with LLM_RECORD_FILE.`);
    return new MockGateway(parseMockFile(readFileSync(path, 'utf8'), path), params);
  }

  static fromMessages(messages: BetaMessage[]): MockGateway {
    return new MockGateway(messages.map((response) => ({ response })));
  }

  get remaining(): number {
    return this.lines.length - this.cursor;
  }

  async stream(req: LlmRequest, handlers: LlmHandlers = {}): Promise<LlmTurn> {
    // Copies of the conversation: the loop keeps appending to the same arrays after this call.
    this.requests.push({ ...req, messages: structuredClone(req.messages), signal: undefined });
    this.sent.push(structuredClone(buildParams(this.params, req)));
    const line = this.lines[this.cursor++];
    if (!line) throw new LlmError('LLM_MOCK_EXHAUSTED', `The mock has no recorded response left (turn ${this.cursor}).${this.exhaustedHint}`);
    if ('error' in line) throw new LlmError(line.error.code, line.error.message, { status: line.error.status });
    const message = structuredClone(line.response);
    for (const block of message.content) {
      if (block.type === 'thinking' && block.thinking) handlers.onThinking?.(block.thinking);
      else if (block.type === 'text') handlers.onText?.(block.text);
      else if (block.type === 'tool_use') handlers.onToolStart?.({ id: block.id, name: block.name });
    }
    return interpretMessage(message, req.tools);
  }
}

/** Wraps a gateway and appends every response to a JSONL file the mock can replay. */
export class RecordingGateway implements LlmGateway {
  readonly kind = 'recording' as const;

  constructor(private readonly inner: LlmGateway, private readonly file: string) {}

  async stream(req: LlmRequest, handlers?: LlmHandlers): Promise<LlmTurn> {
    try {
      const turn = await this.inner.stream(req, handlers);
      appendFileSync(this.file, JSON.stringify({ response: turn.message } satisfies MockLine) + '\n');
      return turn;
    } catch (err) {
      if (err instanceof LlmError) {
        appendFileSync(this.file, JSON.stringify({ error: { code: err.code, message: err.message, status: err.details.status } } satisfies MockLine) + '\n');
      }
      throw err;
    }
  }
}
