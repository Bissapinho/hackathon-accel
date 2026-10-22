import type { DraftOp, EntityKind, Validation, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import { ApiError, notFound } from '../../errors.js';
import type { SemanticsPort } from '../../ports.js';
import { diffDocs, type WorkspaceDiff } from './diff.js';
import { applyOps, emptyDoc } from './ops.js';
import { validateWorkspace, type DataChecker, type DatasetCatalog } from './validate.js';

// The workspace draft (T-11) and its validation (T-13, structure half). Publish (T-14) is not here.

export type Draft = {
  revision: number;
  baseVersion: number;
  semVersion: string | null;
  doc: WorkspaceDoc;
  validation: Validation;
};

export type Published = { version: number; semVersion: string; doc: WorkspaceDoc };

export type HistoryEntry = {
  version: number;
  semVersion: string;
  message: string;
  publishedBy: string;
  via: 'ui' | 'agent';
  at: string;
};

export type SearchHit = {
  kind: 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType';
  apiName: string;
  objectType?: string;
  displayName: string;
  description: string;
  score: number;
  why: string;
};

export type Inventory = {
  semanticVersion: string;
  pipelines: { apiName: string; outputs: string[] }[];
  objectTypes: { apiName: string; displayName: string; properties: number }[];
  linkTypes: { apiName: string; from: string; to: string }[];
  logic: { apiName: string; objectType: string; kind: 'derived' | 'rule' }[];
  actionTypes: string[];
  apps: string[];
  automations: string[];
};

export function createWorkspaceService(deps: { db: Db; semantics: SemanticsPort; dataChecker?: DataChecker }) {
  const { db, semantics } = deps;

  async function latestPublished(projectId: string): Promise<Published | null> {
    const row = await db
      .selectFrom('meta.workspace_versions')
      .select(['version', 'sem_version', 'doc'])
      .where('project_id', '=', projectId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? { version: row.version, semVersion: row.sem_version, doc: row.doc } : null;
  }

  async function getPublished(projectId: string, version: 'latest' | number): Promise<Published> {
    if (version === 'latest') {
      const latest = await latestPublished(projectId);
      if (!latest) {
        throw notFound('The published workspace', 'nothing has been published in this project yet', 'Read the draft instead (version=draft).');
      }
      return latest;
    }
    const row = await db
      .selectFrom('meta.workspace_versions')
      .select(['version', 'sem_version', 'doc'])
      .where('project_id', '=', projectId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (!row) throw notFound(`Workspace version ${version}`, 'no publish has this number', 'List versions with GET /workspace/history.');
    return { version: row.version, semVersion: row.sem_version, doc: row.doc };
  }

  // Columns of the current version of every dataset of the project (for validation).
  async function datasetCatalog(projectId: string): Promise<DatasetCatalog> {
    const rows = await db
      .selectFrom('meta.datasets as d')
      .innerJoin('meta.dataset_versions as v', (j) => j.onRef('v.dataset_id', '=', 'd.id').onRef('v.version', '=', 'd.current_version'))
      .select(['d.id', 'v.columns'])
      .where('d.project_id', '=', projectId)
      .execute();
    return new Map(rows.map((r) => [r.id, r.columns.map((c) => ({ sqlName: c.sqlName, type: c.type }))]));
  }

  // Cheap validation run on every PATCH: structure, dataset columns and semantic references.
  async function quickValidate(projectId: string, doc: WorkspaceDoc): Promise<Validation> {
    return validateWorkspace(doc, { projectId, semantics, datasets: await datasetCatalog(projectId) });
  }

  // The draft, created on first read from the latest published doc (or an empty doc on the active
  // semantic version, 09 §4.5).
  async function getDraft(projectId: string): Promise<Draft> {
    const existing = await db
      .selectFrom('meta.workspace_drafts')
      .select(['revision', 'base_version', 'sem_version', 'doc', 'validation'])
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    if (existing) {
      return {
        revision: existing.revision,
        baseVersion: existing.base_version,
        semVersion: existing.sem_version,
        doc: existing.doc,
        validation: existing.validation,
      };
    }
    const latest = await latestPublished(projectId);
    const doc = latest?.doc ?? emptyDoc((await semantics.activeVersion(projectId)) ?? '');
    const validation = await quickValidate(projectId, doc);
    await db
      .insertInto('meta.workspace_drafts')
      .values({
        project_id: projectId,
        base_version: latest?.version ?? 0,
        sem_version: doc.semanticVersion || null,
        revision: 0,
        doc: JSON.stringify(doc),
        validation: JSON.stringify(validation),
      })
      .onConflict((oc) => oc.column('project_id').doNothing())
      .execute();
    return getDraft(projectId);
  }

  async function patchDraft(
    projectId: string,
    userId: string,
    expectedRevision: number,
    ops: DraftOp[],
  ): Promise<{ revision: number; validation: Validation }> {
    await getDraft(projectId); // make sure it exists
    const datasets = await datasetCatalog(projectId);
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('meta.workspace_drafts')
        .select(['revision', 'doc'])
        .where('project_id', '=', projectId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.revision !== expectedRevision) {
        throw new ApiError(409, 'VERSION_CONFLICT', `The draft changed since you read it (now at revision ${row.revision}, you sent ${expectedRevision}).`, {
          hint: 'Read the draft again, then re-apply your changes on top of it.',
        });
      }
      const doc = applyOps(row.doc, ops);
      const validation = await validateWorkspace(doc, { projectId, semantics, datasets });
      const revision = row.revision + 1;
      await trx
        .updateTable('meta.workspace_drafts')
        .set({
          doc: JSON.stringify(doc),
          sem_version: doc.semanticVersion || null,
          revision,
          validation: JSON.stringify(validation),
          updated_by: userId,
          updated_at: new Date(),
        })
        .where('project_id', '=', projectId)
        .execute();
      return { revision, validation };
    });
  }

  // Full validation (structure + data checks when a DataChecker is wired); stored on the draft.
  async function validateDraft(projectId: string): Promise<Validation> {
    const draft = await getDraft(projectId);
    const validation = await validateWorkspace(draft.doc, {
      projectId,
      semantics,
      datasets: await datasetCatalog(projectId),
      dataChecker: deps.dataChecker,
    });
    await db
      .updateTable('meta.workspace_drafts')
      .set({ validation: JSON.stringify(validation) })
      .where('project_id', '=', projectId)
      .where('revision', '=', draft.revision) // don't overwrite a newer draft's result
      .execute();
    return validation;
  }

  async function diffDraft(projectId: string): Promise<WorkspaceDiff> {
    const draft = await getDraft(projectId);
    const latest = await latestPublished(projectId);
    return diffDocs(latest?.doc ?? emptyDoc(''), draft.doc);
  }

  // Resets the draft to the latest published doc; the revision keeps increasing so stale saves fail.
  async function discardDraft(projectId: string, userId: string): Promise<{ revision: number }> {
    await getDraft(projectId); // make sure it exists
    const latest = await latestPublished(projectId);
    const doc = latest?.doc ?? emptyDoc((await semantics.activeVersion(projectId)) ?? '');
    const validation = await quickValidate(projectId, doc);
    // Incremented in SQL: a save committed meanwhile can't end up with the same revision as the reset.
    const row = await db
      .updateTable('meta.workspace_drafts')
      .set({
        doc: JSON.stringify(doc),
        base_version: latest?.version ?? 0,
        sem_version: doc.semanticVersion || null,
        revision: sql<number>`revision + 1`,
        validation: JSON.stringify(validation),
        updated_by: userId,
        updated_at: new Date(),
      })
      .where('project_id', '=', projectId)
      .returning('revision')
      .executeTakeFirstOrThrow();
    return { revision: row.revision };
  }

  async function history(projectId: string): Promise<HistoryEntry[]> {
    const rows = await db
      .selectFrom('meta.workspace_versions as w')
      .innerJoin('meta.users as u', 'u.id', 'w.published_by')
      .select(['w.version', 'w.sem_version', 'w.message', 'u.display_name', 'w.published_via', 'w.published_at'])
      .where('w.project_id', '=', projectId)
      .orderBy('w.version', 'desc')
      .execute();
    return rows.map((r) => ({
      version: r.version,
      semVersion: r.sem_version,
      message: r.message,
      publishedBy: r.display_name,
      via: r.published_via,
      at: r.published_at.toISOString(),
    }));
  }

  // The published doc or the draft doc, for reads that take `which`.
  async function readDoc(projectId: string, which: 'published' | 'draft'): Promise<WorkspaceDoc> {
    if (which === 'draft') return (await getDraft(projectId)).doc;
    return (await latestPublished(projectId))?.doc ?? emptyDoc('');
  }

  return {
    getDraft,
    getPublished,
    latestPublished,
    patchDraft,
    validateDraft,
    diffDraft,
    discardDraft,
    history,
    readDoc,
    datasetCatalog,
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

// ───────────────────────────── Pure reads used by tools ─────────────────────────────

export function inventory(doc: WorkspaceDoc): Inventory {
  return {
    semanticVersion: doc.semanticVersion,
    pipelines: doc.pipelines.map((p) => ({ apiName: p.apiName, outputs: p.outputs.map((o) => o.apiName) })),
    objectTypes: doc.objectTypes.map((t) => ({ apiName: t.apiName, displayName: t.displayName, properties: t.properties.length })),
    linkTypes: doc.linkTypes.map((l) => ({ apiName: l.apiName, from: l.from, to: l.to })),
    logic: doc.logic.map((l) => ({ apiName: l.apiName, objectType: l.objectType, kind: l.kind })),
    actionTypes: doc.actionTypes.map((a) => a.apiName),
    apps: doc.apps.map((a) => a.id),
    automations: doc.automations.map((a) => a.id),
  };
}

export function findEntity(doc: WorkspaceDoc, kind: EntityKind, apiName: string, objectType?: string): unknown {
  switch (kind) {
    case 'pipeline':
      return doc.pipelines.find((p) => p.apiName === apiName);
    case 'objectType':
      return doc.objectTypes.find((t) => t.apiName === apiName);
    case 'property':
      return doc.objectTypes.find((t) => t.apiName === objectType)?.properties.find((p) => p.apiName === apiName);
    case 'linkType':
      return doc.linkTypes.find((l) => l.apiName === apiName && (!objectType || l.from === objectType));
    case 'logic':
      return doc.logic.find((l) => l.apiName === apiName && (!objectType || l.objectType === objectType));
    case 'actionType':
      return doc.actionTypes.find((a) => a.apiName === apiName);
    case 'app':
      return doc.apps.find((a) => a.id === apiName);
    case 'automation':
      return doc.automations.find((a) => a.id === apiName);
  }
}

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Ranked matches over names (3 points per word), aliases (2) and descriptions (1), accents and case ignored.
export function searchOntology(
  doc: WorkspaceDoc,
  queries: string[],
  kinds?: SearchHit['kind'][],
  limit = 20,
): SearchHit[] {
  type Candidate = Omit<SearchHit, 'score' | 'why'> & { aliases: string[] };
  const candidates: Candidate[] = [];
  for (const t of doc.objectTypes) {
    candidates.push({ kind: 'objectType', apiName: t.apiName, displayName: t.displayName, description: t.description, aliases: [...t.aliases, t.pluralDisplayName] });
    for (const p of t.properties) {
      candidates.push({ kind: 'property', apiName: p.apiName, objectType: t.apiName, displayName: p.displayName, description: p.description, aliases: p.aliases });
    }
  }
  for (const l of doc.linkTypes) {
    candidates.push({ kind: 'linkType', apiName: l.apiName, objectType: l.from, displayName: l.displayName, description: l.description, aliases: [l.reverseApiName, l.reverseDisplayName] });
  }
  for (const l of doc.logic) {
    candidates.push({ kind: 'logic', apiName: l.apiName, objectType: l.objectType, displayName: l.displayName, description: l.description, aliases: [] });
  }
  for (const a of doc.actionTypes) {
    candidates.push({ kind: 'actionType', apiName: a.apiName, displayName: a.displayName, description: `${a.description} ${a.agentDescription}`, aliases: [] });
  }

  const queryWords = [...new Set(queries.flatMap(words))];
  const hits: SearchHit[] = [];
  for (const c of candidates) {
    if (kinds && !kinds.includes(c.kind)) continue;
    const name = new Set([...words(c.apiName), ...words(c.displayName)]);
    const alias = new Set(c.aliases.flatMap(words));
    const desc = new Set(words(c.description));
    let score = 0;
    const why: string[] = [];
    for (const w of queryWords) {
      const prefix = (set: Set<string>) => [...set].some((x) => x === w || (w.length >= 4 && x.startsWith(w)));
      if (prefix(name)) {
        score += 3;
        why.push(`name matches "${w}"`);
      } else if (prefix(alias)) {
        score += 2;
        why.push(`alias matches "${w}"`);
      } else if (prefix(desc)) {
        score += 1;
        why.push(`description mentions "${w}"`);
      }
    }
    if (score > 0) {
      hits.push({
        kind: c.kind,
        apiName: c.apiName,
        ...(c.objectType ? { objectType: c.objectType } : {}),
        displayName: c.displayName,
        description: c.description,
        score,
        why: why.join('; '),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.apiName.localeCompare(b.apiName)).slice(0, limit);
}

