// browse_semantics, resolve_semantics and the session manifest over one bank version.
// Ported from EvoOntology runtime/runtime.py (SemanticLayer),
// https://github.com/ruc-datalab/EvoOntology, MIT, Copyright (c) 2026 Meiduo Chong.
//
// `browse` and `resolve` return EvoOntology's result shapes unchanged (parity-tested against the
// Python code); `toBrowseResult` / `toResolveResult` turn them into our API types (types/shared.ts).

import { constraints, counts, isActive, mappings, relations, terms, type SemBank } from './bank.js';
import { fold, hasContradictoryTokens, intersect, tokens } from './text.js';
import type { BrowseResult, ResolveResult, SemConstraint, SemEvidence, SemKind, SemMapping, SemRecord, SemTerm } from '@mini/shared';
import { MAX_BROWSE_ITEMS, MAX_RESOLVE_MENTIONS } from './vocab.js';

// ---------- browse ----------

export type BrowseKind = 'term' | 'mapping' | 'relation' | 'constraint' | 'all';
export type BrowseItem = {
  id: string; name: string; type: string; scope: string; availability: string;
  match_rationale: { phrase_match: boolean; overlap_tokens: string[] };
};
export type BrowseOutput =
  | { status: 'needs_query'; items: []; catalog_total: number; version: string; note: string }
  | { status: 'ok'; items: BrowseItem[]; matched_total: number; catalog_total: number; version: string; note: string };

const BROWSABLE: SemKind[] = ['term', 'mapping', 'relation', 'constraint'];

function browseView(record: SemRecord): Omit<BrowseItem, 'match_rationale'> & { searchText: string } {
  const b = record.body as Record<string, unknown>;
  const str = (k: string): string => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const list = (k: string): string => (Array.isArray(b[k]) ? (b[k] as string[]).join(' ') : '');
  let name = record.kind === 'term' ? str('name') : '';
  if (!name && record.kind === 'mapping') name = `${str('term_id')} -> ${str('table')}`;
  else if (!name && record.kind === 'relation') name = str('relation_type') || `${str('source')} -> ${str('target')}`;
  else if (!name && record.kind === 'constraint') name = str('constraint_type') || record.body.id;
  return {
    id: record.body.id,
    name,
    type: record.kind === 'term' ? str('type') : record.kind,
    scope: record.kind === 'term' || record.kind === 'constraint' ? str('scope') : '',
    availability: record.lifecycle,
    searchText: [
      name, str('definition'), str('description'), list('aliases'), str('term_id'), str('source'), str('target'),
      str('relation_type'), str('constraint_type'), list('trigger_keywords'), str('table'), str('column'),
    ].filter(Boolean).join(' '),
  };
}

export function browse(bank: SemBank, input: { query?: string; kind?: string; limit?: number }): BrowseOutput {
  const query = fold(String(input.query ?? '').trim());
  let kind = String(input.kind ?? 'term').toLowerCase() as BrowseKind;
  if (!['term', 'mapping', 'relation', 'constraint', 'all'].includes(kind)) kind = 'term';
  const limit = Math.max(1, Math.min(Math.trunc(Number(input.limit) || MAX_BROWSE_ITEMS), MAX_BROWSE_ITEMS));

  const kinds = kind === 'all' ? BROWSABLE : [kind];
  const items = kinds.flatMap((k) => [...bank.records.values()].filter((r) => r.kind === k && isActive(r)).map(browseView));

  if (!query) {
    return {
      status: 'needs_query', items: [], catalog_total: items.length, version: bank.version,
      note: 'Provide a specific query. Full-catalog enumeration is disabled.',
    };
  }

  const queryTokens = tokens(query);
  const ranked: [number, BrowseItem][] = [];
  for (const { searchText, ...item } of items) {
    const itemTokens = tokens(searchText);
    if (hasContradictoryTokens(queryTokens, itemTokens)) continue;
    const overlap = intersect(queryTokens, itemTokens);
    const phraseMatch = fold(searchText).includes(query);
    if (!overlap.length && !phraseMatch) continue;
    ranked.push([(phraseMatch ? 2 : 0) + overlap.length, { ...item, match_rationale: { phrase_match: phraseMatch, overlap_tokens: overlap } }]);
  }
  ranked.sort((a, b) => b[0] - a[0] || compareIds(a[1].id, b[1].id));

  return {
    status: 'ok', items: ranked.slice(0, limit).map(([, item]) => item), matched_total: ranked.length,
    catalog_total: items.length, version: bank.version,
    note: 'Only query-relevant items are returned; this is not an analysis checklist.',
  };
}

/** Python sorts ids by code point; localeCompare would not. */
const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------- resolve ----------

type TermView = { id: string; type: string; name: string; aliases: string[]; definition: string; scope: string; evidence_refs: string[] };
export type ResolvedItem = {
  query: string; query_type: 'mention' | 'semantic_id'; status: 'resolved' | 'ambiguous'; match_rationale: string;
  term: TermView;
  mappings?: { id: string; term_id: string; table: string; column: string; semantic_filter: string; aggregation_semantics: string; grain: string; evidence_refs: string[] }[];
  relations?: { id: string; relation_type: string; source: string; target: string; connection_condition: string; evidence_refs: string[] }[];
  constraints?: { id: string; severity: string; description: string; evidence_refs: string[] }[];
  evidence?: { id: string; source: string; query: string; result: string; validation_method: string; timestamp: string }[];
  coverage_status?: 'supported' | 'partial';
};
export type ResolveEntry =
  | ResolvedItem
  | { query: string; query_type: 'mention'; status: 'unresolved'; match_rationale: string; candidates: []; coverage_status?: 'unavailable' }
  | { query: string; query_type: 'mention'; status: 'ambiguous'; match_rationale: string; candidates: ResolvedItem[]; coverage_status?: 'partial' };
export type ResolveOutput = {
  status: 'ok' | 'partial'; results: ResolveEntry[]; requested_count: number; processed_count: number;
  skipped: { query_type: 'mention'; query: string }[]; version: string; note: string;
};

type Candidate = [SemTerm, string];

export function resolve(bank: SemBank, input: { mentions?: string[]; context?: string }): ResolveOutput {
  const raw = (input.mentions ?? []).map((m) => String(m).trim()).filter(Boolean);
  const accepted = raw.slice(0, MAX_RESOLVE_MENTIONS);
  const skipped = raw.slice(MAX_RESOLVE_MENTIONS);

  const results: ResolveEntry[] = [];
  for (const original of accepted) {
    const mention = original.toLowerCase();
    const direct = bank.records.get(original) ?? bank.records.get(mention);
    if (direct?.kind === 'term' && isActive(direct)) {
      results.push(buildResult(bank, mention, direct.body, `semantic id lookup: '${direct.body.id}'`, 'resolved', 'semantic_id'));
      continue;
    }
    const candidates = matchMention(bank, mention);
    if (!candidates.length) {
      results.push({
        query: mention, query_type: 'mention', status: 'unresolved',
        match_rationale: `No active term matching '${mention}'. Inspect the data directly.`, candidates: [],
      });
    } else if (candidates.length === 1) {
      const [term, rationale] = candidates[0]!;
      results.push(buildResult(bank, mention, term, rationale, 'resolved'));
    } else {
      const picked = disambiguate(mention, candidates, input.context);
      if (picked) results.push(buildResult(bank, mention, picked[0], picked[1], 'resolved'));
      else {
        results.push({
          query: mention, query_type: 'mention', status: 'ambiguous',
          match_rationale: `${candidates.length} terms match '${mention}'`,
          candidates: candidates.map(([t, why]) => buildResult(bank, mention, t, why, 'ambiguous')),
        });
      }
    }
  }

  for (const r of results) {
    if (r.status === 'unresolved') r.coverage_status = 'unavailable';
    else if (r.status === 'ambiguous') r.coverage_status = 'partial';
    else r.coverage_status = r.mappings || r.relations || r.constraints ? 'supported' : 'partial';
  }

  return {
    status: skipped.length ? 'partial' : 'ok',
    results,
    requested_count: raw.length,
    processed_count: accepted.length,
    skipped: skipped.map((query) => ({ query_type: 'mention', query })),
    version: bank.version,
    note: skipped.length ? 'Resolve is limited to 5 relevant concepts.' : 'Use these mappings only for the current analysis need.',
  };
}

function matchMention(bank: SemBank, mention: string): Candidate[] {
  const exactName: Candidate[] = [];
  const exactAlias: Candidate[] = [];
  const substring: Candidate[] = [];
  const m = fold(mention);
  const mentionTokens = tokens(mention);
  for (const term of terms(bank, true)) {
    if (m === fold(term.name)) exactName.push([term, `exact name match: '${term.name}'`]);
    else if ((term.aliases ?? []).some((a) => m === fold(a))) exactAlias.push([term, `exact alias match: term '${term.name}'`]);
    else if (mentionTokens.size && [...mentionTokens].every((t) => tokens([term.name, ...(term.aliases ?? [])].join(' ')).has(t))) {
      substring.push([term, `substring match: term '${term.name}'`]);
    }
  }
  return exactName.length ? exactName : exactAlias.length ? exactAlias : substring;
}

function disambiguate(mention: string, candidates: Candidate[], context?: string): Candidate | null {
  const contextTokens = tokens(context ?? '');
  if (!contextTokens.size) return null;
  const scored = candidates.map(([t]) => {
    const text = [t.name, (t.aliases ?? []).join(' '), t.definition ?? '', t.scope ?? ''].join(' ');
    return [intersect(contextTokens, tokens(text)).length, t] as const;
  });
  scored.sort((a, b) => b[0] - a[0] || compareIds(a[1].id, b[1].id));
  const [best, second] = scored;
  if (!best || best[0] === 0) return null;
  if (second && best[0] === second[0]) return null;
  return [best[1], `context-disambiguated match: '${mention}'`];
}

function buildResult(bank: SemBank, query: string, term: SemTerm, rationale: string, status: 'resolved' | 'ambiguous', queryType: 'mention' | 'semantic_id' = 'mention'): ResolvedItem {
  const result: ResolvedItem = {
    query, query_type: queryType, status, match_rationale: rationale,
    term: {
      id: term.id, type: term.type ?? '', name: term.name ?? '', aliases: [...(term.aliases ?? [])],
      definition: term.definition ?? '', scope: term.scope ?? '', evidence_refs: [...(term.evidence ?? [])],
    },
  };
  const ms = mappings(bank, true).filter((m) => m.term_id === term.id);
  const rs = relations(bank, true).filter((r) => r.source === term.id || r.target === term.id);
  const cs = constraints(bank, true).filter((c) => c.target === term.id);
  if (ms.length) {
    result.mappings = ms.map((m) => ({
      id: m.id, term_id: m.term_id, table: m.table, column: m.column, semantic_filter: m.semantic_filter ?? '',
      aggregation_semantics: m.aggregation_semantics ?? '', grain: m.grain ?? '', evidence_refs: [...m.evidence],
    }));
  }
  if (rs.length) {
    result.relations = rs.map((r) => ({
      id: r.id, relation_type: r.relation_type, source: r.source, target: r.target,
      connection_condition: r.connection_condition ?? '', evidence_refs: [...r.evidence],
    }));
  }
  if (cs.length) result.constraints = cs.map((c) => ({ id: c.id, severity: c.severity, description: c.description ?? '', evidence_refs: [...c.evidence] }));

  const ids = [...(term.evidence ?? []), ...ms.flatMap((m) => m.evidence), ...rs.flatMap((r) => r.evidence), ...cs.flatMap((c) => c.evidence)];
  const views = evidenceViews(bank, ids).map((e) => ({
    id: e.id, source: e.source ?? '', query: e.query ?? '', result: e.result ?? '', validation_method: e.validation_method ?? '', timestamp: e.timestamp ?? '',
  }));
  if (views.length) result.evidence = views;
  return result;
}

/** Evidence records for the given ids, deduplicated, in order, skipping missing ones. */
function evidenceViews(bank: SemBank, ids: string[]): SemEvidence[] {
  const seen = new Set<string>();
  const out: SemEvidence[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const r = bank.records.get(id);
    if (r?.kind === 'evidence') out.push(r.body);
  }
  return out;
}

// ---------- manifest ----------

/** Short description of the version for the agent's session facts. */
export function manifest(bank: SemBank): string {
  if (bank.version === 'uninitialized') {
    return 'Semantic bank: not published yet.\n\nNo version of the bank has been published for this project. Build it in semantics mode first.';
  }
  const c = counts(bank);
  const active = constraints(bank, true);
  const bySeverity = new Map<string, number>();
  for (const x of active) bySeverity.set(x.severity, (bySeverity.get(x.severity) ?? 0) + 1);
  const severities = [...bySeverity].sort(([a], [b]) => compareIds(a, b)).map(([s, n]) => `${s}=${n}`).join(', ');
  return [
    `Semantic bank version: ${bank.version}`,
    `Records: ${c.terms} terms (${c.enriched} enriched), ${c.mappings} mappings, ${c.relations} relations, ${c.constraints} constraints, ${c.evidence} evidence records.`,
    `Active constraints: ${active.length}${severities ? ` (${severities})` : ''}`,
    '',
    '- browse_semantics(query, kind, limit) finds up to 6 records relevant to a specific need.',
    '- resolve_semantics(mentions, context) turns up to 5 concepts into grounded mappings, relations, constraints and evidence.',
    'Call resolve_semantics with the concepts you plan to use before writing SQL. Resolved mappings are guidance: check them against the data.',
  ].join('\n');
}

// ---------- our API shapes ----------

function summaryOf(record: SemRecord | undefined): string {
  if (!record) return '';
  switch (record.kind) {
    case 'term': return record.body.definition;
    case 'mapping': return `${record.body.table}.${record.body.column}${record.body.grain ? ` (${record.body.grain})` : ''}`;
    case 'relation': return record.body.description;
    case 'constraint': return record.body.description;
    case 'evidence': return record.body.validation_method;
  }
}

export function toBrowseResult(bank: SemBank, out: BrowseOutput): BrowseResult {
  return out.items.map((item) => {
    const record = bank.records.get(item.id);
    const { phrase_match, overlap_tokens } = item.match_rationale;
    const why = [phrase_match ? 'contains the whole query' : '', overlap_tokens.length ? `shared words: ${overlap_tokens.join(', ')}` : '']
      .filter(Boolean).join('; ');
    return {
      id: item.id,
      kind: record?.kind ?? 'term',
      name: item.name,
      summary: summaryOf(record),
      score: (phrase_match ? 2 : 0) + overlap_tokens.length,
      why,
    };
  });
}

/**
 * Our resolve result: full records instead of EvoOntology's compact views, and also the
 * constraints that target one of the term's mappings (ours: constraints may target a mapping).
 */
export function toResolveResult(bank: SemBank, out: ResolveOutput): ResolveResult {
  return {
    version: out.version,
    mentions: out.results.map((r) => {
      if (r.status === 'unresolved') return { mention: r.query, mappings: [], constraints: [], evidence: [] };
      if ('candidates' in r) {
        return {
          mention: r.query, mappings: [], constraints: [], evidence: [],
          ambiguous: { candidates: r.candidates.map((c) => ({ id: c.term.id, name: c.term.name, why: c.match_rationale })) },
        };
      }
      const term = bank.records.get(r.term.id)?.body as SemTerm;
      const ms: SemMapping[] = mappings(bank, true).filter((m) => m.term_id === term.id);
      const targets = new Set([term.id, ...ms.map((m) => m.id)]);
      const cs: SemConstraint[] = constraints(bank, true).filter((c) => targets.has(c.target));
      const rs = relations(bank, true).filter((x) => x.source === term.id || x.target === term.id);
      const ev = evidenceViews(bank, [...term.evidence, ...ms.flatMap((m) => m.evidence), ...rs.flatMap((x) => x.evidence), ...cs.flatMap((c) => c.evidence)]);
      return { mention: r.query, term, mappings: ms, constraints: cs, evidence: ev };
    }),
  };
}
