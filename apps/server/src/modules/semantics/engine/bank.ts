// In-memory view of one version of the semantic bank: what the store loads and what
// validation, browse and resolve work on. Plays the role of EvoOntology's SemanticStore
// (ontology/store.py) once the records are loaded.

import type { SemConstraint, SemEvidence, SemKind, SemMapping, SemRecord, SemRelation, SemTerm, SemVersionInfo } from '@mini/shared';

export type SemBank = {
  version: string;                    // 'draft', 'v0', 'v1'… or 'uninitialized'
  records: Map<string, SemRecord>;    // by record id, in load order
};

type BodyOf<K extends SemKind> = Extract<SemRecord, { kind: K }>['body'];

export function bankFromRecords(version: string, records: Iterable<SemRecord>): SemBank {
  const map = new Map<string, SemRecord>();
  for (const r of records) map.set(r.body.id, r);
  return { version, records: map };
}

export const emptyBank = (): SemBank => ({ version: 'uninitialized', records: new Map() });

export const isActive = (r: SemRecord): boolean => r.lifecycle === 'active';

/** Records of one kind, optionally only the active ones. */
export function recordsOf<K extends SemKind>(bank: SemBank, kind: K, activeOnly = false): BodyOf<K>[] {
  const out: BodyOf<K>[] = [];
  for (const r of bank.records.values()) {
    if (r.kind === kind && (!activeOnly || isActive(r))) out.push(r.body as BodyOf<K>);
  }
  return out;
}

export const terms = (b: SemBank, activeOnly = false): SemTerm[] => recordsOf(b, 'term', activeOnly);
export const mappings = (b: SemBank, activeOnly = false): SemMapping[] => recordsOf(b, 'mapping', activeOnly);
export const relations = (b: SemBank, activeOnly = false): SemRelation[] => recordsOf(b, 'relation', activeOnly);
export const constraints = (b: SemBank, activeOnly = false): SemConstraint[] => recordsOf(b, 'constraint', activeOnly);
export const evidence = (b: SemBank, activeOnly = false): SemEvidence[] => recordsOf(b, 'evidence', activeOnly);

/** A constraint that asks the user to choose a reading and has no answer yet. */
export const isOpenDecision = (c: SemConstraint): boolean =>
  c.severity === 'block' && (c.options?.length ?? 0) > 0 && !c.resolution;

export function counts(bank: SemBank): SemVersionInfo['counts'] {
  const ts = terms(bank);
  return {
    terms: ts.length,
    enriched: ts.filter((t) => t.status === 'enriched').length,
    mappings: mappings(bank).length,
    relations: relations(bank).length,
    constraints: constraints(bank).length,
    openDecisions: constraints(bank, true).filter(isOpenDecision).length,
    evidence: evidence(bank).length,
  };
}

/** Next official version name after the given ones: v0, v1, … */
export function nextVersionName(existing: string[]): string {
  const numbers = existing.map((v) => /^v(\d+)$/.exec(v)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  return `v${numbers.length ? Math.max(...numbers) + 1 : 0}`;
}
