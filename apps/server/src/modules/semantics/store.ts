// Versioned semantic bank on Postgres (meta.sem_* tables of schema.sql): one draft per project with
// a revision for optimistic locking, immutable published versions v0, v1…, one active version.
// Replaces EvoOntology's file store (ontology/store.py): versions/<v>/*.json → sem_records rows,
// active.json → sem_versions.status = 'active'.

import type {
  BrowseResult, ResolveResult, SemOp, SemRecord, SemVersionInfo, Trajectory, Validation, Workload,
} from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import { ApiError, notFound } from '../../errors.js';
import {
  applyOps, bankFromRecords, browse, counts, emptyBank, nextVersionName, resolve, toBrowseResult, toResolveResult,
  validateBank, type DatasetCatalog, type NewTrajectory, type SemBank,
} from './engine/index.js';
import { checkReadOnlySql } from '../sql/parse.js';
import { semDb, type SemDb, type SemTrx } from './tables.js';

export type Actor = { userId: string };
export type VersionRef = 'active' | 'draft' | string;
export type LoadedVersion = { info: SemVersionInfo; bank: SemBank };

export type StoreOptions = {
  /** The datasets mappings are checked against; default: the project's datasets at their current version. */
  catalog?: (db: SemDb, projectId: string) => Promise<DatasetCatalog | undefined>;
  runEvidenceQuery?: (projectId: string, query: string) => Promise<string>;
  now?: () => Date;
};

const DRAFT = 'draft';

export class SemanticStore {
  private readonly db: SemDb;

  constructor(db: Db, private readonly opts: StoreOptions = {}) {
    this.db = semDb(db);
  }

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  // ---------- versions ----------

  async activeVersion(projectId: string, db: SemDb = this.db): Promise<string | null> {
    const row = await db.selectFrom('meta.sem_versions').select('version')
      .where('project_id', '=', projectId).where('status', '=', 'active').executeTakeFirst();
    return row?.version ?? null;
  }

  async listVersions(projectId: string): Promise<{ version: string; status: string; summary: string; limitations: string[]; publishedBy: string | null; at: string | null }[]> {
    const rows = await this.db.selectFrom('meta.sem_versions')
      .select(['version', 'status', 'summary', 'limitations', 'published_by', 'published_at'])
      .where('project_id', '=', projectId).where('status', '!=', 'draft').execute();
    return rows
      .sort((a, b) => Number(a.version.slice(1)) - Number(b.version.slice(1)))
      .map((r) => ({ version: r.version, status: r.status, summary: r.summary, limitations: r.limitations, publishedBy: r.published_by, at: r.published_at?.toISOString() ?? null }));
  }

  /**
   * Loads a version. 'active' with nothing published gives an empty, uninitialized bank;
   * 'draft' with no draft yet gives what a new draft would start from (a copy of the active version).
   */
  async load(projectId: string, ref: VersionRef = 'active', db: SemDb = this.db): Promise<LoadedVersion | null> {
    const version = ref === 'active' ? await this.activeVersion(projectId, db) : ref;
    if (version === null) return { info: infoOf(emptyBank(), emptyVersionRow()), bank: emptyBank() };
    const row = await db.selectFrom('meta.sem_versions').selectAll()
      .where('project_id', '=', projectId).where('version', '=', version).executeTakeFirst();
    if (!row) {
      if (version !== DRAFT) return null;
      const base = await this.load(projectId, 'active', db);
      const bank = { version: DRAFT, records: base!.bank.records };
      return { info: infoOf(bank, { ...emptyVersionRow(), status: 'draft', revision: 0 }), bank };
    }
    const records = await db.selectFrom('meta.sem_records').select(['kind', 'lifecycle', 'body'])
      .where('project_id', '=', projectId).where('version', '=', version).orderBy('record_id').execute();
    const bank = bankFromRecords(version, records.map((r) => ({ kind: r.kind, lifecycle: r.lifecycle, body: r.body }) as SemRecord));
    return { info: infoOf(bank, row), bank };
  }

  /** Overview of one version (GET semantics?version=): its info with counts. NOT_FOUND for an unknown version. */
  async overview(projectId: string, ref: VersionRef = 'active'): Promise<SemVersionInfo> {
    return (await this.loadOrFail(projectId, ref)).info;
  }

  /** Records of one version, filtered by kind and by a case-insensitive text match on what the record says (see SEARCH_FIELDS). */
  async listRecords(projectId: string, ref: VersionRef = 'active', opts: { kind?: SemRecord['kind']; q?: string; limit?: number } = {}): Promise<SemRecord[]> {
    const { bank } = await this.loadOrFail(projectId, ref);
    const q = opts.q?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
    const out: SemRecord[] = [];
    for (const record of bank.records.values()) {
      if (opts.kind && record.kind !== opts.kind) continue;
      if (q && !searchText(record).includes(q)) continue;
      out.push(record);
      if (out.length >= limit) break;
    }
    return out;
  }

  async recordExists(projectId: string, version: string, recordId: string): Promise<boolean> {
    return (await this.getRecord(projectId, version, recordId)) !== null;
  }

  async getRecord(projectId: string, version: string, recordId: string): Promise<SemRecord | null> {
    const r = await this.db.selectFrom('meta.sem_records').select(['kind', 'lifecycle', 'body'])
      .where('project_id', '=', projectId).where('version', '=', version).where('record_id', '=', recordId).executeTakeFirst();
    return r ? ({ kind: r.kind, lifecycle: r.lifecycle, body: r.body } as SemRecord) : null;
  }

  // ---------- draft ----------

  /** Applies operations to the draft (created from the active version if needed). All or nothing. */
  async applyDraftOps(projectId: string, input: { expectedRevision: number; ops: SemOp[] }, actor: Actor, opts: { trusted?: boolean } = {}): Promise<{ revision: number; validation: Validation }> {
    checkEvidenceQueries(input.ops);
    return this.db.transaction().execute(async (trx) => {
      const draft = await this.lockDraft(trx, projectId);
      if (draft.revision !== input.expectedRevision) throw conflict(draft.revision);
      const loaded = (await this.load(projectId, DRAFT, trx))!;
      const outcome = await applyOps(loaded.bank, input.ops, {
        userId: actor.userId,
        now: () => this.now().toISOString(),
        runEvidenceQuery: this.opts.runEvidenceQuery ? (q) => this.opts.runEvidenceQuery!(projectId, q) : undefined,
        trusted: opts.trusted,
      });
      if (!outcome.ok) {
        throw new ApiError(400, 'SEM_OPS_REJECTED', 'Some changes could not be applied, so none were.', { details: outcome.errors });
      }
      await this.writeRecords(trx, projectId, loaded.bank, outcome.bank);
      const validation = await this.validateBankFor(trx, projectId, outcome.bank, draft.question_links);
      const revision = draft.revision + 1;
      await trx.updateTable('meta.sem_versions').set({ revision, validation: JSON.stringify(validation) })
        .where('project_id', '=', projectId).where('version', '=', DRAFT).execute();
      return { revision, validation };
    });
  }

  async validateDraft(projectId: string, questionLinks?: Record<string, string[]>): Promise<Validation> {
    const loaded = (await this.load(projectId, DRAFT))!;
    return this.validateBankFor(this.db, projectId, loaded.bank, questionLinks ?? loaded.info.questionLinks);
  }

  /** Publishes the draft as the next version and makes it active. The draft is then gone: the next edit starts a new one. */
  async publish(projectId: string, input: { expectedRevision: number; summary: string; limitations: string[]; questionLinks: Record<string, string[]> }, actor: Actor): Promise<{ version: string; validation: Validation }> {
    return this.db.transaction().execute(async (trx) => {
      const draft = await this.lockDraft(trx, projectId);
      if (draft.revision !== input.expectedRevision) throw conflict(draft.revision);
      const loaded = (await this.load(projectId, DRAFT, trx))!;
      const validation = await this.validateBankFor(trx, projectId, loaded.bank, input.questionLinks, true);
      if (!input.summary.trim()) validation.errors.push({ path: 'summary', code: 'SEM_MISSING_FIELD', message: 'A published version needs a short summary.' });
      if (validation.errors.length) {
        const open = validation.errors.some((e) => e.code === 'SEM_OPEN_DECISION');
        throw new ApiError(
          400,
          open ? 'SEM_OPEN_DECISION' : 'SEM_VALIDATION_FAILED',
          open ? 'Some decisions are still open: the user must choose before publishing.' : 'The bank has errors to fix before publishing.',
          { details: validation.errors, hint: 'Run validate_semantics and fix every error.' },
        );
      }
      const existing = await trx.selectFrom('meta.sem_versions').select('version')
        .where('project_id', '=', projectId).where('status', '!=', 'draft').execute();
      const version = nextVersionName(existing.map((r) => r.version));
      await trx.updateTable('meta.sem_versions').set({ status: 'superseded' })
        .where('project_id', '=', projectId).where('status', '=', 'active').execute();
      await trx.insertInto('meta.sem_versions').values({
        project_id: projectId, version, status: 'active', summary: input.summary,
        limitations: JSON.stringify(input.limitations), question_links: JSON.stringify(input.questionLinks),
        validation: JSON.stringify(validation), published_by: actor.userId, published_at: this.now(),
      }).execute();
      await sql`INSERT INTO meta.sem_records (project_id, version, kind, record_id, body, lifecycle, updated_at)
                SELECT project_id, ${version}, kind, record_id, body, lifecycle, updated_at
                FROM meta.sem_records WHERE project_id = ${projectId} AND version = ${DRAFT}`.execute(trx);
      await trx.deleteFrom('meta.sem_versions').where('project_id', '=', projectId).where('version', '=', DRAFT).execute();
      return { version, validation };
    });
  }

  /** Drops the draft; the next edit starts again from the active version. */
  async discardDraft(projectId: string): Promise<void> {
    await this.db.deleteFrom('meta.sem_versions').where('project_id', '=', projectId).where('version', '=', DRAFT).execute();
  }

  /** The draft row, locked for this transaction; created as a copy of the active version if missing. */
  private async lockDraft(trx: SemTrx, projectId: string) {
    const inserted = await trx.insertInto('meta.sem_versions')
      .values({ project_id: projectId, version: DRAFT, status: 'draft', revision: 0 })
      .onConflict((oc) => oc.columns(['project_id', 'version']).doNothing())
      .returning('version').executeTakeFirst();
    if (inserted) {
      const active = await this.activeVersion(projectId, trx);
      if (active) {
        await sql`INSERT INTO meta.sem_records (project_id, version, kind, record_id, body, lifecycle, updated_at)
                  SELECT project_id, ${DRAFT}, kind, record_id, body, lifecycle, updated_at
                  FROM meta.sem_records WHERE project_id = ${projectId} AND version = ${active}`.execute(trx);
        const links = await trx.selectFrom('meta.sem_versions').select('question_links')
          .where('project_id', '=', projectId).where('version', '=', active).executeTakeFirstOrThrow();
        await trx.updateTable('meta.sem_versions').set({ question_links: JSON.stringify(links.question_links) })
          .where('project_id', '=', projectId).where('version', '=', DRAFT).execute();
      }
    }
    return trx.selectFrom('meta.sem_versions').select(['revision', 'question_links'])
      .where('project_id', '=', projectId).where('version', '=', DRAFT).forUpdate().executeTakeFirstOrThrow();
  }

  /** Writes only what changed between two states of the draft. */
  private async writeRecords(trx: SemTrx, projectId: string, before: SemBank, after: SemBank): Promise<void> {
    const removed = [...before.records.keys()].filter((id) => !after.records.has(id));
    if (removed.length) {
      await trx.deleteFrom('meta.sem_records').where('project_id', '=', projectId).where('version', '=', DRAFT)
        .where('record_id', 'in', removed).execute();
    }
    const now = this.now();
    for (const [id, record] of after.records) {
      const old = before.records.get(id);
      if (old && JSON.stringify(old) === JSON.stringify(record)) continue;
      await trx.insertInto('meta.sem_records').values({
        project_id: projectId, version: DRAFT, kind: record.kind, record_id: id,
        body: JSON.stringify(record.body), lifecycle: record.lifecycle, updated_at: now,
      }).onConflict((oc) => oc.columns(['project_id', 'version', 'record_id']).doUpdateSet({
        kind: record.kind, body: JSON.stringify(record.body), lifecycle: record.lifecycle, updated_at: now,
      })).execute();
    }
  }

  private async validateBankFor(db: SemDb, projectId: string, bank: SemBank, questionLinks: Record<string, string[]>, forPublish = false): Promise<Validation> {
    const catalog = await (this.opts.catalog ?? defaultCatalog)(db, projectId);
    const workload = await this.getWorkload(projectId, db);
    return validateBank(bank, { catalog, workload: workload.questions, questionLinks, forPublish });
  }

  // ---------- browse / resolve ----------

  async browse(projectId: string, input: { query: string; kind?: string; limit?: number; version?: VersionRef }): Promise<BrowseResult> {
    const { bank } = await this.loadOrFail(projectId, input.version);
    return toBrowseResult(bank, browse(bank, input));
  }

  async resolve(projectId: string, input: { mentions: string[]; context?: string; version?: VersionRef }): Promise<ResolveResult> {
    const { bank } = await this.loadOrFail(projectId, input.version);
    return toResolveResult(bank, resolve(bank, input));
  }

  private async loadOrFail(projectId: string, ref: VersionRef = 'active'): Promise<LoadedVersion> {
    const loaded = await this.load(projectId, ref);
    if (!loaded) throw notFound(`Semantic version "${ref}"`, 'it does not exist in this project', 'List the versions to see which exist.');
    return loaded;
  }

  // ---------- workload ----------

  async getWorkload(projectId: string, db: SemDb = this.db): Promise<Workload> {
    const goal = await db.selectFrom('meta.sem_goals').select('goal').where('project_id', '=', projectId).executeTakeFirst();
    const rows = await db.selectFrom('meta.sem_workload').selectAll().where('project_id', '=', projectId).orderBy('id').execute();
    return {
      goal: goal?.goal ?? '',
      questions: rows.map((q) => ({ id: q.id, text: q.text, ...(q.use_case ? { useCase: q.use_case } : {}), source: q.source, picked: q.picked })),
    };
  }

  /** Replaces the goal and the seed questions. */
  async setWorkload(projectId: string, workload: Workload): Promise<Workload> {
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('meta.sem_goals').values({ project_id: projectId, goal: workload.goal, updated_at: this.now() })
        .onConflict((oc) => oc.column('project_id').doUpdateSet({ goal: workload.goal, updated_at: this.now() })).execute();
      await trx.deleteFrom('meta.sem_workload').where('project_id', '=', projectId).execute();
      if (workload.questions.length) {
        await trx.insertInto('meta.sem_workload').values(workload.questions.map((q) => ({
          project_id: projectId, id: q.id, text: q.text, use_case: q.useCase ?? null, source: q.source, picked: q.picked,
        }))).execute();
      }
    });
    return this.getWorkload(projectId);
  }

  // ---------- trajectories ----------

  async appendTrajectory(projectId: string, t: NewTrajectory): Promise<Trajectory> {
    const row = await this.db.insertInto('meta.sem_trajectories').values({
      project_id: projectId, session_id: t.sessionId || null, question: t.question, sem_version: t.semVersion,
      semantic_calls: JSON.stringify(t.semanticCalls), tool_calls: JSON.stringify(t.toolCalls), answer: t.answer, status: t.status,
    }).returningAll().executeTakeFirstOrThrow();
    return trajectoryOf(row);
  }

  async listTrajectories(projectId: string, opts: { limit?: number; since?: Date } = {}): Promise<Trajectory[]> {
    let q = this.db.selectFrom('meta.sem_trajectories').selectAll().where('project_id', '=', projectId);
    if (opts.since) q = q.where('created_at', '>', opts.since);
    const rows = await q.orderBy('created_at', 'desc').limit(Math.min(opts.limit ?? 50, 500)).execute();
    return rows.map(trajectoryOf);
  }

  async countTrajectoriesSince(projectId: string, since?: Date): Promise<number> {
    let q = this.db.selectFrom('meta.sem_trajectories').select((eb) => eb.fn.countAll<string>().as('n')).where('project_id', '=', projectId);
    if (since) q = q.where('created_at', '>', since);
    return Number((await q.executeTakeFirstOrThrow()).n);
  }
}

// ---------- helpers ----------

/** What a record says (not the ids it points at), for the `q` filter of the records route. */
const SEARCH_FIELDS = ['id', 'name', 'aliases', 'definition', 'scope', 'description', 'trigger_keywords', 'table', 'column', 'grain', 'semantic_filter', 'aggregation_semantics', 'source', 'validation_method'];

function searchText(record: SemRecord): string {
  const body = record.body as Record<string, unknown>;
  return SEARCH_FIELDS.flatMap((f) => (Array.isArray(body[f]) ? body[f] : [body[f]]))
    .filter((v): v is string => typeof v === 'string').join('\n').toLowerCase();
}

/**
 * Evidence queries must be single read-only SELECTs (S2): a write query refuses the whole change with
 * SQL_REJECTED before anything runs. Other SQL failures (errors, timeouts) become the evidence result text.
 */
function checkEvidenceQueries(ops: SemOp[]): void {
  ops.forEach((op, i) => {
    if (op.op !== 'upsertRecord' || op.record.kind !== 'evidence') return;
    const query = (op.record.body as { query?: unknown }).query;
    if (typeof query !== 'string' || !query.trim()) return;
    try {
      checkReadOnlySql(query);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      throw new ApiError(e.status, e.code, `Evidence "${op.record.body.id}": ${e.message}`, {
        ...e.extra,
        details: [{ path: `ops[${i}].record.body.query`, code: e.code, message: e.message }],
      });
    }
  });
}

type VersionRow = {
  status: 'draft' | 'active' | 'superseded'; revision: number; summary: string; limitations: string[];
  question_links: Record<string, string[]>; published_by: string | null; published_at: Date | null;
};

const emptyVersionRow = (): VersionRow => ({
  status: 'draft', revision: 0, summary: '', limitations: [], question_links: {}, published_by: null, published_at: null,
});

function infoOf(bank: SemBank, row: VersionRow): SemVersionInfo {
  return {
    version: bank.version,
    status: row.status,
    ...(row.status === 'draft' ? { revision: row.revision } : {}),
    summary: row.summary,
    limitations: row.limitations,
    questionLinks: row.question_links,
    counts: counts(bank),
    ...(row.published_by ? { publishedBy: row.published_by } : {}),
    ...(row.published_at ? { publishedAt: row.published_at.toISOString() } : {}),
  };
}

function conflict(current: number): ApiError {
  return new ApiError(409, 'VERSION_CONFLICT', 'The bank draft changed since you last read it.', {
    hint: `Read the draft again (revision ${current}) and re-apply your changes.`,
  });
}

function trajectoryOf(row: { id: string; session_id: string | null; question: string; sem_version: string; semantic_calls: Trajectory['semanticCalls']; tool_calls: Trajectory['toolCalls']; answer: string; status: Trajectory['status']; created_at: Date }): Trajectory {
  return {
    id: row.id, sessionId: row.session_id ?? '', question: row.question, semVersion: row.sem_version,
    semanticCalls: row.semantic_calls, toolCalls: row.tool_calls, answer: row.answer, status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/** The project's datasets at their current version (read-only use of Part A's tables, 09 §4.2 data contract). */
async function defaultCatalog(db: SemDb, projectId: string): Promise<DatasetCatalog> {
  const rows = await db.selectFrom('meta.datasets as d')
    .innerJoin('meta.dataset_versions as v', (j) => j.onRef('v.dataset_id', '=', 'd.id').onRef('v.version', '=', 'd.current_version'))
    .select(['d.id', 'd.name', 'v.columns']).where('d.project_id', '=', projectId).execute();
  return { datasets: rows.map((r) => ({ id: r.id, name: r.name, columns: r.columns.map((c) => c.sqlName) })) };
}
