// Parity with the Python EvoOntology core: the same bank and calls give the same answers.
// fixtures/semantics-parity/golden.json is produced by make-golden.py there, from the Python code.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bankFromRecords, browse, resolve, truncateResult, validateBank, type SemBank } from '../src/modules/semantics/engine/index.js';
import type { SemKind, SemLifecycle, SemRecord } from '@mini/shared';

const HERE = join(import.meta.dirname, 'fixtures/semantics-parity');
const read = (file: string) => JSON.parse(readFileSync(join(HERE, file), 'utf8'));
const golden = read('golden.json');
const cases = read('cases.json');

const FAMILIES: [string, SemKind][] = [['terms', 'term'], ['mappings', 'mapping'], ['relations', 'relation'], ['constraints', 'constraint'], ['evidence', 'evidence']];

/** EvoOntology's file layout → our records (lifecycle moves from `lifecycle.state` to the record). */
function bankOf(families: Record<string, Record<string, unknown>[]>): SemBank {
  const records: SemRecord[] = [];
  for (const [family, kind] of FAMILIES) {
    for (const { lifecycle, ...body } of families[family] ?? []) {
      const state = ((lifecycle as { state?: string } | undefined)?.state ?? 'active') as SemLifecycle;
      records.push({ kind, lifecycle: state, body } as SemRecord);
    }
  }
  return bankFromRecords('v0', records);
}

const files = Object.fromEntries(FAMILIES.map(([f]) => [f, read(`bank/versions/v0/${f}.json`)]));
/**
 * EvoOntology's Mapping.from_dict never reads a mapping's `evidence` list (its fallback returns the empty
 * `validation.evidence` first), so Python sees every mapping without evidence. Ours reads it (types/shared.ts):
 * the comparison runs on the bank as Python sees it, and a separate test covers our behaviour.
 */
const fileBank = bankOf({ ...files, mappings: files.mappings.map((m: object) => ({ ...m, evidence: [] })) });

/** EvoOntology normalizes `warning` to `warn`; we keep the value of types/shared.ts. */
const normalizeSeverity = (x: unknown): unknown => JSON.parse(JSON.stringify(x).replaceAll('"severity":"warn"', '"severity":"warning"'));

describe('parity with EvoOntology (Python)', () => {
  (cases.browse as object[]).forEach((c, i) => {
    it(`browse #${i}`, () => expect(browse(fileBank, c)).toEqual(golden.browse[i]));
  });

  (cases.resolve as object[]).forEach((c, i) => {
    it(`resolve #${i}`, () => expect(resolve(fileBank, c)).toEqual(normalizeSeverity(golden.resolve[i])));
  });

  it('ours: a mapping keeps its evidence in resolve', () => {
    const r = resolve(bankOf(files), { mentions: ['client type'] }).results[0]!;
    expect(r.status === 'resolved' && r.mappings?.[0]?.evidence_refs).toEqual(['E_client_types']);
  });

  (cases.truncate as string[]).forEach((t, i) => {
    it(`truncate_result #${i}`, () => expect(truncateResult(t)).toEqual(golden.truncate[i]));
  });

  describe('validation: every unresolved reference Python finds, we find', () => {
    /** "relation R_x: unresolved target 'T_y'" → "R_x:target" */
    const pythonKey = (msg: string): string => {
      const m = /^\w+ (\S+): unresolved (evidence ref|term_id|source|target) /.exec(msg);
      if (!m) throw new Error(`unexpected Python error: ${msg}`);
      return `${m[1]}:${m[2] === 'evidence ref' ? 'evidence' : m[2]}`;
    };
    /** "records.R_x.evidence[1]" → "R_x:evidence" */
    const ourKey = (path: string): string => {
      const [, id, field] = /^records\.([^.]+)\.(\w+)/.exec(path) ?? [];
      return `${id}:${field}`;
    };

    for (const [name, { records, errors }] of Object.entries(golden.validate as Record<string, { records: Record<string, Record<string, unknown>[]>; errors: string[] }>)) {
      it(name, () => {
        const bank = bankOf(records);
        const ours = validateBank(bank).errors.filter((e) => e.code === 'SEM_BAD_REFERENCE').map((e) => ourKey(e.path));
        const theirs = errors.map(pythonKey);
        for (const key of theirs) expect(ours).toContain(key);
        // Ours on purpose: mapping evidence refs are checked too (Python's fallback skips them).
        const extra = ours.filter((k) => !theirs.includes(k));
        for (const key of extra) expect(key).toMatch(/^M_\w+:evidence$/);
      });
    }

    it('flags the mapping evidence Python misses', () => {
      const keys = validateBank(bankOf(golden.validate.mapping_evidence.records)).errors.map((e) => e.path);
      expect(keys).toContain('records.M_return.evidence[0]');
    });
  });
});
