// Validation of one bank version (04-api §5, semantic bank codes).
// The reference checks are ported from EvoOntology validate.py
// (https://github.com/ruc-datalab/EvoOntology, MIT, Copyright (c) 2026 Meiduo Chong);
// vocabularies, required fields, procedural content, decisions, question coverage and the
// dataset catalog are ours.

import { isOpenDecision, type SemBank } from './bank.js';
import type { FieldError, SemRecord, Validation, WorkloadQuestion } from '@mini/shared';
import { CONSTRAINT_TYPES, LIFECYCLES, RELATION_TYPES, SEM_KINDS, SEVERITIES, TERM_STATUSES, TERM_TYPES, TO_BE_DEFINED } from './vocab.js';

/** The datasets mappings may point at: `database_source` = id, `table` = name, `column` = a column sqlName. */
export type DatasetCatalog = { datasets: { id: string; name: string; columns: string[] }[] };

export type ValidateOptions = {
  catalog?: DatasetCatalog;
  workload?: WorkloadQuestion[];
  questionLinks?: Record<string, string[]>;
  /** At publish, open decisions are errors instead of warnings. */
  forPublish?: boolean;
};

export type { Validation };

const SQL_PATTERNS = [
  /\bSELECT\b/,
  /\bselect\b[\s\S]{0,300}?\bfrom\b/i,
  /\b(insert\s+into|delete\s+from|drop\s+(table|view|schema)|create\s+(table|view|index)|alter\s+table|truncate\s+table)\b/i,
  /\bupdate\s+[\w."]+\s+set\b/i,
  /\bjoin\s+[\w."]+\s+on\b/i,
  /\b(group|order)\s+by\b/i,
  /\bcount\s*\(\s*\*\s*\)/i,
];
const INSTRUCTION_PATTERNS = [
  /\b(you|the agent|agents?)\s+(must|should|need to|have to)\b/i,
  /\b(always|never)\s+(use|call|run|query|join|filter|ask)\b/i,
  /\bcall\s+(the\s+)?(tool|browse_semantics|resolve_semantics|run_sql)\b/i,
  /\bvous\s+devez\b/i,
  /\bl['’]agent\s+doit\b/i,
];

/** Free-text fields that hold meaning only (no SQL, no instructions). Evidence `query` is the only SQL. */
const TEXT_FIELDS: Record<SemRecord['kind'], string[]> = {
  term: ['name', 'definition', 'scope'],
  mapping: ['semantic_filter', 'aggregation_semantics', 'grain', 'validation'],
  relation: ['connection_condition', 'description'],
  constraint: ['description', 'scope'],
  evidence: ['validation_method'],
};

export function looksProcedural(text: string): 'SQL' | 'instructions' | null {
  if (SQL_PATTERNS.some((p) => p.test(text))) return 'SQL';
  if (INSTRUCTION_PATTERNS.some((p) => p.test(text))) return 'instructions';
  return null;
}

export function validateBank(bank: SemBank, opts: ValidateOptions = {}): Validation {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const warn = (path: string, code: string, message: string) => warnings.push({ path, code, message });

  const kindOf = (id: string) => bank.records.get(id)?.kind;
  const at = (id: string, field?: string) => `records.${id}${field ? `.${field}` : ''}`;
  const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
  const datasets = new Map((opts.catalog?.datasets ?? []).map((d) => [d.id, d]));

  for (const [id, record] of bank.records) {
    if (!SEM_KINDS.includes(record.kind)) { err(at(id), 'SEM_BAD_VOCABULARY', `Unknown record kind "${record.kind}".`); continue; }
    if (!LIFECYCLES.includes(record.lifecycle)) err(at(id, 'lifecycle'), 'SEM_BAD_VOCABULARY', `Unknown lifecycle "${record.lifecycle}".`);
    const body = record.body as Record<string, unknown>;
    if (!nonEmpty(body.id)) { err(at(id, 'id'), 'SEM_MISSING_FIELD', 'Every record needs an id.'); continue; }

    // Evidence references (EvoOntology: "unresolved evidence ref").
    if (record.kind !== 'evidence') {
      const refs = Array.isArray(body.evidence) ? (body.evidence as unknown[]) : [];
      refs.forEach((ref, i) => {
        if (kindOf(String(ref)) !== 'evidence') err(at(id, `evidence[${i}]`), 'SEM_BAD_REFERENCE', `Evidence "${String(ref)}" doesn't exist in this version.`);
      });
    }

    for (const field of TEXT_FIELDS[record.kind]) {
      const value = body[field];
      const what = typeof value === 'string' ? looksProcedural(value) : null;
      if (what) err(at(id, field), 'SEM_PROCEDURAL_CONTENT', `"${field}" contains ${what}. The bank holds meaning only: describe it in words, and put SQL in an Evidence query.`);
    }

    switch (record.kind) {
      case 'term': {
        const t = record.body;
        if (!nonEmpty(t.name)) err(at(id, 'name'), 'SEM_MISSING_FIELD', 'A term needs a name.');
        if (!TERM_TYPES.includes(t.type)) err(at(id, 'type'), 'SEM_BAD_VOCABULARY', `Term type "${t.type}" is not one of ${TERM_TYPES.join(', ')}.`);
        if (!TERM_STATUSES.includes(t.status)) err(at(id, 'status'), 'SEM_BAD_VOCABULARY', `Term status "${t.status}" is not one of ${TERM_STATUSES.join(', ')}.`);
        if (t.status === 'enriched' && (!nonEmpty(t.definition) || t.definition.trim().toLowerCase() === TO_BE_DEFINED)) {
          err(at(id, 'definition'), 'SEM_MISSING_FIELD', `Term "${t.name}" is enriched but has no definition.`);
        }
        break;
      }
      case 'mapping': {
        const m = record.body;
        for (const f of ['term_id', 'database_source', 'table', 'column'] as const) {
          if (!nonEmpty(m[f])) err(at(id, f), 'SEM_MISSING_FIELD', `A mapping needs "${f}".`);
        }
        if (nonEmpty(m.term_id) && kindOf(m.term_id) !== 'term') err(at(id, 'term_id'), 'SEM_BAD_REFERENCE', `Term "${m.term_id}" doesn't exist in this version.`);
        // Only an active mapping must point at a live column: a superseded one may name a column that is gone.
        if (opts.catalog && record.lifecycle === 'active' && nonEmpty(m.database_source)) {
          const ds = datasets.get(m.database_source);
          if (!ds) err(at(id, 'database_source'), 'SEM_BAD_REFERENCE', `Dataset "${m.database_source}" doesn't exist in this project.`);
          else {
            if (m.table !== ds.name) err(at(id, 'table'), 'SEM_BAD_REFERENCE', `Dataset "${m.database_source}" is named "${ds.name}", not "${m.table}".`);
            if (nonEmpty(m.column) && !ds.columns.includes(m.column)) err(at(id, 'column'), 'SEM_BAD_REFERENCE', `Dataset "${ds.name}" has no column "${m.column}".`);
          }
        }
        break;
      }
      case 'relation': {
        const r = record.body;
        if (!RELATION_TYPES.includes(r.relation_type)) {
          err(at(id, 'relation_type'), 'SEM_BAD_VOCABULARY', `Relation type "${r.relation_type}" is not one of ${RELATION_TYPES.join(', ')}.`);
        }
        for (const end of ['source', 'target'] as const) {
          if (!nonEmpty(r[end])) err(at(id, end), 'SEM_MISSING_FIELD', `A relation needs a ${end} term.`);
          else if (kindOf(r[end]) !== 'term') err(at(id, end), 'SEM_BAD_REFERENCE', `Relation ${end} "${r[end]}" is not a term of this version.`);
        }
        if (r.keys?.length) {
          r.keys.forEach((k, i) => {
            if (!nonEmpty(k.fromColumn) || !nonEmpty(k.toColumn)) err(at(id, `keys[${i}]`), 'SEM_MISSING_FIELD', 'A relation key needs fromColumn and toColumn.');
          });
          const checked = (r.evidence ?? []).some((e) => {
            const ev = bank.records.get(e);
            return ev?.kind === 'evidence' && /\bjoin\b/i.test(ev.body.query ?? '');
          });
          if (!checked) warn(at(id, 'keys'), 'SEM_RELATION_KEYS_UNCHECKED', 'The relation has join keys but no Evidence join query backs them.');
        }
        break;
      }
      case 'constraint': {
        const c = record.body;
        if (!CONSTRAINT_TYPES.includes(c.constraint_type)) {
          err(at(id, 'constraint_type'), 'SEM_BAD_VOCABULARY', `Constraint type "${c.constraint_type}" is not one of ${CONSTRAINT_TYPES.join(', ')}.`);
        }
        if (!(SEVERITIES as readonly string[]).includes(c.severity)) err(at(id, 'severity'), 'SEM_BAD_VOCABULARY', `Severity "${c.severity}" is not one of ${SEVERITIES.join(', ')}.`);
        if (!nonEmpty(c.target)) err(at(id, 'target'), 'SEM_MISSING_FIELD', 'A constraint needs a target term or mapping.');
        else if (kindOf(c.target) !== 'term' && kindOf(c.target) !== 'mapping') {
          err(at(id, 'target'), 'SEM_BAD_REFERENCE', `Constraint target "${c.target}" is not a term or mapping of this version.`);
        }
        if (!Array.isArray(c.trigger_keywords) || !c.trigger_keywords.some(nonEmpty)) {
          err(at(id, 'trigger_keywords'), 'SEM_MISSING_FIELD', 'A constraint needs trigger keywords: the words in a question that should surface it.');
        }
        if (!nonEmpty(c.description)) err(at(id, 'description'), 'SEM_MISSING_FIELD', 'A constraint needs a description.');
        if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) {
          err(at(id, 'confidence'), 'SEM_MISSING_FIELD', 'Confidence must be a number from 0 to 1.');
        }
        if (c.resolution && c.options?.length && !c.options.includes(c.resolution.choice)) {
          err(at(id, 'resolution.choice'), 'SEM_BAD_VOCABULARY', `"${c.resolution.choice}" is not one of the options of this decision.`);
        }
        if (record.lifecycle === 'active' && isOpenDecision(c)) {
          const message = `Decision "${c.description}" is still open: the user must choose one of ${c.options!.join(' / ')}.`;
          if (opts.forPublish) err(at(id, 'resolution'), 'SEM_OPEN_DECISION', message);
          else warn(at(id, 'resolution'), 'SEM_OPEN_DECISION', message);
        }
        break;
      }
      case 'evidence': {
        const e = record.body;
        if (!nonEmpty(e.source)) err(at(id, 'source'), 'SEM_MISSING_FIELD', 'Evidence needs a source (the dataset or pipeline output observed).');
        if (!nonEmpty(e.query) && !nonEmpty(e.result)) {
          err(at(id, 'query'), 'SEM_MISSING_FIELD', 'Evidence needs a query the server can run (or, for profile cards, a result).');
        }
        break;
      }
    }
  }

  // Question links (EvoOntology `annotate`): known questions, known records; picked questions covered.
  const links = opts.questionLinks ?? {};
  const questionIds = new Set((opts.workload ?? []).map((q) => q.id));
  for (const [qid, recordIds] of Object.entries(links)) {
    if (opts.workload && !questionIds.has(qid)) err(`questionLinks.${qid}`, 'SEM_BAD_REFERENCE', `Question "${qid}" is not in the workload.`);
    recordIds.forEach((rid, i) => {
      if (!bank.records.has(rid)) err(`questionLinks.${qid}[${i}]`, 'SEM_BAD_REFERENCE', `Record "${rid}" doesn't exist in this version.`);
    });
  }
  for (const q of opts.workload ?? []) {
    if (q.picked && !(links[q.id]?.length)) {
      warn(`questionLinks.${q.id}`, 'SEM_UNCOVERED_QUESTION', `Question "${q.text}" is linked to no record: cover it, or say why in the limitations.`);
    }
  }

  return { errors, warnings };
}
