import type { Generated } from 'kysely';

// Kysely table types for the `meta` schema (apps/server/migrations/001_init.sql).
// Hand-written; add a table here when a service starts using it. Tables are addressed as 'meta.<name>'.

type Timestamp = Generated<Date>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  display_name: string;
  created_at: Timestamp;
}

export interface ProjectsTable {
  id: Generated<string>;
  name: string;
  description: Generated<string>;
  created_by: string;
  created_at: Timestamp;
}

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMembersTable {
  project_id: string;
  user_id: string;
  role: ProjectRole;
}

export interface ActionRunsTable {
  id: string;
  project_id: string;
  workspace_version: number; // 0 for draft tests
  action_api_name: string;
  params: unknown; // jsonb: the request's params as sent
  dry_run: boolean;
  status: 'applied' | 'valid' | 'rejected' | 'failed';
  errors: unknown; // jsonb: FieldError[]
  edits: unknown; // jsonb: [{objectType, primaryKey, op, before, after}]
  run_by: string;
  via: 'ui' | 'agent' | 'automation';
  agent_session_id: string | null;
  created_at: Timestamp;
}

export interface DB {
  'meta.users': UsersTable;
  'meta.projects': ProjectsTable;
  'meta.project_members': ProjectMembersTable;
  'meta.action_runs': ActionRunsTable;
}
