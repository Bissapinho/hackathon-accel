# 03 — Data model

Postgres, four schemas:

| Schema | Contains | Who writes |
|---|---|---|
| `meta` | All metadata: users, projects, datasets, workspace documents, action log, automations state, notifications, agent sessions | services (migrations in `schema.sql`) |
| `data` | **One table per dataset version**: `data.ds_<shortId>_v<n>` with typed columns | dataset service only |
| `edits` | **One table per object type** with user edits: `edits.<type_sql_name>` | actions service only |
| `ont` | **One view per object type**: `ont.<type_sql_name>` = current dataset version ⟕ edits | ontology publish only |

The agent's SQL tool connects with role `mini_reader`: `SELECT` on `ont` and `data`, nothing else, `statement_timeout = 5s`, results capped at 500 rows.

## 1. Metadata tables (`meta`)

See `schema.sql` for exact DDL. Summary:

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Seeded demo users | id, email, display_name |
| `projects`, `project_members` | Containers + roles (`owner` / `editor` / `viewer`) | project_id, user_id, role |
| `datasets` | A named dataset in a project | id, short_id (8 chars, used in table names), name, current_version |
| `dataset_versions` | One per upload | dataset_id, version, transaction_type (`SNAPSHOT`/`APPEND`), table_name, row_count, columns (jsonb: name, type, nullable, sample), source_file, parse_errors (jsonb) |
| `workspace_drafts` | **The** draft of a project's workspace document (ontology + apps + automations) | project_id (PK), base_version, revision, doc (jsonb), validation (jsonb), updated_by |
| `workspace_versions` | Published snapshots, immutable | project_id, version, doc, message, published_by, published_at |
| `action_runs` | **Action log**: every validate-or-apply, by a user or the agent | id, project_id, action_api_name, params, dry_run, status (`applied`/`rejected`/`failed`), errors, edits (what changed: before/after per property), run_by, via (`ui`/`agent`), agent_session_id |
| `automation_state` | Enabled flag + current members per automation | project_id, automation_id, enabled, members (text[] of primary keys), evaluated_at |
| `automation_events` | Each firing | automation_id, fired_at, entered (text[]), effects (jsonb: per effect status + message) |
| `notifications` | In-app notifications | user_id, project_id, title, body, link, read_at |
| `agent_sessions` | One conversation | id, project_id, user_id, title, mode, status (`idle`/`running`/`awaiting_approval`/`awaiting_answer`/`error`), capabilities (text[]), token_estimate |
| `agent_items` | Ordered conversation items | session_id, seq, kind, payload (jsonb), token_estimate, hidden |
| `approvals` | Pending / decided approvals | session_id, item_seq, tool_name, args, summary, status, decided_by, decided_at |
| `metadata_suggestions` | Suggestions from the analyst step | project_id, target (jsonb), field, suggested_value, rationale, status (`open`/`accepted`/`dismissed`) |

## 2. The workspace document

One JSON document per project holds **everything the agent builds**. Draft and published versions share the same shape. Exact TypeScript types: `04-api.md` §3.

```jsonc
{
  "objectTypes": [ { "apiName": "Ticket", "displayName": "Ticket", "pluralDisplayName": "Tickets",
                     "description": "...", "aliases": ["issue", "case"],
                     "datasetId": "…", "primaryKey": "ticketId", "titleProperty": "title",
                     "properties": [ { "apiName": "ticketId", "column": "ticket_id", "type": "string",
                                       "displayName": "Ticket ID", "description": "...", "aliases": [], "editable": false } ] } ],
  "linkTypes":   [ { "apiName": "assignedTo", "from": "Ticket", "to": "TeamMember", "cardinality": "many-to-one",
                     "fromProperty": "assignee", "toProperty": "fullName",
                     "displayName": "Assigned to", "reverseDisplayName": "Assigned tickets", "description": "..." } ],
  "actionTypes": [ { "apiName": "ResolveTicket", "displayName": "Resolve ticket", "description": "...", "agentDescription": "...",
                     "parameters": [ … ], "rules": [ … ], "submissionCriteria": [ … ], "successMessage": "..." } ],
  "apps":        [ { "id": "triage", "name": "Ticket triage", "pages": [ … ] } ],
  "automations": [ { "id": "urgent-alert", "name": "Urgent ticket alert", "condition": { … }, "effects": [ … ] } ]
}
```

**Why one document:** publishing is atomic (ontology, app and automation change together), diffs are easy to show, and versions/history come for free (`workspace_versions`). The draft carries `base_version`; publish fails with `VERSION_CONFLICT` if someone else published in between.

## 3. Generated tables and views (per publish)

For each object type `T` (SQL name `t`, e.g. `Ticket` → `ticket`) backed by dataset version table `data.ds_x_vN`:

```sql
-- created if missing; new editable columns added with ALTER TABLE ... ADD COLUMN
CREATE TABLE IF NOT EXISTS edits.ticket (
  pk            text PRIMARY KEY,           -- primary key value, always text
  status        text,                       -- one nullable column per editable property, same type
  resolved_at   timestamptz,
  resolved_by   text,
  resolution_note text,                     -- edit-only property (no source column)
  _nulls        text[] NOT NULL DEFAULT '{}',  -- properties explicitly set to null
  _deleted      boolean NOT NULL DEFAULT false,
  _created      boolean NOT NULL DEFAULT false, -- object created by an action (no source row)
  _edited_at    timestamptz NOT NULL DEFAULT now(),
  _edited_by    text NOT NULL,
  _action_run_id uuid
);

CREATE OR REPLACE VIEW ont.ticket AS
SELECT
  COALESCE(s.ticket_id, e.pk)                                     AS ticket_id,
  s.title                                                         AS title,
  CASE WHEN 'status' = ANY(e._nulls) THEN NULL ELSE COALESCE(e.status, s.status) END AS status,
  -- … one expression per property (editable ones use the CASE/COALESCE form) …
  e.resolution_note                                               AS resolution_note
FROM data.ds_x_vN s
FULL OUTER JOIN edits.ticket e ON e.pk = s.ticket_id::text
WHERE COALESCE(e._deleted, false) = false
  AND (s.ticket_id IS NOT NULL OR e._created);                     -- objects created by actions
```

Rules (from the feature book, ch. 5 §4.2 and the docs check C2):
- **Edits win** over source values for edited properties (the only merge strategy in the slice).
- A source row deleted by a re-upload removes the object; if the row comes back, its edits apply again. Objects created by an action (`_created`) survive.
- Re-publishing after a dataset re-upload only swaps the view's `FROM` table; edits are untouched.
- View column names = property SQL names (`snake_case` of the API name), so the agent's SQL reads naturally: `SELECT priority, count(*) FROM ont.ticket GROUP BY 1`.
- One SQL comment per view and column (`COMMENT ON VIEW/COLUMN`) holds the description, so SQL clients see the semantics too.

## 4. Dataset tables

`data.ds_<shortId>_v<n>`: columns named after the CSV header normalized to `snake_case`, typed by inference (§5), plus `_row` (integer, 1-based line number) for error messages. APPEND creates `v<n+1>` = `v<n>` rows + new rows (fine at demo scale; note in `08-tasks.md` "later: real append").

## 5. Schema inference

On upload, sample up to 1 000 rows; for each column pick the first type in this order where ≥ 98 % of non-empty values parse: `integer` → `double` → `boolean` (true/false/yes/no/1/0) → `date` (ISO `YYYY-MM-DD`) → `timestamp` (ISO 8601) → `string`. Empty strings become `NULL`. Rows that fail to parse into the chosen type are kept with `NULL` in that cell and reported in `parse_errors` (row number, column, raw value, expected type), shown in the preview and available to the agent.

## 6. Identifiers and naming

| Thing | Format | Example |
|---|---|---|
| Ids of rows in `meta` | `uuid` | |
| Dataset short id | 8 lowercase alphanumerics | `k3f9a2qx` |
| Object type API name | `PascalCase`, unique per project | `Ticket` |
| Property / link API name | `camelCase`, unique per type | `assignedTo` |
| Action API name | `PascalCase` verb + noun | `ResolveTicket` |
| SQL name | `snake_case` of the API name, validated by `ident()` | `ticket`, `assigned_to` |
| Object reference | `{ objectType, primaryKey }` | `{ "objectType": "Ticket", "primaryKey": "T-2003" }` |
