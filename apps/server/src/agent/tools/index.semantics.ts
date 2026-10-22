import { bankOverview } from './bank_overview.js';
import { browseSemantics } from './browse_semantics.js';
import { editSemantics } from './edit_semantics.js';
import { publishSemantics } from './publish_semantics.js';
import { resolveSemantics } from './resolve_semantics.js';
import { runSql } from './run_sql.js';
import { setWorkload } from './set_workload.js';
import type { AnyToolDef } from './types.js';
import { validateSemantics } from './validate_semantics.js';

// Part B tools of T-23 / T-24 (owner: Alfred, 09 §5): read-only SQL and the semantic bank.
// Spread into `alfredTools` (index.alfred.ts) when the loop's tools land; catalog order.
export const semanticsTools: AnyToolDef[] = [
  runSql,
  bankOverview,
  browseSemantics,
  resolveSemantics,
  setWorkload,
  editSemantics,
  validateSemantics,
  publishSemantics,
];
