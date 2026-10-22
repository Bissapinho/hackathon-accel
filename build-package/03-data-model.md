# 03 — Data model

Postgres, five schemas:

| Schema | Contains | Who writes |
|---|---|---|
| `meta` | All metadata: users, projects, datasets, the **semantic bank** (versions, records, workload, trajectories), workspace documents, pipeline builds, action log, automations state, notifications, agent sessions | services (migrations in `schema.sql`) |
| `data` | **One table per dataset version** `data.ds_<shortId>_v<n>` and **one table per pipeline output build** `data.pl_<pipeline>_<output>_v<n>` | dataset service, pipeline builder |
| `edits` | **One table per object type** with user edits: `edits.<type_sql_name>` | actions service only |
| `ont` | **One view per object type**: `ont.<type_sql_name>` = source table ⟕ edits | workspace publish only |
| `logic` | **One view per object type**: `logic.<type_sql_name>` = `ont.<type>` + one column per derived property and rule | workspace publish only |

The agent's SQL tool connects with role `mini_reader`: `SELECT` on `logic`, `ont` and `data`, nothing else, `statement_timeout = 5s`, results capped at 500 rows.

## 1. Metadata tables (`meta`)

See `schema.sql` for exact DDL. Summary:

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Seeded demo users | id, email, display_name |
| `projects`, `project_members` | Containers + roles (`owner` / `editor` / `viewer`) | project_id, user_id, role |
| `datasets` | A named dataset in a project | id, short_id (8 chars, used in table names), name, current_version, `simulated` (bool, set at upload) |
| `dataset_versions` | One per upload | dataset_id, version, transaction_type (`SNAPSHOT`/`APPEND`), table_name, row_count, columns (jsonb: name, type, nullable, sample), profile (jsonb, §5), profile_status (`pending`/`running`/`done`/`failed`), dropped_at (table removed by the retention rule, §4), source_file, parse_errors (jsonb) |
| `jobs` | Background jobs run by the server, one at a time (profiles) | id, kind, target, status, progress, error, created_at, finished_at |
| `sem_versions` | Versions of the **semantic bank** | project_id, version (`draft`, `v0`, `v1`…), status (`draft`/`active`/`superseded`), summary, limitations (jsonb), question_links (jsonb: question id → record ids), published_by, published_at, revision (draft only) |
| `sem_records` | The five record types, one row per record per version (§6) | project_id, version, kind (`term`/`mapping`/`relation`/`constraint`/`evidence`), record_id, body (jsonb), lifecycle (`active`/`superseded`/`proposed`) |
| `sem_workload` | Seed questions and the user's goal | project_id, id, text, source (`proposed`/`user`), picked (bool), use_case |
| `sem_trajectories` | One per analyst answer | project_id, session_id, question, sem_version, semantic_calls (jsonb), tool_calls (jsonb, results truncated ~2 KB), answer, status, created_at |
| `sem_evolution_runs` *(stretch)* | Evolution runs and rounds | project_id, parent_version, candidate_version, rounds (jsonb), verdict (`accepted`/`rejected`/`incomplete`) |
| `workspace_drafts` | **The** draft of a project's workspace document (pipelines + ontology + logic + actions + apps + automations) | project_id (PK), base_version, sem_version, revision, doc (jsonb), validation (jsonb), updated_by |
| `workspace_versions` | Published snapshots, immutable | project_id, version, sem_version, doc, message, published_by, published_at |
| `pipeline_builds` | One per pipeline output materialized on publish | project_id, workspace_version, pipeline, output, table_name, row_count, input_versions (jsonb), checks (jsonb), duration_ms, status |
| `action_runs` | **Action log**: every validate-or-apply, by a user or the agent | id, project_id, action_api_name, params, dry_run, status (`applied`/`rejected`/`failed`), errors, edits (per object: before/after per property), run_by, via (`ui`/`agent`/`automation`), agent_session_id |
| `automation_state`, `automation_events`, `notifications` *(stretch)* | As before | |
| `agent_sessions` | One conversation | id, project_id, user_id, title, mode, status (`idle`/`running`/`awaiting_approval`/`awaiting_answer`/`error`), token_estimate |
| `agent_items` | Ordered conversation items, **append-only** (`05-agent.md` §7) | session_id, seq, kind, payload (jsonb), token_estimate |
| `approvals` | Pending / decided approvals | session_id, item_seq, tool_name, args, summary, status, decided_by, decided_at |

## 2. The workspace document

One JSON document per project holds **everything the agent builds** in stages 3 and 4. Draft and published versions share the same shape. Exact TypeScript types: `04-api.md` §3.

```jsonc
{
  "semanticVersion": "v0",
  "pipelines":   [ { "apiName": "commandes", "description": "...", "terms": ["T_commande"],
                     "nodes": [ { "id": "src", "kind": "source", "datasetId": "…" },
                                { "id": "so", "kind": "filter", "input": "src",
                                  "where": { "op": "startsWith", "column": "no_transaction", "value": "SO-" } },
                                { "id": "doc", "kind": "aggregate", "input": "so", "groupBy": ["no_transaction", "id_interne_client_netsuite", "date"],
                                  "measures": [ { "as": "lignes", "fn": "count" }, { "as": "quantite", "fn": "sum", "column": "quantite" } ] } ],
                     "outputs": [ { "apiName": "commandes", "node": "doc" } ],
                     "checks":  [ { "output": "commandes", "kind": "unique", "columns": ["no_transaction"] } ] } ],
  "objectTypes": [ { "apiName": "Commande", "displayName": "Commande", "pluralDisplayName": "Commandes",
                     "description": "...", "aliases": ["order", "SO"], "term": "T_commande",
                     "source": { "kind": "pipeline", "pipeline": "commandes", "output": "commandes" },
                     "primaryKey": "noTransaction", "titleProperty": "noTransaction",
                     "properties": [ { "apiName": "noTransaction", "column": "no_transaction", "type": "string",
                                       "displayName": "N° de commande", "description": "...", "aliases": [], "editable": false, "term": "T_commande_id" } ] } ],
  "linkTypes":   [ { "apiName": "client", "from": "Commande", "to": "Client", "cardinality": "many-to-one",
                     "keys": [ { "fromProperty": "clientId", "toProperty": "clientId" } ], "relation": "R_commande_client",
                     "displayName": "Client", "reverseDisplayName": "Commandes", "description": "..." } ],
  "logic":       [ { "apiName": "tauxRetour", "objectType": "Client", "kind": "derived", "type": "double",
                     "expr": { "div": [ { "aggregate": { "link": "retours", "fn": "sum", "property": "quantiteAbs" } },
                                        { "aggregate": { "link": "commandes", "fn": "sum", "property": "quantiteLivree" } } ] },
                     "displayName": "Taux de retour", "description": "...", "constraints": ["C_taux_retour_base_livree"] },
                   { "apiName": "surcharge", "objectType": "CuisineJour", "kind": "rule",
                     "condition": { "op": "gt", "left": { "property": "charge" }, "right": { "property": "capacite" } },
                     "displayName": "En surcharge", "description": "..." } ],
  "actionTypes": [ { "apiName": "ReaffecterProduction", "displayName": "Réaffecter une production", "description": "...", "agentDescription": "...",
                     "parameters": [ … ], "rules": [ … ], "submissionCriteria": [ … ], "successMessage": "..." } ],
  "apps":        [ ],
  "automations": [ ]
}
```

**Why one document:** publishing is atomic (pipelines, ontology, logic and actions change together), diffs are easy to show, and versions/history come for free (`workspace_versions`). The draft carries `base_version`; publish fails with `VERSION_CONFLICT` if someone else published in between. It also carries `sem_version`; if a newer semantic version is published, validation warns `SEM_VERSION_STALE`.

**Traceability:** pipelines, object types, properties, links, logic and actions carry optional `term` / `terms` / `relation` / `constraints` fields pointing at records of the semantic version. Validation warns (`MISSING_TERM`) when an object type or link has none.

## 3. Generated tables and views (per publish)

Only **one publish runs at a time** per database (`pg_try_advisory_lock`; a second one gets `PUBLISH_IN_PROGRESS`), because the deployed database has one CPU (`01-architecture.md` §9). Progress (step, pipeline, rows written) is streamed as events.

Order of work on publish, in one transaction per step, stopping at the first failure:

1. **Pipelines**: for each pipeline whose definition or input versions changed, compile its graph to one SQL statement (a CTE per node, `04-api.md` §6), `CREATE TABLE data.pl_<pipeline>_<output>_v<n> AS …`, run its checks, record `pipeline_builds`. Unchanged pipelines keep their last build ("up to date").
2. **Indexes**: on every source table used by an object type, create indexes on the primary-key column and on every link key column (`CREATE INDEX IF NOT EXISTS`). Needed at 2 M rows.
3. **Edits and ontology views**: for each object type `T` (SQL name `t`) backed by table `S` (a dataset version or a pipeline output):

```sql
-- created if missing; new editable columns added with ALTER TABLE ... ADD COLUMN
CREATE TABLE IF NOT EXISTS edits.lot_production (
  pk             text PRIMARY KEY,           -- primary key value, always text
  lieu_production text,                      -- one nullable column per editable property, same type
  _nulls         text[] NOT NULL DEFAULT '{}',
  _deleted       boolean NOT NULL DEFAULT false,
  _created       boolean NOT NULL DEFAULT false, -- object created by an action (no source row)
  _values        jsonb,                      -- all property values of a created object
  _edited_at     timestamptz NOT NULL DEFAULT now(),
  _edited_by     text NOT NULL,
  _action_run_id uuid
);

CREATE OR REPLACE VIEW ont.lot_production AS
SELECT
  COALESCE(s.lot_id, e.pk)                                                  AS lot_id,
  CASE WHEN 'lieu_production' = ANY(e._nulls) THEN NULL
       ELSE COALESCE(e.lieu_production, s.lieu_production) END              AS lieu_production,
  COALESCE(s.date_production, (e._values->>'date_production')::date)        AS date_production
  -- … one expression per property …
FROM data.pl_production_lots_v3 s
FULL OUTER JOIN edits.lot_production e ON e.pk = s.lot_id::text
WHERE COALESCE(e._deleted, false) = false
  AND (s.lot_id IS NOT NULL OR e._created);
```

4. **Logic views**: for each object type, `logic.<t>` = `ont.<t>` plus one column per derived property and rule, compiled from the logic expressions (§7). Rules are `boolean` columns.
5. **Comments**: one `COMMENT ON VIEW/COLUMN` per view and column, holding the description and, when present, the Term's definition, so SQL clients see the semantics too.

Rules (from the feature book, ch. 5 §4.2 and the docs check C2):
- **Edits win** over source values for edited properties (the only merge strategy in the slice).
- A source row deleted by a re-upload or a pipeline rebuild removes the object; if the row comes back, its edits apply again. Objects created by an action (`_created`) survive.
- Re-publishing after a dataset re-upload rebuilds the affected pipelines and swaps the views' `FROM` tables; edits are untouched.
- Links join on view columns, so **re-linking is an edit of the key property** (moving a lot to another kitchen = editing its `lieu_production`). Derived properties and rules see the change immediately because `logic` sits on `ont`.
- View column names = property SQL names (`snake_case` of the API name), so the agent's SQL reads naturally: `SELECT nom, taux_retour FROM logic.client ORDER BY 2 DESC LIMIT 5`.

## 4. Dataset tables

`data.ds_<shortId>_v<n>`: columns named after the CSV header normalized to `snake_case` (accents removed, `Cat_gorie` stays `cat_gorie`), typed by inference (§5), plus `_row` (integer, 1-based line number) for error messages. Loaded with `COPY … FROM STDIN` from the (gunzipped) stream into a `text` staging table, then cast into the typed table in one `INSERT … SELECT`; cells that fail the cast become `NULL` and are reported. APPEND creates `v<n+1>` = `v<n>` rows + new rows (fine at this scale; "later: real append").

**Retention (8 GB disk):** for datasets over 500 000 rows, once a publish that reads the current version succeeds, the tables of older versions are dropped (`dropped_at` set; the metadata row stays for history). Smaller datasets keep every version.

## 5. Schema inference and profile

On upload, sample up to 5 000 rows for inference; for each column pick the first type in this order where ≥ 98 % of non-empty values parse: `integer` → `double` → `boolean` (`true`/`false`/`True`/`False`/`yes`/`no`/`1`/`0`) → `date` (ISO `YYYY-MM-DD`, or French `DD/MM/YYYY`) → `timestamp` (ISO 8601, or `DD/MM/YYYY HH:MM`) → `string`. Empty strings, `None`, `null` and `NaN` become `NULL`. Values like `69.0%`, `J+3` or `350g` stay `string`; giving them meaning is the semantics stage's job.

After loading, the **profile** is computed in SQL on the full table (not the sample) by a **background job** (the upload returns as soon as the rows are in; `profile_status` tracks it) and stored in `dataset_versions.profile`: per column null count, distinct count, uniqueness, min / max, top 10 values with counts, and for strings the most common prefix pattern (`SO-…`, `RMA-…`, `C….`). The profile feeds the minimal cards (§6) and `profile_columns`; the cards are written when the profile finishes.

## 6. The semantic bank

The five record types of EvoOntology (feature book ch. 8 §3), stored as `sem_records.body`. Field names follow EvoOntology's `ontology-schema.md`; our additions are marked 🔵.

| Kind | Body (summary) |
|---|---|
| `term` | `id`, `name`, `type` (`entity` / `metric` / `dimension` / `category` / `concept`), `definition`, `scope`, `aliases`, `evidence` (ids), 🔵 `status` (`card` = minimal, `enriched`) |
| `mapping` | `id`, `term_id`, `database_source` (🔵 the dataset id), `table`, `column`, `semantic_filter` (words, not SQL), `aggregation_semantics` (words), `grain`, `validation`, `evidence` |
| `relation` | `id`, `source`, `relation_type` ∈ `association` / `hierarchy` / `composition` / `equivalence` / `derivation`, `target`, `connection_condition` (words), `description`, 🔵 `keys: [{fromColumn, toColumn}]` checked by an Evidence join query, `evidence` |
| `constraint` | `id`, `target` (term or mapping), `constraint_type` (`enum_semantics` / `data_quality` / `business_rule` / `unit` / `scope`), `trigger_keywords`, `severity` (`block` / `warning` / `info`), `scope`, `confidence`, `description`, 🔵 `options` (for an open ambiguity: the readings the user can choose from) and `resolution` (`{choice, note?, by, at}`), `evidence` |
| `evidence` | `id`, `source`, `query` (read-only SQL, run by the server), `result` (summary, ≤ 2 KB, written by the server), `validation_method`, `timestamp` |

Exact TypeScript types: `SemTerm`, `SemMapping`, `SemRelation`, `SemConstraint`, `SemEvidence` in `types/shared.ts`.

**Minimal cards** (written by the upload, not the agent): for each column one `term` (name from the column, type guessed: an id-like unique column → `entity` key, low-cardinality string → `category`, numeric → `metric`, date → `dimension`, otherwise `concept`; definition `"to be defined"`, `status: card`), one `mapping` to the column, and one `evidence` with the profile summary. Simulated datasets also get a `scope` constraint "simulated data, calibrated on real orders" with severity `warning`.

**Rules:** the bank stores meaning and grounding only: no SQL templates, no agent strategies. Evidence queries are the only SQL in it. A published version is immutable; resolving an open constraint after publication creates a new version.

## 7. Logic compilation

| Logic element | SQL in `logic.<t>` |
|---|---|
| `{property: p}` | `o.p` |
| `{literal: v}` / `now` / `today` | typed literal / `now()` / `current_date` |
| `{add|sub|mul|div: [a, b]}` | arithmetic; `div` is `a / NULLIF(b, 0)` |
| `{aggregate: {link, fn, property?, where?}}` | `(SELECT fn(x.property) FROM logic.<target> x WHERE <link keys match> AND <where>)`; `fn` ∈ `count`, `sum`, `avg`, `min`, `max`; nesting a derived property of the target is allowed one level deep |
| `{coalesce: [a, b]}`, `{case: [{when, then}], else}` | `COALESCE`, `CASE` |
| rule `condition` | the same `Filter` grammar as object sets (`04-api.md` §3), evaluated per row → `boolean` |

Derived properties are read-only (`RULE_SETS_READONLY` if an action targets one). Cycles between derived properties are rejected (`LOGIC_CYCLE`).

## 8. Identifiers and naming

| Thing | Format | Example |
|---|---|---|
| Ids of rows in `meta` | `uuid` | |
| Dataset short id | 8 lowercase alphanumerics | `k3f9a2qx` |
| Semantic record id | kind prefix + snake_case | `T_commande`, `R_commande_client`, `C_rma_negatif` |
| Pipeline / output API name | `snake_case` | `commandes`, `production_lots` |
| Object type API name | `PascalCase`, unique per project | `Commande`, `CuisineJour` |
| Property / link / logic API name | `camelCase`, unique per type | `tauxRetour`, `client` |
| Action API name | `PascalCase` verb + noun | `ReaffecterProduction` |
| SQL name | `snake_case` of the API name, validated by `ident()` | `cuisine_jour`, `taux_retour` |
| Object reference | `{ objectType, primaryKey }` | `{ "objectType": "Commande", "primaryKey": "SO-081234" }` |
