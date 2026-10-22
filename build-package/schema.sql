-- 001_init.sql — Mini-Foundry metadata schema (Postgres 16; local Docker or Aiven for PostgreSQL)
-- Generated tables live in schemas data / edits / ont / logic and are created at runtime by the services.
-- Run by `pnpm db:migrate` as a role that can create roles (locally the Docker superuser, on Aiven `avnadmin`).
-- Login passwords for mini_app are set by the migration runner from MINI_APP_PASSWORD, never stored here.

-- No extension needed: gen_random_uuid() is built into Postgres 13+.

-- ───────────────────────────── Roles ─────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mini_app') THEN
    CREATE ROLE mini_app LOGIN;              -- the server; owns the five schemas
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mini_reader') THEN
    CREATE ROLE mini_reader NOLOGIN;         -- agent SQL tool, evidence queries, previews (via SET ROLE)
  END IF;
END $$;
GRANT mini_reader TO mini_app;               -- lets the server SET ROLE mini_reader for read-only work
-- Postgres 16 gives the creator of a role only ADMIN OPTION (no SET); CREATE SCHEMA … AUTHORIZATION and
-- SET ROLE below need membership, so the migrating role (avnadmin on Aiven) grants it to itself.
GRANT mini_app TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS meta  AUTHORIZATION mini_app;
CREATE SCHEMA IF NOT EXISTS data  AUTHORIZATION mini_app;
CREATE SCHEMA IF NOT EXISTS edits AUTHORIZATION mini_app;
CREATE SCHEMA IF NOT EXISTS ont   AUTHORIZATION mini_app;
CREATE SCHEMA IF NOT EXISTS logic AUTHORIZATION mini_app;

GRANT USAGE ON SCHEMA logic, ont, data TO mini_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE mini_app IN SCHEMA logic GRANT SELECT ON TABLES TO mini_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE mini_app IN SCHEMA ont   GRANT SELECT ON TABLES TO mini_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE mini_app IN SCHEMA data  GRANT SELECT ON TABLES TO mini_reader;
ALTER ROLE mini_reader SET statement_timeout = '5s';

SET ROLE mini_app;                           -- every object below is owned by mini_app

-- ───────────────────────────── Users and projects ─────────────────────────────

CREATE TABLE meta.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  created_by    uuid NOT NULL REFERENCES meta.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.project_members (
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES meta.users(id),
  role          text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY (project_id, user_id)
);

-- ───────────────────────────── Datasets (stage 1) ─────────────────────────────

CREATE TABLE meta.datasets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  short_id        text NOT NULL UNIQUE CHECK (short_id ~ '^[a-z0-9]{8}$'),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  simulated       boolean NOT NULL DEFAULT false,   -- generated data, labelled as such everywhere
  current_version integer,                          -- NULL until the first upload commits
  created_by      uuid NOT NULL REFERENCES meta.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE meta.dataset_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id       uuid NOT NULL REFERENCES meta.datasets(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('SNAPSHOT','APPEND')),
  table_name       text NOT NULL,                   -- e.g. data.ds_k3f9a2qx_v2
  row_count        integer NOT NULL,
  columns          jsonb NOT NULL,                  -- [{name, sqlName, type, nullable, sample: []}]
  profile          jsonb,                           -- ColumnProfile[] once profile_status = 'done'
  profile_status   text NOT NULL DEFAULT 'pending'
                   CHECK (profile_status IN ('pending','running','done','failed')),
  parse_errors     jsonb NOT NULL DEFAULT '[]',     -- [{row, column, value, expected}]
  source_file      text NOT NULL,                   -- path under DATA_DIR
  dropped_at       timestamptz,                     -- table dropped by the retention rule (03-data-model.md §4)
  created_by       uuid NOT NULL REFERENCES meta.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);

CREATE TABLE meta.jobs (                            -- background jobs, run one at a time (1-CPU database)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('profile')),
  target        uuid NOT NULL,                      -- dataset_versions.id
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  progress      real NOT NULL DEFAULT 0,            -- 0..1
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX ON meta.jobs (status, created_at);

-- ───────────────────────────── Semantic bank (stage 2) ─────────────────────────────

CREATE TABLE meta.sem_versions (
  project_id     uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  version        text NOT NULL,                     -- 'draft', 'v0', 'v1', … (one draft per project)
  status         text NOT NULL CHECK (status IN ('draft','active','superseded')),
  revision       integer NOT NULL DEFAULT 0,        -- draft only: optimistic locking
  summary        text NOT NULL DEFAULT '',
  limitations    jsonb NOT NULL DEFAULT '[]',       -- string[]
  question_links jsonb NOT NULL DEFAULT '{}',       -- {questionId: recordId[]}
  validation     jsonb NOT NULL DEFAULT '{"errors":[],"warnings":[]}',
  published_by   uuid REFERENCES meta.users(id),
  published_at   timestamptz,
  PRIMARY KEY (project_id, version)
);
CREATE UNIQUE INDEX sem_versions_one_active ON meta.sem_versions (project_id) WHERE status = 'active';

CREATE TABLE meta.sem_records (
  project_id    uuid NOT NULL,
  version       text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('term','mapping','relation','constraint','evidence')),
  record_id     text NOT NULL,                      -- T_commande, R_commande_client, C_rma_negatif, …
  body          jsonb NOT NULL,                     -- SemTerm | SemMapping | … (types/shared.ts)
  lifecycle     text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','superseded','proposed')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, version, record_id),
  FOREIGN KEY (project_id, version) REFERENCES meta.sem_versions(project_id, version) ON DELETE CASCADE
);
CREATE INDEX ON meta.sem_records (project_id, version, kind);

CREATE TABLE meta.sem_workload (
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  id            text NOT NULL,                      -- Q01, Q02, …
  text          text NOT NULL,
  use_case      text,
  source        text NOT NULL CHECK (source IN ('proposed','user')),
  picked        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);
CREATE TABLE meta.sem_goals (
  project_id    uuid PRIMARY KEY REFERENCES meta.projects(id) ON DELETE CASCADE,
  goal          text NOT NULL,                      -- the user's goal in their words
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.sem_trajectories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  session_id     uuid,                              -- agent session (no FK: sessions may be deleted)
  question       text NOT NULL,
  sem_version    text NOT NULL,
  semantic_calls jsonb NOT NULL DEFAULT '[]',       -- [{tool, input, result}]
  tool_calls     jsonb NOT NULL DEFAULT '[]',       -- [{tool, input, resultSummary}] (~2 KB each)
  answer         text NOT NULL DEFAULT '',
  status         text NOT NULL CHECK (status IN ('answered','failed','abandoned')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.sem_trajectories (project_id, created_at);

CREATE TABLE meta.sem_evolution_runs (              -- stretch
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  parent_version    text NOT NULL,
  candidate_version text,
  checkpoint_at     timestamptz NOT NULL,           -- trajectories after this time feed the run
  rounds            jsonb NOT NULL DEFAULT '[]',    -- [{diagnosis, patch, judgements:[{question, winner, reason, critical}]}]
  verdict           text CHECK (verdict IN ('accepted','rejected','incomplete')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

-- ───────────────────────────── Workspace (stages 3–4) ─────────────────────────────

CREATE TABLE meta.workspace_drafts (
  project_id    uuid PRIMARY KEY REFERENCES meta.projects(id) ON DELETE CASCADE,
  base_version  integer NOT NULL DEFAULT 0,         -- published version this draft started from
  sem_version   text,                               -- = doc.semanticVersion
  revision      integer NOT NULL DEFAULT 0,         -- increments on every draft edit (optimistic locking)
  doc           jsonb NOT NULL,                     -- WorkspaceDoc (types/shared.ts)
  validation    jsonb NOT NULL DEFAULT '{"errors":[],"warnings":[]}',
  updated_by    uuid REFERENCES meta.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.workspace_versions (
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  sem_version   text NOT NULL,
  doc           jsonb NOT NULL,
  message       text NOT NULL,
  published_by  uuid NOT NULL REFERENCES meta.users(id),
  published_via text NOT NULL CHECK (published_via IN ('ui','agent')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, version)
);

CREATE TABLE meta.pipeline_builds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  workspace_version integer NOT NULL,
  pipeline          text NOT NULL,
  output            text NOT NULL,
  table_name        text NOT NULL,                  -- e.g. data.pl_commandes_commandes_v3
  row_count         integer NOT NULL DEFAULT 0,
  input_versions    jsonb NOT NULL,                 -- {datasetId: version}
  definition_hash   text NOT NULL,                  -- "up to date" when hash and inputs are unchanged
  checks            jsonb NOT NULL DEFAULT '[]',    -- [{check, ok, detail}]
  status            text NOT NULL CHECK (status IN ('built','upToDate','failed')),
  duration_ms       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.pipeline_builds (project_id, pipeline, output, created_at DESC);

-- ───────────────────────────── Actions ─────────────────────────────

CREATE TABLE meta.action_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  workspace_version integer NOT NULL,              -- 0 for draft tests
  action_api_name  text NOT NULL,
  params           jsonb NOT NULL,
  dry_run          boolean NOT NULL,
  status           text NOT NULL CHECK (status IN ('applied','valid','rejected','failed')),
  errors           jsonb NOT NULL DEFAULT '[]',     -- [{path, code, message}]
  edits            jsonb NOT NULL DEFAULT '[]',     -- [{objectType, primaryKey, op, before:{}, after:{}}] (several objects)
  run_by           uuid NOT NULL REFERENCES meta.users(id),
  via              text NOT NULL CHECK (via IN ('ui','agent','automation')),
  agent_session_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.action_runs (project_id, created_at DESC);
CREATE INDEX action_runs_objects ON meta.action_runs USING gin (edits jsonb_path_ops); -- history per object

-- ───────────────────────────── Automations and notifications (stretch) ─────────────────────────────

CREATE TABLE meta.automation_state (
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  automation_id text NOT NULL,
  enabled       boolean NOT NULL DEFAULT false,
  enabled_by    uuid REFERENCES meta.users(id),     -- "currentUser" in effects
  members       text[] NOT NULL DEFAULT '{}',       -- primary keys currently in the condition's set
  evaluated_at  timestamptz,
  PRIMARY KEY (project_id, automation_id)
);

CREATE TABLE meta.automation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  automation_id text NOT NULL,
  trigger       text NOT NULL,                      -- 'action_run' | 'publish' | 'manual'
  entered       text[] NOT NULL,                    -- primary keys that entered the set
  effects       jsonb NOT NULL,                     -- [{kind, status, message}]
  fired_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES meta.users(id),
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text NOT NULL,
  link          text,                               -- front route, e.g. /p/:projectId/objects/CuisineJour/Frepillon|2025-10-14
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.notifications (user_id, read_at, created_at DESC);

-- ───────────────────────────── Agent ─────────────────────────────

CREATE TABLE meta.agent_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES meta.users(id),
  title          text NOT NULL DEFAULT 'New conversation',
  mode           text NOT NULL DEFAULT 'router' CHECK (mode IN ('router','explore','semantics','build')),
  status         text NOT NULL DEFAULT 'idle'
                 CHECK (status IN ('idle','running','awaiting_approval','awaiting_answer','error')),
  pending        jsonb,                             -- paused response: {results so far, remaining tool calls}
  token_estimate integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Append-only: items are never updated or deleted (05-agent.md §7).
CREATE TABLE meta.agent_items (
  session_id     uuid NOT NULL REFERENCES meta.agent_sessions(id) ON DELETE CASCADE,
  seq            integer NOT NULL,
  kind           text NOT NULL CHECK (kind IN
                   ('user_message','assistant_message','tool_call','tool_results',
                    'approval_request','approval_decision','question','answer',
                    'mode_change','system_note','note')),
  payload        jsonb NOT NULL,                    -- see 05-agent.md §8; assistant content stored as returned
  token_estimate integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE meta.approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES meta.agent_sessions(id) ON DELETE CASCADE,
  item_seq      integer NOT NULL,                   -- the tool_call item awaiting approval
  tool_name     text NOT NULL,
  args          jsonb NOT NULL,
  summary       text NOT NULL,                      -- plain-language line shown on the card
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','allowed','rejected')),
  decided_by    uuid REFERENCES meta.users(id),
  decided_at    timestamptz,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

RESET ROLE;
