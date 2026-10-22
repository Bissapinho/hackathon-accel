// Owner: Alfred (09 §3). Prompts loader (05-agent.md §6): the cached top-level system text (base.md + session facts),
// the mode guides sent as mid-conversation system messages, and the "fresh facts" message.
// Everything here is deterministic (no clock, sorted lists, LF line endings): it is part of the
// cached prompt prefix, so the same input must give byte-identical output.
// The prompt files are sent as written, HTML comments included (semantics.md keeps its
// EvoOntology MIT notice; 05-agent.md does not ask for it to be stripped).
// The texts are read from build-package/prompts/ (one source of truth, not copied here).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AgentMode } from '@mini/shared';

export type PromptTexts = { base: string } & Record<AgentMode, string>;

export const AGENT_MODES: readonly AgentMode[] = ['router', 'explore', 'semantics', 'build'];

/** The directory holding the prompt files: build-package/prompts/ (resolved like agent/registry.ts resolves the catalog). */
export const PROMPTS_DIR = fileURLToPath(new URL('../../../../../build-package/prompts/', import.meta.url));

/** Reads base.md and the four mode guides. Line endings are normalised to LF and trailing whitespace trimmed. */
export function loadPromptTexts(dir: string = PROMPTS_DIR): PromptTexts {
  const read = (name: string): string =>
    readFileSync(join(dir, `${name}.md`), 'utf8').replace(/\r\n?/g, '\n').trimEnd();
  return {
    base: read('base'),
    router: read('router'),
    explore: read('explore'),
    semantics: read('semantics'),
    build: read('build'),
  };
}

let cached: PromptTexts | undefined;

/** The prompt files of PROMPTS_DIR, read once per process. */
export function promptTexts(): PromptTexts {
  cached ??= loadPromptTexts();
  return cached;
}

// ── Top-level system (cached) ──

/** Facts that change rarely and live in the cached top-level `system`. */
export type SessionFacts = { projectName: string; userDisplayName: string };

export function buildSystemPrompt(facts: SessionFacts, texts: PromptTexts = promptTexts()): string {
  return [
    texts.base,
    '',
    '## This session',
    `- Project: ${oneLine(facts.projectName)}`,
    `- User: ${oneLine(facts.userDisplayName)}`,
  ].join('\n');
}

// ── Mode guides (mid-conversation system messages) ──

export function modeGuide(mode: AgentMode, texts: PromptTexts = promptTexts()): string {
  return texts[mode];
}

// ── Fresh facts (mid-conversation system message, sent when they change) ──

export type FreshDataset = {
  name: string;
  currentVersion: number | null;   // null: nothing uploaded yet
  rowCount: number | null;
  columnCount: number | null;
  simulated: boolean;
  profileStatus?: 'pending' | 'running' | 'done' | 'failed';
};

export type FreshSemanticVersion = {
  version: string;                 // e.g. "v1"
  publishedAt: string;             // ISO timestamp, as stored
  summary?: string;
};

export type FreshWorkspace = {
  version: string;
  semanticVersion: string;         // the bank version the workspace was built on
  pipelines: string[];
  objectTypes: string[];
  linkTypes: string[];
  logic: string[];
  actionTypes: string[];
};

export type FreshFacts = {
  date: string;                    // YYYY-MM-DD (UTC), computed by the caller: see `isoDate`
  datasets: FreshDataset[];
  semanticVersion: FreshSemanticVersion | null;
  workspace: FreshWorkspace | null; // the published workspace, null when nothing is published
};

/** UTC calendar date of `d` as YYYY-MM-DD, for `FreshFacts.date`. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function renderFreshFacts(facts: FreshFacts): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(facts.date)) {
    throw new Error(`renderFreshFacts: date must be YYYY-MM-DD, got "${facts.date}"`);
  }
  const lines: string[] = ['## Current facts', `- Today: ${facts.date}`, '', '### Datasets'];

  const datasets = [...facts.datasets].sort((a, b) => cmp(a.name, b.name));
  if (datasets.length === 0) lines.push('- none uploaded yet');
  for (const d of datasets) {
    const parts: string[] = [];
    if (d.currentVersion === null) parts.push('no version uploaded');
    else parts.push(`version ${d.currentVersion}`);
    if (d.rowCount !== null) parts.push(`${d.rowCount} rows`);
    if (d.columnCount !== null) parts.push(`${d.columnCount} columns`);
    if (d.profileStatus !== undefined && d.profileStatus !== 'done') parts.push(`profile ${d.profileStatus}`);
    if (d.simulated) parts.push('simulated');
    lines.push(`- ${oneLine(d.name)}: ${parts.join(', ')}`);
  }

  lines.push('', '### Meaning (semantic bank)');
  const sv = facts.semanticVersion;
  if (sv === null) {
    lines.push('- no version published yet (build mode is locked)');
  } else {
    lines.push(`- active version: ${oneLine(sv.version)}, published ${oneLine(sv.publishedAt)}`);
    if (sv.summary !== undefined && sv.summary.trim() !== '') lines.push(`- summary: ${oneLine(sv.summary)}`);
  }

  lines.push('', '### Published workspace');
  const ws = facts.workspace;
  if (ws === null) {
    lines.push('- nothing published yet');
  } else {
    lines.push(`- version: ${oneLine(ws.version)}, built on meaning ${oneLine(ws.semanticVersion)}`);
    lines.push(`- pipelines: ${list(ws.pipelines)}`);
    lines.push(`- object types: ${list(ws.objectTypes)}`);
    lines.push(`- links: ${list(ws.linkTypes)}`);
    lines.push(`- logic: ${list(ws.logic)}`);
    lines.push(`- actions: ${list(ws.actionTypes)}`);
  }
  return lines.join('\n');
}

// Code-unit order, independent of the process locale.
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function list(names: string[]): string {
  if (names.length === 0) return 'none';
  return [...names].map(oneLine).sort(cmp).join(', ');
}

// Keeps user-supplied names on one line so they can't add headings or lines to the prompt.
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
