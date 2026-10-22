# Consolidated plan: the eight chapters in one build plan

> **Status:** v0.1 (2026-10-20). Merges the feature lists of chapters 1–7 into one plan for the reduced Foundry. Items keep their chapter number so you can jump to the details: `2.F6` = chapter 2, feature F6.
> **Legend:** 🟢 observed in Foundry · 🟡 inferred · 🔵 our design choice. Everything in this file is 🔵 unless marked.
> **Docs check:** capabilities found in the public Foundry documentation but not yet in these chapters are listed in [docs-comparison.md](docs-comparison.md).

---

## 1. The product in one paragraph

Data arrives in a **project** through **connectors** (databases, files, APIs, synced on a schedule), **listeners** (events pushed from outside) or a plain upload; it becomes a versioned **dataset**. A **pipeline** cleans it on a schedule. The cleaned table becomes an **object type** in the **ontology**, with **links** to other types and **actions** that let people change objects safely. People use the objects through **Object Explorer** (search and browse, free for every type), **Workshop** apps (no-code screens), **automations** (when X happens, do Y) and **AI**: no-code **Logic** functions and chat **agents** that answer questions or build things on a branch. Changes go back out through **webhooks** (an action calls the outside system), **exports** (tables and files pushed on a schedule) and a **current-state dataset** (source data + edits) that pipelines can read.

## 2. Patterns shared by every module 🟢 → 🔵

Seen again and again in Foundry; build them once as platform services.

| # | Pattern | Seen in | Our version |
|---|---|---|---|
| S1 | **Resource IDs** `ri.<service>.<instance>.<type>.<uuid>`, everything in a folder tree | all | One `resources` table: id, type, parent, name, owner, timestamps |
| S2 | **Draft → validate → save version → publish** | ontology (2.F9), Workshop (4.W6), pipelines (5.P6), Logic (6.L1), automations (6.A5) | One generic "versioned document" service: `draft`, `validate`, `versions[]`, `published` pointer, `expectedVersion` on save |
| S3 | **Validation separate from apply** | actions `bulk-validate`, ontology `dry-run`, automation `validate-create`, pipeline `check-deployable` | Every write has a `…/validate` twin returning field-level errors |
| S4 | **Objects addressed by `{objectTypeId, primaryKey}`** | actions, Logic, Object Explorer | Same; never expose internal row ids |
| S5 | **Object set tree** (base, filter, link traversal, intersect / union) | Explorer, Workshop, Automate, Analyst | One query compiler (6.X1) used by every app |
| S6 | **Branches + proposals** for safe change | AI FDE, ontology, pipelines, Logic | Later, but keep `branchId` in every versioned document from day 1 |
| S7 | **Streamed run traces** (open/close span, model call, output) | AI agents, Logic preview | One event stream format for agents, Logic and pipeline previews |
| S8 | **Typed, versioned building blocks** (transforms, widgets, chart configs, expressions) | pipelines, Workshop, Explorer | `{kind, version, args}` everywhere so old documents keep working |
| S9 | **Edits live apart from source data** (object edits survive dataset replaces, keyed by primary key) and **never flow back on their own** | §4.2 of ch. 5; docs | Object store = indexed dataset rows + an edits overlay with an explicit merge rule. Three ways back out: a **writeback webhook** run *before* the edit (failure cancels the action; its response can fill properties), **side-effect webhooks** *after* (best effort), and a **current-state dataset** (source + edits, rebuilt within minutes or periodically) that pipelines and exports (7.C9) read. Not one transaction: an outside call that succeeded isn't undone if the edit fails. One owner per field, to avoid sync loops |
| S10 | **Everything an agent can do is an API with a typed schema** | AI FDE tools | Write each module's API with JSON schemas from the start; tools are generated from them |

## 3. Must-haves, in build order

Six milestones; each one is usable on its own. Counts are "Must" items from the chapters.

### M1 — Platform and data (chapter 1, 10 items)
| Item | Feature |
|---|---|
| 1.P1 | Spaces → projects → folders → resources, with ids (S1) |
| 1.P2 | Project roles: owner / editor / viewer |
| 1.P3 | Search, recent files, trash (soft delete) |
| 1.P4 | Project imports (explicit cross-project inputs) |
| 1.D1 | Upload CSV / Parquet / XLSX as a structured dataset, schema inference |
| 1.D2 | Transactions APPEND / SNAPSHOT: open → write files → commit; abort on failure |
| 1.D3 | Dataset view = last snapshot + later appends; history list |
| 1.D4 | Schema per branch + parse validation (failed rows shown) |
| 1.D5 | Preview with paging and column stats |
| 1.D6 | Dataset branches (simple), needed by pipelines |

### M1b — Data connection (chapter 7, 10 items) — user priority
| Item | Feature |
|---|---|
| 7.C1 | Source = connector + config + write-only secrets + test connection |
| 7.C2 | Connector plugin interface (JSON config schema, declared capabilities) |
| 7.C3 | First connectors: Postgres, S3-compatible, REST, SFTP |
| 7.C4 | Batch syncs: file / table, SNAPSHOT / APPEND, incremental column, preview |
| 7.C5 | Syncs run as build jobs with schedules and history (ch. 5) |
| 7.C6 | Webhooks: request template, typed inputs / outputs, sync / async, history; as action side effect, function, automation effect |
| 7.C7 | HTTPS listener (basic auth or HMAC) → stream / dataset, test page, logs |
| 7.C8 | Egress allowlist with admin approval |
| 7.C9 | Table and file exports (append / full, scheduled) |
| 7.C11 | REST "pull" sync (paginated GET into a dataset), our addition |

### M1c — Semantic bank (chapter 8, EvoOntology engine in TypeScript)
| Item | Feature |
|---|---|
| 8.E1 | Five record types (Term, Mapping, Relation, Constraint, Evidence) with controlled vocabularies |
| 8.E2 | A minimal card for every column, enriched by the seed questions |
| 8.E3 | Seed questions (~30) + glossary from the business operator |
| 8.E4 | Validation + versioned publication with question → object links |
| 8.E5 | `browse` / `resolve` for the FDE agent and the analyst |
| 8.E6 | A trajectory recorded for every analyst question |
| 8.E7 | Evolution: trigger, run, judge gate, accept / reject (minimal) |
| 8.E8 | Bank review screen |

The operational ontology (M2) is built **from the bank**: descriptions and aliases come from Terms, links from Relations, allowed values from constraints. The bank's evolution replaces the "metadata suggestions" idea of chapter 3 §4.x.

### M2 — Ontology and actions (chapter 2, 11 items)
| Item | Feature |
|---|---|
| 2.F1 | Object type from a dataset (primary key, title, column → property) |
| 2.F2 | Property types, display / API name, description, visibility |
| 2.F3 | List and search types, properties, links, actions |
| 2.F4 | Link types: foreign key (1 → N) |
| 2.F5 | Link types: many-to-many via a join dataset |
| 2.F6 | Action types: create / modify / delete rules, property ← parameter |
| 2.F7 | Action parameters: basic types + object reference, required, default |
| 2.F8 | Submission criteria (simple conditions) |
| 2.F9 | Draft → review → save with validation and diff (S2) |
| 2.F10 | Entity history |
| 2.F11 | Indexing status (indexed / failed) |

### M3 — Using objects: Explorer and Workshop (chapters 6 and 4, 13 items)
| Item | Feature |
|---|---|
| 6.X1 | Object set tree shared by all apps (S5) |
| 6.X2 | Object Explorer: type catalog, keyword search, list + filters, object page with links and actions |
| 6.X3 | Exploration charts: value counts, timeline, stats |
| 4.W1 | App definition = layout tree + widgets + variables (JSON, versioned) |
| 4.W2 | Variables: object set, filter, selection, count, simple transforms |
| 4.W3 | Widgets: object table, filter list, property list, metric card, chart, markdown, button → action, inline action form |
| 4.W4 | Layout: rows / columns, sizes, sections, resizable panels |
| 4.W5 | Editor: canvas, outline, config panel, variables panel, undo / redo |
| 4.W6 | Autosaved draft + save version + publish (S2) |
| 4.W7 | Labels bound to variables |
| 4.W8 | Two templates (blank, inbox) |
| 4.W9 | App definition editable as code (for agents, S10) |
| 4.W13 | Events: on click → set variable / navigate / run action |

### M4 — Pipelines, builds, schedules, lineage (chapter 5, 13 items)
| Item | Feature |
|---|---|
| 5.P1 | Pipeline = DAG of typed, versioned transforms + targets (S8) |
| 5.P2 | Graph editor: add data, add step, connect, select → preview |
| 5.P3 | ≈10 transforms: filter, select / rename, cast, join, union, aggregate, derive column |
| 5.P4 | Expression builder (column / value / expression, and / or) |
| 5.P5 | Preview on a sample with pinned input versions |
| 5.P6 | Draft + save version + history / reset (S2) |
| 5.P7 | Deploy = freeze version as job specs + build selected outputs |
| 5.P8 | Dataset outputs, created on first build |
| 5.P9 | Builds: status, jobs, input / output transactions, logs, abort |
| 5.P10 | "Up to date" skip when inputs unchanged |
| 5.P11 | Schedules: on input update + cron, or-combined |
| 5.P12 | Schedule run history |
| 5.P13 | Lineage API (+ simple graph later) |

### M5 — Automations (chapter 6, 6 items)
| Item | Feature |
|---|---|
| 6.A1 | Automation = condition + effects + settings, versioned, pause / resume, expiry |
| 6.A2 | Conditions: objects added / removed / modified in a set (live), time (cron) |
| 6.A3 | Effects: action, in-app notification, run function |
| 6.A4 | Event history with per-effect logs |
| 6.A5 | Validation separate from save (S3) |
| 6.A7 | Security scope: user vs project |

### M6 — AI: Logic functions and agents (chapters 6 and 3, 15 items)
| Item | Feature |
|---|---|
| 6.L1 | Logic function = typed inputs + blocks + output, draft / version / publish |
| 6.L2 | Use LLM block: system prompt, user message with variables, model, typed output |
| 6.L3 | Two tools in the LLM block: query objects, run action |
| 6.L4 | Preview run with streamed trace (S7) |
| 6.L5 | Functions propose edits; applied only via published function / action |
| 3.G1 | Agent engine: LLM loop with tool calls, streaming |
| 3.G2 | Conversation stored as ordered context items, saved each round |
| 3.G3 | Tool registry with risk categories + approval as a pause state |
| 3.G4 | Auto-approve per project and category |
| 3.G5 | Write protocol: branch → build → verify → proposal (S6) |
| 3.G6 | Typed code APIs as authoring surfaces (S10) |
| 3.G7 | Read tools: search, schema, SQL |
| 3.G8 | Analyst mode: SQL over object sets + aggregation + table / chart |
| 3.G11 | Two modes (build, analyze) swapping prompt and tools |
| 3.G17 | "Nothing found" results that explain why |

**Total: 86 must-haves from the eight chapters (8 from chapter 8), plus 8 remaining from the docs check (§3bis; N1 and N2 are now chapter 7) = 94.** M1–M3 alone already make a usable product (upload → objects → apps); M4–M6 make it alive and AI-native.

### 3bis. Added after the docs check ([docs-comparison.md](docs-comparison.md) §3)

**Data-model corrections, to apply before building:** C1 four transaction types (SNAPSHOT, APPEND, UPDATE, DELETE) + retention · C2 edit merge rules per datasource ("user edits win" or "most recent wins"; deleted rows; final deletes) · C3 compound schedule triggers (AND / OR tree, more event types) · C4 branch fallback chain, no data-branch merge · C5 action log as a first-class, revertable record.

| Item | New must-have | Milestone |
|---|---|---|
| ~~N1~~ | Connectors and syncs → now chapter 7 (7.C1–C5, C11) | M1b |
| N5 | Groups + roles incl. discoverer, SSO | M1 |
| N6 | Audit log | M1 |
| ~~N2~~ | Webhooks and listener → now chapter 7 (7.C6–C7) | M1b |
| N3 | Code functions (TypeScript or Python): objects, links, values, proposed edits; derived columns; function-backed actions | M3 |
| N7 | Generated SDK (TypeScript + Python) + **MCP server** exposing queries, actions, functions | M3 / M6 |
| N4 | Code transforms (SQL first, then Python) with preview and unit tests | M4 |
| N9 | Basic health checks (freshness, row count, schema change) + notifications | M4 |
| N10 | SQL endpoint over datasets and object sets (for BI tools) | M4 |
| N8 | Staged writes (human review) as the default for AI-proposed edits | M6 |

## 4. Later and Drop, in one place

| Group | Later | Drop for now |
|---|---|---|
| Data connection | source exploration (7.C10), CDC syncs (7.C12), streaming syncs / exports (7.C13), virtual tables (7.C14), named listeners (7.C15), email / WebSocket listeners (7.C16), on-prem agents (7.C17), export markings checks (7.C18) | 200+ SaaS connectors, media syncs, HyperAuto (7.C19) |
| Data | time travel / rollback (1.D7), health checks & compare (1.D8), project templates (1.P5), tags / portfolios / activity (1.P6) | media sets, unstructured datasets (1.D9); resource queues, access graph, markings (1.P7) |
| Ontology | action test run (2.F12), form sections (2.F13), revert (2.F14), function-backed actions (2.F15), branches & proposals (2.F16), shared properties / interfaces / value types (2.F17), object views (2.F18), time series / geo / media (2.F19), usage analytics (2.F20), row-level security (2.F21), advanced writeback datasets (2.F22; the basic current-state dataset is in S9), agent tool descriptions (2.F23, *plan now*) | cleanup, migrations, Marketplace, conditional formatting (2.F24) |
| Apps | Explorer shareable views & saved lists (6.X4–X5); Workshop version compare (4.W10), branches (4.W11), per-user state (4.W12), multi-page (4.W14), theming (4.W15) | 60+ other widgets, kiosk mode, Marketplace packaging (4.W16) |
| Pipelines | branches / proposals (5.P14), AIP steps, unit tests, expectations (5.P16), markings (5.P17), compute profiles, retries (5.P18) | streaming, alternative compute (5.P15) |
| Automations | threshold / time-series / stream / dependency conditions, grouping, auto-mute (6.A6) | |
| AI | bulk test & evals (6.L6), many models (6.L7), control flow & templates (6.L8), context compaction (3.G9, *plan data model now*), message tree (3.G10), saved analyses (3.G12), skills (3.G13), session files (3.G14), model tiers (3.G15) | voice, suggestions, auto-titles (3.G16) |

## 5. Our services (proposed) 🔵

| Service | Owns | Foundry counterparts seen 🟢 |
|---|---|---|
| `resources` | folders, projects, roles, search, trash | compass, multipass |
| `datasets` | datasets, branches, transactions, files, schemas, previews | foundry-catalog, data-proxy, foundry-metadata, schema-inference |
| `semantics` | the semantic bank: five record types, versions, validation, browse / resolve, trajectories, evolution runs (EvoOntology engine ported to TypeScript, MIT) | — (not a Foundry service; ch. 8) |
| `connections` | connectors, sources + secrets, egress allowlist, syncs (as build jobs), exports, webhooks + executions, listeners → streams | source-store, network-egress-policies, webhook registry / executor, stream catalog (`magritte-*`) |
| `ontology` | object / link / action types, versions, drafts | ontology-metadata |
| `objects` | index of objects + edits overlay, object-set queries, aggregations | phonograph2, objects-data-funnel, object-set-service |
| `actions` | validate + apply action, edit log | actions |
| `apps` | Workshop app documents, runtime queries | carbon-server |
| `pipelines` | pipeline documents, previews, deploy → job specs | eddie |
| `builds` | builds, jobs, logs, schedules, lineage | build2, job-tracker, scheduler, monocle |
| `automations` | automations, evaluation, events, notifications | object-sentinel |
| `functions` | Logic documents, execution, traces | eddie (logic), function-executor |
| `ai` | model gateway, agent sessions, tools, approvals | language-model-service, ai-fde, aip-assist |

## 6. Where the details are

| Chapter | Data model | Screens | API (observed / proposed) | Pseudo-code |
|---|---|---|---|---|
| [1 Projects & datasets](01-projects-and-datasets.md) | §2–3 | §2–3 | §3 (journeys) | §5 |
| [2 Ontology Manager](02-ontology-manager.md) | §2 | §3 | §6, §7bis | §7 |
| [3 AI agents](03-ai-agents.md) | §5 | §3–4 | §2–4 | §7 |
| [4 Workshop](04-workshop.md) | §2 | §3 | §5 | §7 |
| [5 Pipelines, builds, schedules](05-pipelines-builds-schedules.md) | §2 | §3 | §5 | §7 |
| [6 Explorer, Automate, Logic](06-explorer-automate-logic.md) | §2 | §3 | §5 | §7 |
| [7 Data connection](07-data-connection.md) | §2 | §3 | §4 | §7 |
| [8 Semantic engine (EvoOntology)](08-semantic-engine.md) | §3 | — | §4 | §6 (port scope) |
