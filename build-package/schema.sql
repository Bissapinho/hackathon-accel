-- 001_init.sql — Mini-Foundry metadata schema (Postgres 16)
-- Generated tables live in schemas data / edits / ont and are created at runtime by the services.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS data;
CREATE SCHEMA IF NOT EXISTS edits;
CREATE SCHEMA IF NOT EXISTS ont;

-- Read-only role for the agent's SQL tool and dataset previews.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mini_reader') THEN
    CREATE ROLE mini_reader NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA ont, data TO mini_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA ont  GRANT SELECT ON TABLES TO mini_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA data GRANT SELECT ON TABLES TO mini_reader;

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

CREATE TABLE meta.datasets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  short_id        text NOT NULL UNIQUE CHECK (short_id ~ '^[a-z0-9]{8}$'),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
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
  columns          jsonb NOT NULL,                  -- [{name, sqlName, type, nullable, distinctEstimate, sample: []}]
  parse_errors     jsonb NOT NULL DEFAULT '[]',     -- [{row, column, value, expected}]
  source_file      text NOT NULL,                   -- path under DATA_DIR
  created_by       uuid NOT NULL REFERENCES meta.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);

CREATE TABLE meta.workspace_drafts (
  project_id    uuid PRIMARY KEY REFERENCES meta.projects(id) ON DELETE CASCADE,
  base_version  integer NOT NULL DEFAULT 0,         -- published version this draft started from
  revision      integer NOT NULL DEFAULT 0,         -- increments on every draft edit (optimistic locking)
  doc           jsonb NOT NULL,                     -- WorkspaceDoc (04-api.md §3)
  validation    jsonb NOT NULL DEFAULT '{"errors":[],"warnings":[]}',
  updated_by    uuid REFERENCES meta.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.workspace_versions (
  project_id    uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  doc           jsonb NOT NULL,
  message       text NOT NULL,
  published_by  uuid NOT NULL REFERENCES meta.users(id),
  published_via text NOT NULL CHECK (published_via IN ('ui','agent')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, version)
);

CREATE TABLE meta.action_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  workspace_version integer NOT NULL,
  action_api_name  text NOT NULL,
  params           jsonb NOT NULL,
  dry_run          boolean NOT NULL,
  status           text NOT NULL CHECK (status IN ('applied','valid','rejected','failed')),
  errors           jsonb NOT NULL DEFAULT '[]',     -- [{path, code, message}]
  edits            jsonb NOT NULL DEFAULT '[]',     -- [{objectType, primaryKey, op, before:{}, after:{}}]
  run_by           uuid NOT NULL REFERENCES meta.users(id),
  via              text NOT NULL CHECK (via IN ('ui','agent','automation')),
  agent_session_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.action_runs (project_id, created_at DESC);

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
  link          text,                               -- app route, e.g. /p/:projectId/objects/Ticket/T-2003
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meta.notifications (user_id, read_at, created_at DESC);

CREATE TABLE meta.agent_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES meta.users(id),
  title          text NOT NULL DEFAULT 'New conversation',
  mode           text NOT NULL DEFAULT 'router' CHECK (mode IN ('router','explore','build')),
  status         text NOT NULL DEFAULT 'idle'
                 CHECK (status IN ('idle','running','awaiting_approval','awaiting_answer','error')),
  capabilities   text[] NOT NULL DEFAULT '{}',
  token_estimate integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.agent_items (
  session_id     uuid NOT NULL REFERENCES meta.agent_sessions(id) ON DELETE CASCADE,
  seq            integer NOT NULL,
  kind           text NOT NULL CHECK (kind IN
                   ('user_message','assistant_message','tool_call','tool_result',
                    'approval_request','approval_decision','question','answer','mode_change','note')),
  payload        jsonb NOT NULL,                    -- see 05-agent.md §8
  token_estimate integer NOT NULL DEFAULT 0,
  hidden         boolean NOT NULL DEFAULT false,    -- hidden from the model (summary kept in payload.summary)
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
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meta.metadata_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES meta.projects(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES meta.agent_sessions(id) ON DELETE SET NULL,
  target          jsonb NOT NULL,                   -- {kind:'objectType'|'property'|'linkType'|'actionType', objectType?, apiName}
  field           text NOT NULL CHECK (field IN ('description','displayName','aliases')),
  suggested_value jsonb NOT NULL,
  rationale       text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
