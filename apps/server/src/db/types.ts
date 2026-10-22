import type { ColumnInfo, ColumnProfile, DatasetVersion, Job, PipelineCheck, ProfileStatus, Validation, WorkspaceDoc } from '@mini/shared';
import type { ColumnType, Generated } from 'kysely';

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

// jsonb columns: parsed objects when read, JSON text when written.
type Json<T> = ColumnType<T, string, string>;

export interface DatasetsTable {
  id: Generated<string>;
  project_id: string;
  short_id: string;
  name: string;
  description: Generated<string>;
  simulated: Generated<boolean>;
  current_version: number | null;
  created_by: string;
  created_at: Timestamp;
}

export interface DatasetVersionsTable {
  id: Generated<string>;
  dataset_id: string;
  version: number;
  transaction_type: 'SNAPSHOT' | 'APPEND';
  table_name: string;
  row_count: number;
  columns: Json<ColumnInfo[]>;
  profile: ColumnType<ColumnProfile[] | null, string | null, string | null>;
  profile_status: Generated<ProfileStatus>;
  parse_errors: ColumnType<ParseError[], string | undefined, string>;
  source_file: string;
  dropped_at: Date | null;
  created_by: string;
  created_at: Timestamp;
}

export interface WorkspaceDraftsTable {
  project_id: string;
  base_version: Generated<number>;
  sem_version: string | null;
  revision: Generated<number>;
  doc: Json<WorkspaceDoc>;
  validation: ColumnType<Validation, string | undefined, string>;
  updated_by: string | null;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface WorkspaceVersionsTable {
  project_id: string;
  version: number;
  sem_version: string;
  doc: Json<WorkspaceDoc>;
  message: string;
  published_by: string;
  published_via: 'ui' | 'agent';
  published_at: Timestamp;
}

export interface PipelineBuildsTable {
  id: Generated<string>;
  project_id: string;
  workspace_version: number;
  pipeline: string;
  output: string;
  table_name: string;
  row_count: Generated<number>;
  input_versions: Json<Record<string, number>>;
  definition_hash: string;
  checks: Json<{ check: PipelineCheck; ok: boolean; detail: string }[]>;
  status: 'built' | 'upToDate' | 'failed';
  duration_ms: Generated<number>;
  created_at: Timestamp;
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

export type ParseError = DatasetVersion['parseErrors'][number];

export interface JobsTable {
  id: Generated<string>;
  project_id: string;
  kind: 'profile';
  target: string;
  status: Generated<Job['status']>;
  progress: Generated<number>;
  error: string | null;
  created_at: Timestamp;
  finished_at: Date | null;
}

export interface DB {
  'meta.users': UsersTable;
  'meta.projects': ProjectsTable;
  'meta.project_members': ProjectMembersTable;
  'meta.datasets': DatasetsTable;
  'meta.dataset_versions': DatasetVersionsTable;
  'meta.workspace_drafts': WorkspaceDraftsTable;
  'meta.workspace_versions': WorkspaceVersionsTable;
  'meta.pipeline_builds': PipelineBuildsTable;
  'meta.action_runs': ActionRunsTable;
  'meta.jobs': JobsTable;
}
