import type { AgentMode, AgentStatus } from '@mini/shared';
import type { ColumnType, Kysely } from 'kysely';
import type { Db } from '../../db/index.js';
import type { ItemKind, PendingState } from './types.js';

// Kysely types of the tables this module reads or writes (001_init.sql). db/types.ts (Part A) has no agent
// tables, so they are declared here and added to the shared Db with `withTables` (same as semantics/tables.ts).
// The dataset, bank and workspace tables are read only, for the "fresh facts" message (05-agent §6).

type Json<T> = ColumnType<T, string, string>;
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type ReadOnly<T> = ColumnType<T, never, never>;
type Created = ColumnType<Date, Date | string | undefined, never>;

export type AgentTables = {
  'meta.agent_sessions': {
    id: ColumnType<string, string | undefined, never>;
    project_id: string;
    user_id: string;
    title: Defaulted<string>;
    mode: Defaulted<AgentMode>;
    status: Defaulted<AgentStatus>;
    pending: ColumnType<PendingState | null, string | null | undefined, string | null>;
    token_estimate: Defaulted<number>;
    created_at: Created;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  };
  // Append-only: never UPDATE or DELETE (CLAUDE.md rule 13).
  'meta.agent_items': {
    session_id: string;
    seq: number;
    kind: ItemKind;
    payload: Json<unknown>;
    token_estimate: Defaulted<number>;
    created_at: Created;
  };
  'meta.approvals': {
    id: ColumnType<string, string | undefined, never>;
    session_id: string;
    item_seq: number;
    tool_name: string;
    args: Json<unknown>;
    summary: string;
    status: Defaulted<'pending' | 'allowed' | 'rejected'>;
    decided_by: string | null;
    decided_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
    note: string | null;
    created_at: Created;
  };
  'meta.users': { id: ReadOnly<string>; email: ReadOnly<string>; display_name: ReadOnly<string> };
  'meta.projects': { id: ReadOnly<string>; name: ReadOnly<string> };
  'meta.datasets': {
    id: ReadOnly<string>;
    project_id: ReadOnly<string>;
    name: ReadOnly<string>;
    simulated: ReadOnly<boolean>;
    current_version: ReadOnly<number | null>;
  };
  'meta.dataset_versions': {
    dataset_id: ReadOnly<string>;
    version: ReadOnly<number>;
    row_count: ReadOnly<number>;
    columns: ReadOnly<unknown[]>;
    profile_status: ReadOnly<'pending' | 'running' | 'done' | 'failed'>;
  };
  'meta.sem_versions': {
    project_id: ReadOnly<string>;
    version: ReadOnly<string>;
    status: ReadOnly<'draft' | 'active' | 'superseded'>;
    summary: ReadOnly<string>;
    published_at: ReadOnly<Date | null>;
  };
  'meta.workspace_versions': {
    project_id: ReadOnly<string>;
    version: ReadOnly<number>;
    sem_version: ReadOnly<string>;
    doc: ReadOnly<{
      pipelines?: { apiName: string }[]; objectTypes?: { apiName: string }[]; linkTypes?: { apiName: string }[];
      logic?: { apiName: string }[]; actionTypes?: { apiName: string }[];
    }>;
  };
};

export type AgentDb = Kysely<AgentTables>;

/** The shared Db, seen with this module's tables. */
export function agentDb(db: Db): AgentDb {
  return db.withTables<AgentTables>() as unknown as AgentDb;
}
