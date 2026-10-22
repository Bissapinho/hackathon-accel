import type { WorkspaceDoc } from '@mini/shared';
import type { Generated, JSONColumnType } from 'kysely';

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

export interface WorkspaceVersionsTable {
  project_id: string;
  version: number;
  sem_version: string;
  doc: JSONColumnType<WorkspaceDoc>;
  message: string;
  published_by: string;
  published_via: 'ui' | 'agent';
  published_at: Timestamp;
}

export interface DB {
  'meta.users': UsersTable;
  'meta.projects': ProjectsTable;
  'meta.project_members': ProjectMembersTable;
  'meta.workspace_versions': WorkspaceVersionsTable;
}
