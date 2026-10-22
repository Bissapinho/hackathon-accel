// Minimal semantic cards (T-07, 03-data-model §6): the `onProfileDone` hook of 09-work-split §4.2.
// When a dataset version's profile is done, writes into the bank draft, per column, one term
// (status 'card'), one mapping and one profile Evidence; simulated datasets also get a `scope`
// constraint per column term. Reads Part A's meta.datasets / meta.dataset_versions, read-only.
//
// Record ids: kind prefix + dataset slug + "__" + column slug, e.g. T_commandes_netsuite_2025__no_transaction.
// Slugs are lower-case ascii (accents folded) with single underscores, so "__" splits them unambiguously;
// ids do not contain the version, so a new version updates the same records.
//
// Re-runs (new version, or the same one twice) only touch records that still look like the card
// this hook wrote (`isCard`) and whose lifecycle is still 'active'; once the term is enriched or
// superseded, the column's records are left alone. Cards of removed columns are removed from the
// draft (or superseded when another record still points at them); published versions keep them.

import type { ColumnInfo, ColumnProfile, SemOp, SemRecord } from '@mini/shared';
import type { Db } from '../../db/index.js';
import type { OnProfileDone } from '../../ports.js';
import type { SemBank } from './engine/bank.js';
import { fold } from './engine/text.js';
import { RESULT_MAX_CHARS, TO_BE_DEFINED } from './engine/vocab.js';
import type { SemanticStore } from './store.js';
import { semDb, type SemDb } from './tables.js';

// ---------- contract (09 §4.2) ----------

export type ProfileDoneContext = Parameters<OnProfileDone>[0];

/** What `createProfileCards` reports. It never rejects: failures come back as `{ ok: false }` (and are logged). */
export type CardsResult =
  | { ok: true; ops: number; revision: number | null; validationErrors: number; skipped?: string }
  | { ok: false; error: string; code?: string };
export type ProfileCardsHook = (ctx: ProfileDoneContext) => Promise<CardsResult>;

export type CardsDeps = {
  db: Db;
  store: Pick<SemanticStore, 'load' | 'applyDraftOps'>;
  log?: (message: string, error?: unknown) => void;
  /** Attempts when the agent edits the draft at the same time (VERSION_CONFLICT). Default 5. */
  maxAttempts?: number;
};

export type DatasetSnapshot = {
  id: string; name: string; shortId: string; simulated: boolean; currentVersion: number | null;
  version: number; tableName: string; rowCount: number; createdBy: string;
  columns: ColumnInfo[]; profile: ColumnProfile[] | null;
};

/** A failed card run, for the job's `error` (09 §4.2: logged and recorded on the job). */
export class CardsError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'CardsError';
  }
}

/**
 * The hook with the exact 09 §4.2 type. Failure rule: it logs, then rejects with a CardsError whose
 * message goes to the job's `error`. The runner calls it after the profile is stored and catches:
 * a rejection never changes the upload or the profile status.
 */
export function createOnProfileDone(deps: CardsDeps): OnProfileDone {
  const run = createProfileCards(deps);
  return async (ctx) => {
    const result = await run(ctx);
    if (!result.ok) throw new CardsError(result.error, result.code);
  };
}

/** Same work, never rejecting: returns what was done, or `{ ok: false, error }`. */
export function createProfileCards(deps: CardsDeps): ProfileCardsHook {
  const log = deps.log ?? ((message, error) => console.error(message, error));
  return async (ctx) => {
    try {
      return await writeCards(deps, ctx);
    } catch (error) {
      const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined;
      const message = error instanceof Error ? error.message : String(error);
      log(`Minimal semantic cards failed for dataset ${ctx.datasetId} v${ctx.version}: ${message}`, error);
      return { ok: false, error: message, ...(code ? { code } : {}) };
    }
  };
}

async function writeCards(deps: CardsDeps, ctx: ProfileDoneContext): Promise<CardsResult> {
  const ds = await readDataset(semDb(deps.db), ctx);
  if (!ds) throw new Error(`Dataset ${ctx.datasetId} has no version ${ctx.version} in this project.`);
  if (ds.currentVersion !== null && ds.version < ds.currentVersion) {
    return { ok: true, ops: 0, revision: null, validationErrors: 0, skipped: `version ${ds.version} is older than the current version ${ds.currentVersion}` };
  }
  if (!ds.profile) throw new Error(`The profile of ${ds.name} v${ds.version} is not done.`);

  const attempts = deps.maxAttempts ?? 5;
  for (let attempt = 1; ; attempt++) {
    const draft = await deps.store.load(ctx.projectId, 'draft');
    const revision = draft!.info.revision ?? 0;
    const ops = planCardOps(draft!.bank, ds);
    if (!ops.length) return { ok: true, ops: 0, revision, validationErrors: 0 };
    try {
      const out = await deps.store.applyDraftOps(ctx.projectId, { expectedRevision: revision, ops }, { userId: ds.createdBy }, { trusted: true });
      return { ok: true, ops: ops.length, revision: out.revision, validationErrors: out.validation.errors.length };
    } catch (error) {
      if ((error as { code?: string })?.code !== 'VERSION_CONFLICT' || attempt >= attempts) throw error;
    }
  }
}

async function readDataset(db: SemDb, ctx: ProfileDoneContext): Promise<DatasetSnapshot | null> {
  const row = await db.selectFrom('meta.datasets as d')
    .innerJoin('meta.dataset_versions as v', 'v.dataset_id', 'd.id')
    .select(['d.id', 'd.name', 'd.short_id', 'd.simulated', 'd.current_version', 'v.version', 'v.table_name', 'v.row_count', 'v.created_by', 'v.columns', 'v.profile'])
    .where('d.id', '=', ctx.datasetId).where('d.project_id', '=', ctx.projectId).where('v.version', '=', ctx.version)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id, name: row.name, shortId: row.short_id, simulated: row.simulated, currentVersion: row.current_version,
    version: row.version, tableName: row.table_name, rowCount: row.row_count, createdBy: row.created_by,
    columns: row.columns, profile: row.profile,
  };
}

// ---------- planning (pure) ----------

/** Lower-case ascii, accents folded, non-alphanumerics as single underscores: "Lieu Production (é)" → "lieu_production_e". */
export function slugify(text: string): string {
  return fold(text).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}

export function cardIds(datasetSlug: string, columnSlug: string) {
  const key = `${datasetSlug}__${columnSlug}`;
  return { term: `T_${key}`, mapping: `M_${key}`, evidence: `E_${key}`, constraint: `C_${key}__simulated` };
}

/**
 * The dataset's slug in record ids. Dataset names are unique per project, but two names can slug
 * the same ("Ventes 2025" / "ventes-2025"): the second one then gets its short id appended.
 */
export function datasetSlug(bank: SemBank, ds: Pick<DatasetSnapshot, 'id' | 'name' | 'shortId'>): string {
  const slug = slugify(ds.name);
  for (const r of bank.records.values()) {
    if (r.kind === 'mapping' && r.body.id.startsWith(`M_${slug}__`) && r.body.database_source !== ds.id) return `${slug}_${ds.shortId}`;
  }
  return slug;
}

const LOW_CARDINALITY = 50;
const ID_WORDS = new Set(['id', 'no', 'num', 'numero', 'code', 'ref', 'reference', 'key', 'cle', 'uuid', 'sku', 'matricule']);

/**
 * 03-data-model §6: id-like column → entity, low-cardinality string → category, numeric → metric,
 * date → dimension, otherwise concept. "Id-like" = an identifier word in the name (id, no, code…),
 * or a unique / prefix-patterned string with more than 50 distinct values. Booleans are categories.
 */
export function guessTermType(col: ColumnInfo, prof?: ColumnProfile): 'entity' | 'category' | 'metric' | 'dimension' | 'concept' {
  const type = prof?.type ?? col.type;
  const idName = slugify(col.name).split('_').some((w) => ID_WORDS.has(w));
  switch (type) {
    case 'date': case 'timestamp': return 'dimension';
    case 'boolean': return 'category';
    case 'integer': return idName ? 'entity' : 'metric';
    case 'double': return 'metric';
    case 'string': {
      if (idName) return 'entity';
      const distinct = prof?.distinctCount ?? Infinity;
      if (distinct <= LOW_CARDINALITY) return 'category';
      if (prof?.isUnique || prof?.patterns?.length) return 'entity';
      return 'concept';
    }
  }
}

/** The card records of one column, as this hook writes them (Evidence timestamp set by the store). */
export function cardRecords(ds: DatasetSnapshot, slug: string, col: ColumnInfo, prof?: ColumnProfile): SemRecord[] {
  const ids = cardIds(slug, slugify(col.sqlName));
  const records: SemRecord[] = [
    { kind: 'term', lifecycle: 'active', body: {
      id: ids.term, name: col.name, type: guessTermType(col, prof), definition: TO_BE_DEFINED,
      scope: ds.simulated ? `${ds.name} (simulated data)` : ds.name,
      aliases: fold(col.name) === col.sqlName ? [] : [col.sqlName], evidence: [ids.evidence], status: 'card',
    } },
    { kind: 'mapping', lifecycle: 'active', body: {
      id: ids.mapping, term_id: ids.term, database_source: ds.id, table: ds.name, column: col.sqlName, evidence: [ids.evidence],
    } },
    { kind: 'evidence', lifecycle: 'active', body: {
      id: ids.evidence, source: ds.name, result: profileSummary(ds, col, prof), validation_method: PROFILE_METHOD, timestamp: '',
    } },
  ];
  if (ds.simulated) {
    records.push({ kind: 'constraint', lifecycle: 'active', body: {
      id: ids.constraint, target: ids.term, constraint_type: 'scope',
      trigger_keywords: unique([words(ds.name), words(col.name), 'simulated', 'simulé', 'données simulées']),
      severity: 'warning', scope: ds.name, confidence: 1,
      description: `${col.name} comes from ${ds.name}, a simulated dataset: generated data calibrated on real orders, not observed facts. Figures built on it are estimates.`,
      evidence: [ids.evidence],
    } });
  }
  return records;
}

const PROFILE_METHOD = 'column profile computed on the full table at upload';

/** True while a record still has the shape this hook writes (nobody enriched it). */
function isCard(r: SemRecord): boolean {
  switch (r.kind) {
    case 'term': return r.body.status === 'card';
    case 'mapping': return !r.body.semantic_filter && !r.body.aggregation_semantics && !r.body.grain && !r.body.validation && r.body.evidence.length <= 1;
    case 'evidence': return r.body.validation_method === PROFILE_METHOD && !r.body.query;
    case 'constraint': return r.body.constraint_type === 'scope' && !r.body.options?.length && !r.body.resolution;
    case 'relation': return false;
  }
}

const ours = (r: SemRecord | undefined, kind: SemRecord['kind']): boolean => !!r && r.kind === kind && r.lifecycle === 'active' && isCard(r);

/** The draft operations that bring the dataset's cards up to date. Empty when nothing changes. */
export function planCardOps(bank: SemBank, ds: DatasetSnapshot): SemOp[] {
  const ops: SemOp[] = [];
  const slug = datasetSlug(bank, ds);
  const profiles = new Map((ds.profile ?? []).map((p) => [p.column, p]));
  const current = new Set(ds.columns.map((c) => c.sqlName));

  for (const col of ds.columns) {
    const desired = cardRecords(ds, slug, col, profiles.get(col.sqlName) ?? profiles.get(col.name));
    const termId = desired[0]!.body.id;
    const term = bank.records.get(termId);
    if (term && !ours(term, 'term')) continue; // enriched, superseded or not ours: hands off the whole column
    for (const record of desired) {
      const existing = bank.records.get(record.body.id);
      if (!existing || (ours(existing, record.kind) && !sameCard(existing, record))) {
        ops.push({ op: 'upsertRecord', record: { kind: record.kind, lifecycle: record.lifecycle, body: record.body } as Extract<SemOp, { op: 'upsertRecord' }>['record'] });
      }
    }
    const constraintId = cardIds(slug, slugify(col.sqlName)).constraint;
    if (!ds.simulated && ours(bank.records.get(constraintId), 'constraint')) ops.push(...retire(bank, [constraintId]));
  }

  // Columns gone from this version: retire their cards when the term is still a card.
  const gone: string[] = [];
  for (const r of bank.records.values()) {
    if (r.kind !== 'mapping' || r.body.database_source !== ds.id || current.has(r.body.column)) continue;
    const ids = cardIds(slug, slugify(r.body.column));
    if (r.body.id !== ids.mapping) continue;
    const term = bank.records.get(ids.term);
    if (term && !ours(term, 'term')) continue;
    gone.push(...(['term', 'mapping', 'evidence', 'constraint'] as const)
      .filter((k) => ours(bank.records.get(ids[k]), k)).map((k) => ids[k]));
  }
  ops.push(...retire(bank, gone));
  return ops;
}

/**
 * Removes the records, or supersedes those a kept record still references (a superseded record is
 * kept, so what it references is kept too: repeated until nothing changes).
 */
function retire(bank: SemBank, ids: string[]): SemOp[] {
  const removed = new Set(ids);
  const refsOf = (r: SemRecord): unknown[] => {
    const b = r.body as Record<string, unknown>;
    return [b.term_id, b.source, b.target, ...(Array.isArray(b.evidence) ? b.evidence : [])];
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const r of bank.records.values()) {
      if (removed.has(r.body.id)) continue;
      for (const ref of refsOf(r)) {
        if (typeof ref === 'string' && removed.delete(ref)) changed = true;
      }
    }
  }
  return ids.map((id): SemOp => (removed.has(id) ? { op: 'remove', recordId: id } : { op: 'setLifecycle', recordId: id, lifecycle: 'superseded' }));
}

function sameCard(a: SemRecord, b: SemRecord): boolean {
  const strip = (r: SemRecord) => (r.kind === 'evidence' ? { ...r.body, timestamp: '' } : r.body);
  return canon(strip(a)) === canon(strip(b)) && a.lifecycle === b.lifecycle;
}

/** JSON with sorted keys (jsonb does not keep key order). */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// ---------- profile summary (Evidence result, ≤ 2 KB) ----------

const cut = (v: unknown, n = 40): string => {
  const s = v === null || v === undefined ? '(empty)' : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const num = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ');

export function profileSummary(ds: DatasetSnapshot, col: ColumnInfo, prof?: ColumnProfile): string {
  const lines = [`Profile of ${ds.name} version ${ds.version} (table ${ds.tableName}), column ${col.name} (${col.sqlName}).`];
  if (!prof) {
    lines.push(`Type ${col.type}; no profile was computed for this column.`);
  } else {
    const pct = prof.rowCount ? ` (${((100 * prof.nullCount) / prof.rowCount).toFixed(1)} %)` : '';
    lines.push(`Type ${prof.type}; ${num(prof.rowCount)} rows; ${num(prof.nullCount)} empty${pct}; ${num(prof.distinctCount)} distinct values${prof.isUnique ? ', all unique' : ''}.`);
    if (prof.min !== undefined || prof.max !== undefined) lines.push(`Range: ${cut(prof.min)} to ${cut(prof.max)}.`);
    if (prof.patterns?.length) lines.push(`Prefixes: ${prof.patterns.slice(0, 5).map((p) => `${cut(p.pattern, 20)} ${num(p.count)}`).join(', ')}.`);
    if (prof.topValues.length) lines.push(`Top values: ${prof.topValues.slice(0, 10).map((t) => `${cut(t.value)} (${num(t.count)})`).join(', ')}.`);
  }
  if (col.sample.length) lines.push(`Sample: ${col.sample.slice(0, 5).map((s) => cut(s)).join(', ')}.`);
  const text = lines.join('\n');
  return text.length > RESULT_MAX_CHARS ? `${text.slice(0, RESULT_MAX_CHARS - 1)}…` : text;
}

// ---------- helpers ----------

/** Readable words of a name, digits-only words dropped: "CAPACITE_CUISINES_JOUR_2025" → "capacite cuisines jour". */
function words(name: string): string {
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !/^\d+$/.test(w)).join(' ');
}

const unique = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];
