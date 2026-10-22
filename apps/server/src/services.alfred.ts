import { buildLlmServices } from './modules/llm/index.js';
import { buildSemanticsServices } from './modules/semantics/index.js';
import { buildSqlServices } from './modules/sql/service.js';
import type { AppDeps } from './services.js';

// Part B services (owner: Alfred): semantic bank, read-only SQL, LLM gateway.
export function buildAlfredServices(deps: AppDeps) {
  const { sql } = buildSqlServices(deps);
  // Evidence queries of the bank run through the same parser check, timeout and row cap as run_sql.
  const semantics = buildSemanticsServices(deps, { runEvidenceQuery: (projectId, query) => sql.runEvidenceQuery(projectId, query) });
  return { sql, ...semantics, ...buildLlmServices() };
}
