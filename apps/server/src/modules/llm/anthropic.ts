// The real gateway: Claude through @anthropic-ai/sdk (05-agent §1 "Claude specifics").
// Streams with client.beta.messages.stream(...) + finalMessage(); the beta namespace carries the
// server-side fallback for refusals and context editing.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.js';
import { interpretMessage } from './interpret.js';
import { LlmError, type LlmGateway, type LlmHandlers, type LlmRequest, type LlmTurn } from './types.js';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AnthropicGatewayConfig = {
  model: string;           // LLM_MODEL, e.g. claude-opus-5-5
  effort: Effort;          // LLM_EFFORT; Opus 5.5 defaults to medium, so always set it
  maxTokens?: number;      // 32 000 (05-agent §1)
  maxRetries?: number;     // SDK retries on 408/409/429/5xx and connection errors
  /** Re-issues of a turn whose tool input was not parseable JSON at all. */
  invalidJsonRetries?: number;
  client?: Anthropic;
};

export const BETAS = ['server-side-fallback-2026-07-01', 'context-management-2025-06-27'] as const;

export type StreamParams = BetaMessageStreamParams;

/** The request body. Pure, so the cached-prefix rules can be tested without the network. */
export function buildParams(config: Pick<AnthropicGatewayConfig, 'model' | 'effort' | 'maxTokens'>, req: LlmRequest): StreamParams {
  return {
    model: config.model,
    max_tokens: config.maxTokens ?? 32_000,
    betas: [...BETAS],
    // A declined request is re-run server-side on the model Anthropic recommends for that refusal category.
    fallbacks: 'default',
    // Summaries feed the "Working…" line; thinking cannot be disabled on this model, effort is the control.
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: config.effort },
    // Forced tool choice returns a 400 on this model: steer from the prompt instead.
    tool_choice: { type: 'auto' },
    // Render order is tools → system → messages: this breakpoint caches the tools and the system text.
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    tools: req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    })),
    messages: req.messages,
    // Automatic caching of the (append-only) conversation history.
    cache_control: { type: 'ephemeral' },
    ...(req.contextEditing ? { context_management: { edits: [{ type: 'clear_tool_uses_20250919' as const }] } } : {}),
  };
}

export class AnthropicGateway implements LlmGateway {
  readonly kind = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicGatewayConfig) {
    // No key passed: the SDK reads ANTHROPIC_API_KEY (or another configured credential) itself.
    this.client = config.client ?? new Anthropic({ maxRetries: config.maxRetries ?? 4 });
  }

  async stream(req: LlmRequest, handlers: LlmHandlers = {}): Promise<LlmTurn> {
    const params = buildParams(this.config, req);
    const maxJsonRetries = this.config.invalidJsonRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = this.client.beta.messages.stream(params, { signal: req.signal });
        if (handlers.onText) stream.on('text', (delta) => handlers.onText!(delta));
        if (handlers.onThinking) stream.on('thinking', (delta) => handlers.onThinking!(delta));
        if (handlers.onToolStart) {
          stream.on('streamEvent', (event) => {
            if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
              handlers.onToolStart!({ id: event.content_block.id, name: event.content_block.name });
            }
          });
        }
        // With eager input streaming, finalMessage() rejects when a tool input is not parseable at all.
        const message = await stream.finalMessage();
        // One line per model call (no content): what benchmarks and cost checks read.
        console.log(`llm-usage ${JSON.stringify({ model: params.model, ...message.usage })}`);
        return interpretMessage(message, req.tools);
      } catch (err) {
        if (err instanceof Anthropic.APIError) throw toLlmError(err);
        if (attempt >= maxJsonRetries) {
          throw new LlmError('LLM_INVALID_TOOL_JSON', 'Claude produced a tool call that could not be read, several times in a row.', { cause: err });
        }
        // Not an API error: the tool input JSON could not be parsed. Re-issue the same turn.
      }
    }
  }
}

/** Most specific first: a 400 ends the step; 429 / 5xx / connection errors were already retried by the SDK. */
export function toLlmError(err: InstanceType<typeof Anthropic.APIError>): LlmError {
  const details = { status: err.status, requestId: err.requestID ?? undefined, cause: err };
  if (err instanceof Anthropic.APIUserAbortError) return new LlmError('LLM_ABORTED', 'The request to Claude was stopped.', details);
  if (err instanceof Anthropic.APIConnectionError) return new LlmError('LLM_UNAVAILABLE', 'Claude could not be reached. Try again in a moment.', details);
  if (err instanceof Anthropic.BadRequestError) return new LlmError('LLM_BAD_REQUEST', 'Claude rejected the request.', details);
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('LLM_AUTH', 'The server is not allowed to call Claude: check ANTHROPIC_API_KEY.', details);
  }
  if (err instanceof Anthropic.RateLimitError) return new LlmError('LLM_RATE_LIMITED', 'Claude is busy right now. Try again in a minute.', details);
  if (err instanceof Anthropic.InternalServerError || (err.status ?? 0) >= 500) {
    return new LlmError('LLM_UNAVAILABLE', 'Claude is temporarily unavailable. Try again in a moment.', details);
  }
  return new LlmError('LLM_ERROR', `Claude returned an error (${err.status ?? 'no status'}).`, details);
}
