// Shared fixtures of the agent tests (T-22): scripted Claude responses for the mock gateway, fake tools with
// catalog names (Part B tools that don't exist yet, gated tools), a controllable semantics port.

import type { AgentMode } from '@mini/shared';
import { z } from 'zod';
import { metaTools } from '../src/agent/tools/index.meta.js';
import { defineTool, rationaleSchema, type AnyToolDef, type ToolResult } from '../src/agent/tools/types.js';
import type { FreshFactsProvider } from '../src/modules/agent/index.js';
import type { BetaMessage } from '../src/modules/llm/index.js';
import type { SemanticsPort } from '../src/ports.js';

let msgCounter = 0;

export function msg(content: unknown[], stop_reason: string = content.some((b) => (b as { type: string }).type === 'tool_use') ? 'tool_use' : 'end_turn'): BetaMessage {
  return {
    id: `msg_${++msgCounter}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as BetaMessage;
}

let callCounter = 0;
export const why = (title = 'Look at the data') => ({ title, why: 'To understand what the columns mean' });
export const use = (name: string, input: Record<string, unknown>, id = `toolu_${++callCounter}`) => ({ type: 'tool_use', id, name, input });
export const text = (t: string) => ({ type: 'text', text: t });
export const thinking = (t: string, signature = 'sig-abc') => ({ type: 'thinking', thinking: t, signature });
export const answer = (t = 'Done.') => msg([text(t)]);

/** A semantics port whose active version tests can change. */
export function fakePort(initial: string | null = null): SemanticsPort & { version: string | null } {
  const port = {
    version: initial,
    activeVersion: async () => port.version,
    recordExists: async () => true,
    getRecord: async () => null,
  };
  return port;
}

export const fixedFacts: FreshFactsProvider = async () => ({ date: '2026-10-22', datasets: [], semanticVersion: null, workspace: null });

export type FakeTools = { registry: Map<string, AnyToolDef>; calls: Record<string, unknown[]> };

/** Fake tools with catalog names; each records its inputs in `calls`. */
export function fakeTools(overrides: Partial<Record<string, (input: Record<string, unknown>) => Promise<ToolResult>>> = {}): FakeTools {
  const calls: Record<string, unknown[]> = {};
  const all: AgentMode[] = ['explore', 'semantics', 'build'];
  const make = (name: string, modes: AgentMode[], risk: AnyToolDef['risk'], fields: z.ZodRawShape = {}) =>
    defineTool({
      name, modes, risk,
      input: z.object({ ...fields, rationale: rationaleSchema }),
      async run(input) {
        (calls[name] ??= []).push(input);
        const override = overrides[name];
        if (override) return override(input as Record<string, unknown>);
        return { ok: true, summary: `${name} ok`, result: { tool: name } };
      },
      ...(risk === 'gated' ? { summarize: async () => `Approve ${name}` } : {}),
    });
  const tools: AnyToolDef[] = [
    ...metaTools,
    make('list_datasets', all, 'read'),
    make('run_sql', all, 'read', { sql: z.string() }),
    make('browse_semantics', all, 'read', { query: z.string() }),
    make('resolve_semantics', all, 'read', { mentions: z.array(z.string()).min(1).max(5) }),
    make('get_workspace', all, 'read'),
    make('edit_semantics', ['semantics'], 'bankDraft', { ops: z.array(z.unknown()) }),
    make('publish_semantics', ['semantics'], 'gated', { summary: z.string() }),
    make('edit_draft', ['build'], 'draft', { ops: z.array(z.unknown()) }),
    make('preview_pipeline', ['build'], 'draft', { pipeline: z.string() }),
    make('test_logic', ['build'], 'draft', { objectType: z.string() }),
    make('test_action', ['build'], 'draft', { actionType: z.string() }),
    make('publish_draft', ['build'], 'gated', { message: z.string() }),
    make('run_action', ['explore', 'build'], 'gated', { actionType: z.string() }),
  ];
  return { registry: new Map(tools.map((t) => [t.name, t])), calls };
}
