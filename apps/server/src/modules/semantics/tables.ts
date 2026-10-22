import type { ColumnInfo, ColumnProfile, SemLifecycle, SemRecord, Trajectory, Validation } from '@mini/shared';
import type { ColumnType, Kysely, Transaction } from 'kysely';
import type { Db } from '../../db/index.js';

// Kysely types of the tables this module reads or writes (001_init.sql). db/types.ts (Part A) has no
// sem_* tables yet, so they are declared here and added to the shared Db with `withTables`.
// The two dataset tables are Part A's: only the columns of the 09 §4.2 data contract, read-only.

type Json<T> = ColumnType<T, string, string>;
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type ReadOnly<T> = ColumnType<T, never, never>;

// A type alias, not an interface: withTables needs an index-compatible record type.
export type SemTables = {
  'meta.sem_versions': {
    project_id: string;
    version: string;
    status: 'draft' | 'active' | 'superseded';
    revision: Defaulted<number>;
    summary: Defaulted<string>;
    limitations: ColumnType<string[], string | undefined, string>;
    question_links: ColumnType<Record<string, string[]>, string | undefined, string>;
    validation: ColumnType<Validation, string | undefined, string>;
    published_by: string | null;
    published_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  };
  'meta.sem_records': {
    project_id: string;
    version: string;
    kind: SemRecord['kind'];
    record_id: string;
    body: Json<SemRecord['body']>;
    lifecycle: Defaulted<SemLifecycle>;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  };
  'meta.sem_workload': {
    project_id: string;
    id: string;
    text: string;
    use_case: string | null;
    source: 'proposed' | 'user';
    picked: Defaulted<boolean>;
    created_at: ColumnType<Date, Date | string | undefined, never>;
  };
  'meta.sem_goals': {
    project_id: string;
    goal: string;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  };
  'meta.sem_trajectories': {
    id: ColumnType<string, string | undefined, never>;
    project_id: string;
    session_id: string | null;
    question: string;
    sem_version: string;
    semantic_calls: Json<Trajectory['semanticCalls']>;
    tool_calls: Json<Trajectory['toolCalls']>;
    answer: Defaulted<string>;
    status: Trajectory['status'];
    created_at: ColumnType<Date, Date | string | undefined, never>;
  };
  'meta.datasets': {
    id: ReadOnly<string>;
    project_id: ReadOnly<string>;
    short_id: ReadOnly<string>;
    name: ReadOnly<string>;
    simulated: ReadOnly<boolean>;
    current_version: ReadOnly<number | null>;
  };
  'meta.dataset_versions': {
    dataset_id: ReadOnly<string>;
    version: ReadOnly<number>;
    table_name: ReadOnly<string>;
    row_count: ReadOnly<number>;
    created_by: ReadOnly<string>;
    columns: ReadOnly<ColumnInfo[]>;
    profile: ReadOnly<ColumnProfile[] | null>; // set once profile_status = 'done'
    profile_status: ReadOnly<'pending' | 'running' | 'done' | 'failed'>;
  };
};

export type SemDb = Kysely<SemTables>;
export type SemTrx = Transaction<SemTables>;

/** The shared Db, seen with this module's tables. */
export function semDb(db: Db): SemDb {
  return db.withTables<SemTables>() as unknown as SemDb;
}
