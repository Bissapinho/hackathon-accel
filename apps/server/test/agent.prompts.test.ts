// Prompts loader tests (T-25): files load, mode guides, session facts, deterministic fresh facts.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_MODES,
  PROMPTS_DIR,
  buildSystemPrompt,
  isoDate,
  loadPromptTexts,
  modeGuide,
  promptTexts,
  renderFreshFacts,
  type FreshFacts,
} from '../src/agent/prompts/index.js';

const facts: FreshFacts = {
  date: '2026-10-22',
  datasets: [
    { name: 'sales_orders', currentVersion: 2, rowCount: 1200, columnCount: 14, simulated: false, profileStatus: 'done' },
    { name: 'kitchen_capacity', currentVersion: 1, rowCount: 40, columnCount: 5, simulated: true, profileStatus: 'pending' },
    { name: 'returns', currentVersion: null, rowCount: null, columnCount: null, simulated: false },
  ],
  semanticVersion: { version: 'v1', publishedAt: '2026-10-21T09:00:00Z', summary: '24 definitions,\n9 relations' },
  workspace: {
    version: 'w3',
    semanticVersion: 'v1',
    pipelines: ['orders_clean', 'kitchens_clean'],
    objectTypes: ['Order', 'Kitchen'],
    linkTypes: ['orderKitchen'],
    logic: [],
    actionTypes: ['markLate'],
  },
};

describe('prompt files', () => {
  it('reads them from build-package/prompts', () => {
    expect(PROMPTS_DIR.replace(/\\/g, '/')).toMatch(/\/build-package\/prompts\/?$/);
  });

  it('loads base.md and the four mode guides', () => {
    const t = loadPromptTexts();
    expect(t.base).toContain('You are the builder assistant of Mini-Foundry');
    expect(t.router.startsWith('## Mode: router')).toBe(true);
    expect(t.explore.startsWith('## Mode: explore')).toBe(true);
    expect(t.build.startsWith('## Mode: build')).toBe(true);
    expect(t.semantics).toContain('## Mode: semantics');
  });

  it('keeps the EvoOntology MIT notice in semantics.md', () => {
    const raw = readFileSync(join(PROMPTS_DIR, 'semantics.md'), 'utf8');
    expect(raw.startsWith('<!--')).toBe(true);
    expect(raw).toContain('MIT License');
    expect(modeGuide('semantics')).toContain('MIT License');
  });

  it('loads from another directory and normalises line endings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prompts-'));
    try {
      for (const name of ['base', ...AGENT_MODES]) writeFileSync(join(dir, `${name}.md`), `# ${name}\r\nline\r\n\n`);
      const t = loadPromptTexts(dir);
      expect(t.base).toBe('# base\nline');
      expect(modeGuide('build', t)).toBe('# build\nline');
      expect(buildSystemPrompt({ projectName: 'P', userDisplayName: 'U' }, t)).toBe(
        '# base\nline\n\n## This session\n- Project: P\n- User: U',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caches the texts per process', () => {
    expect(promptTexts()).toBe(promptTexts());
  });
});

describe('modeGuide', () => {
  it('returns each mode file, trimmed, and they all differ', () => {
    const guides = AGENT_MODES.map((m) => modeGuide(m));
    for (const [i, m] of AGENT_MODES.entries()) {
      const raw = readFileSync(join(PROMPTS_DIR, `${m}.md`), 'utf8');
      expect(guides[i]).toBe(raw.trimEnd());
    }
    expect(new Set(guides).size).toBe(4);
  });
});

describe('buildSystemPrompt', () => {
  it('is base.md followed by the session facts', () => {
    const s = buildSystemPrompt({ projectName: 'Kumo 2025', userDisplayName: 'Alfred' });
    expect(s.startsWith(promptTexts().base)).toBe(true);
    expect(s.endsWith('## This session\n- Project: Kumo 2025\n- User: Alfred')).toBe(true);
    expect(s).not.toContain('## Mode:');
  });

  it('is byte-identical for the same input and keeps names on one line', () => {
    const a = buildSystemPrompt({ projectName: 'Kumo\n## Injected', userDisplayName: ' A  B ' });
    const b = buildSystemPrompt({ projectName: 'Kumo\n## Injected', userDisplayName: ' A  B ' });
    expect(a).toBe(b);
    expect(a).toContain('- Project: Kumo ## Injected');
    expect(a).toContain('- User: A B');
  });
});

describe('renderFreshFacts', () => {
  it('renders date, sorted datasets, semantic version and inventory', () => {
    expect(renderFreshFacts(facts)).toBe(
      [
        '## Current facts',
        '- Today: 2026-10-22',
        '',
        '### Datasets',
        '- kitchen_capacity: version 1, 40 rows, 5 columns, profile pending, simulated',
        '- returns: no version uploaded',
        '- sales_orders: version 2, 1200 rows, 14 columns',
        '',
        '### Meaning (semantic bank)',
        '- active version: v1, published 2026-10-21T09:00:00Z',
        '- summary: 24 definitions, 9 relations',
        '',
        '### Published workspace',
        '- version: w3, built on meaning v1',
        '- pipelines: kitchens_clean, orders_clean',
        '- object types: Kitchen, Order',
        '- links: orderKitchen',
        '- logic: none',
        '- actions: markLate',
      ].join('\n'),
    );
  });

  it('is deterministic: input order does not matter and inputs are not mutated', () => {
    const shuffled: FreshFacts = {
      ...facts,
      datasets: [...facts.datasets].reverse(),
      workspace: facts.workspace && {
        ...facts.workspace,
        pipelines: [...facts.workspace.pipelines].reverse(),
        objectTypes: [...facts.workspace.objectTypes].reverse(),
      },
    };
    const snapshot = JSON.stringify(facts);
    expect(renderFreshFacts(shuffled)).toBe(renderFreshFacts(facts));
    expect(renderFreshFacts(facts)).toBe(renderFreshFacts(facts));
    expect(JSON.stringify(facts)).toBe(snapshot);
  });

  it('handles an empty project', () => {
    const out = renderFreshFacts({ date: '2026-01-02', datasets: [], semanticVersion: null, workspace: null });
    expect(out).toContain('- none uploaded yet');
    expect(out).toContain('- no version published yet (build mode is locked)');
    expect(out).toContain('- nothing published yet');
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => renderFreshFacts({ ...facts, date: '2026-10-22T10:00:00Z' })).toThrow(/YYYY-MM-DD/);
  });

  it('isoDate gives the UTC calendar date', () => {
    expect(isoDate(new Date('2026-10-22T23:30:00-02:00'))).toBe('2026-10-23');
  });
});
