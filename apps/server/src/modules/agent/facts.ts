import { isoDate, type FreshFacts } from '../../agent/prompts/index.js';
import type { AgentDb } from './tables.js';

// The "fresh facts" of 05-agent §6 (date, datasets, active semantic version, published workspace), read from
// the tables. Sent to the model as a mid-conversation system message whenever the rendered text changes.

export type FreshFactsProvider = (projectId: string) => Promise<FreshFacts>;

export function createFreshFactsProvider(db: AgentDb, now: () => Date = () => new Date()): FreshFactsProvider {
  return async (projectId) => {
    const datasets = await db.selectFrom('meta.datasets as d')
      .leftJoin('meta.dataset_versions as v', (j) => j.onRef('v.dataset_id', '=', 'd.id').onRef('v.version', '=', 'd.current_version'))
      .select(['d.name', 'd.simulated', 'd.current_version', 'v.row_count', 'v.columns', 'v.profile_status'])
      .where('d.project_id', '=', projectId).execute();

    const sem = await db.selectFrom('meta.sem_versions').select(['version', 'summary', 'published_at'])
      .where('project_id', '=', projectId).where('status', '=', 'active').executeTakeFirst();

    const ws = await db.selectFrom('meta.workspace_versions').select(['version', 'sem_version', 'doc'])
      .where('project_id', '=', projectId).orderBy('version', 'desc').limit(1).executeTakeFirst();
    const names = (list?: { apiName: string }[]) => (list ?? []).map((x) => x.apiName);

    return {
      date: isoDate(now()),
      datasets: datasets.map((d) => ({
        name: d.name,
        currentVersion: d.current_version,
        rowCount: d.row_count ?? null,
        columnCount: Array.isArray(d.columns) ? d.columns.length : null,
        simulated: d.simulated,
        ...(d.profile_status ? { profileStatus: d.profile_status } : {}),
      })),
      semanticVersion: sem
        ? { version: sem.version, publishedAt: sem.published_at?.toISOString() ?? '', ...(sem.summary ? { summary: sem.summary } : {}) }
        : null,
      workspace: ws
        ? {
            version: `v${ws.version}`, semanticVersion: ws.sem_version,
            pipelines: names(ws.doc.pipelines), objectTypes: names(ws.doc.objectTypes), linkTypes: names(ws.doc.linkTypes),
            logic: names(ws.doc.logic), actionTypes: names(ws.doc.actionTypes),
          }
        : null,
    };
  };
}
