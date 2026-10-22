// LLM gateway (task T-21): Claude through @anthropic-ai/sdk, or the mock with LLM_MOCK=1.

import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AnthropicGateway } from './anthropic.js';
import { MockGateway, RecordingGateway } from './mock.js';
import type { AppDeps } from '../../services.js';
import type { LlmGateway } from './types.js';

export * from './anthropic.js';
export * from './interpret.js';
export * from './mock.js';
export * from './tools.js';
export * from './types.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

// The LLM part of 01-architecture §6, parsed here rather than in src/config.ts (Part A's file) for now.
const EnvSchema = z.object({
  LLM_MOCK: z.enum(['0', '1']).default('0'),
  LLM_MOCK_FILE: z.string().default('fixtures/demo-session.jsonl'),
  LLM_RECORD_FILE: z.string().optional(),
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
});

export type LlmConfig = z.infer<typeof EnvSchema>;

export function loadLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  // Same rule as src/config.ts: an empty value in .env means "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid LLM configuration in .env: ${fields}. See .env.example.`);
  }
  return parsed.data;
}

/** Relative mock paths are read from the repository root, wherever the server was started from. */
function fromRepoRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

/** The gateway selected by the environment (01-architecture §6). */
export function createLlmGateway(env: Record<string, string | undefined> = process.env): LlmGateway {
  const cfg = loadLlmConfig(env);
  const params = { model: cfg.LLM_MODEL, effort: cfg.LLM_EFFORT };
  if (cfg.LLM_MOCK === '1') return MockGateway.fromFile(fromRepoRoot(cfg.LLM_MOCK_FILE), params);
  const live = new AnthropicGateway(params);
  return cfg.LLM_RECORD_FILE ? new RecordingGateway(live, fromRepoRoot(cfg.LLM_RECORD_FILE)) : live;
}

export type LlmDeps = Partial<AppDeps> & {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** A ready gateway (tests): skips the environment. */
  llm?: LlmGateway;
};

/** Part B service entry for services.alfred.ts: `{ ...buildLlmServices(deps) }`. Accepts AppDeps as is. */
export function buildLlmServices(deps: LlmDeps = {}): { llm: LlmGateway } {
  return { llm: deps.llm ?? createLlmGateway(deps.env) };
}
