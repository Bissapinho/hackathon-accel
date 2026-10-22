# 01 — Architecture

> Product working name: **Mini-Foundry**. Scope: the hackathon slice of `02-slice-and-demo.md`, applied to **Kumo's NetSuite 2025 data**. Everything here is our own design; the feature book (`../feature-book/`) explains where the ideas come from, and chapter 8 covers the semantic engine (EvoOntology).

## 1. Goals and constraints

| Constraint | Consequence |
|---|---|
| 1–2 days, 1–3 people, built with Claude Code | One repo, one language, few moving parts, strong typing, tests that run in seconds |
| Develop on a laptop, **deploy the database on Aiven** (1 CPU / 2 GB RAM / 8 GB storage, paid from €50 of credits) | Local: `docker compose up` for Postgres, `pnpm dev` for the server. Deployed: Aiven for PostgreSQL + the Node server on a host of our choice (§9). Heavy work is done once at publish, never per query |
| **The front end is built by another team** | This package specifies the server, its API and its event stream. `06-screens.md` is the contract the front builds against; no UI tasks are ours |
| Data = Kumo's exports (13 NetSuite/app tables + 3 simulated tables), uploaded by hand as CSV / CSV.gz | No connectors in the slice; upload + schema inference + profiling only. Largest tables: 2.2 M and 2.9 M rows, so loading uses `COPY` and profiling runs in SQL |
| The user is **not technical** | They describe goals in plain words; the agent turns them into questions, meaning, pipelines, objects, logic and actions, and asks only business questions with choices |
| The demo = **the agent builds everything from a conversation**, in four stages: **ingest → semantics → ontology (pipelines + objects + links) → logic and actions** | Every platform capability is first an **API with a typed schema**, then a UI. The UI mostly shows what the agent built and asks for approvals |
| LLM = **Claude** (Anthropic API), allowed by Kumo for the hackathon | One small model gateway on `@anthropic-ai/sdk`; tool use through the Messages API |

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (Node 22) | One language for server, agent, UI and shared types |
| Repo | **pnpm workspaces**: `apps/server`, `apps/web`, `packages/shared` | Shared types and schemas between server and UI |
| Server | **Fastify** + **zod** (request validation) + `zod-to-json-schema` (tool schemas) | Fast, typed, one schema source for API and agent tools |
| Database | **Postgres 16**: Docker locally, **Aiven for PostgreSQL** deployed; via **`pg`** + **Kysely** (typed SQL), `pg-copy-streams` for loading | Metadata, data, pipeline outputs, object views and the semantic bank in one place; SQL is also what the agent uses to verify and analyse |
| CSV parsing | `csv-parse` (inference sample) + `zlib` gunzip stream into `COPY` | `.csv.gz` files load without unpacking |
| LLM | **`@anthropic-ai/sdk`**, model `claude-opus-5-5` | Tool use, adaptive thinking, prompt caching, 1 M context |
| Streaming to the UI | **Server-Sent Events** (SSE) | Simple one-way stream for agent progress |
| Web | **Not ours**: built by the front team against `04-api.md` and `06-screens.md` | |
| Tests | **Vitest** (unit + API integration against a local test database) | |

No message queue, no object storage, no separate search engine, no Spark: Postgres handles a few million rows.

## 3. Big picture

```
 Browser (React)
   │  REST + SSE
   ▼
 apps/server (Fastify)
   ├─ resources   : projects, folders (one tree)                        ─┐
   ├─ datasets    : upload CSV/CSV.gz → inference → versioned tables       │
   ├─ semantics   : the bank (EvoOntology engine in TS): Terms, Mappings, │  Postgres
   │                Relations, Constraints, Evidence; versions; browse /  │   ├─ meta  : all metadata + semantic bank
   │                resolve; trajectories; evolution (stretch)            │   ├─ data  : dataset versions + pipeline outputs
   ├─ pipelines   : typed transform graphs → SQL → materialized outputs   │   ├─ ont   : one VIEW per object type (source ⟕ edits)
   ├─ ontology    : drafts, validation, publish, versions                 │   ├─ logic : one VIEW per object type (ont + derived properties)
   ├─ objects     : object views, queries, read-only SQL, links           │   └─ edits : one table per object type
   ├─ logic       : derived properties and rules, compiled to views       │
   ├─ actions     : validate / apply / log, edits overlay                 │
   ├─ apps, automations (stretch)                                         │
   ├─ agent       : sessions, loop, tools, approvals, traces             ─┘
   └─ llm         : gateway to the Anthropic API  ──────────────────────► Claude (internet)
```

## 4. How data flows

1. **Ingest** (by hand): the user uploads each file into the project. The server streams it into `data.ds_<shortId>_v<n>` with `COPY`, infers types, profiles every column in SQL and records the dataset version. Then it writes a **minimal card** for every column into the semantic bank's draft (a Term, a Mapping and one Evidence; no LLM). APPEND creates a new version with old + new rows; SNAPSHOT replaces.
2. **Semantics** (agent, `semantics` mode): the agent proposes seed questions from the user's goal; the user picks them. The agent then enriches the cards those questions touch: definitions, value meanings, relations between Terms, business rules, all backed by Evidence queries. Open ambiguities become questions with choices. Publishing a **semantic version** is gated.
3. **Ontology** (agent, `build` mode), built on a published semantic version:
   - **pipelines** turn raw tables into object-ready tables (roll order lines up into orders, split orders from returns, derive keys, join reference tables). On publish they are materialized as `data.pl_<pipeline>_<output>_v<n>`;
   - **object types** point at a dataset or a pipeline output, map columns to properties (primary key, title), and take their descriptions and aliases from Terms;
   - **links** come from the bank's `composition` / `association` Relations (one or several key columns).
   On publish the server (re)creates `edits.<type>` tables and `ont.<type>` views = source `FULL JOIN` edits, so edits survive re-uploads and pipeline rebuilds.
4. **Logic** (same draft): **derived properties** (expressions and aggregates over linked objects) and **rules** (named boolean conditions). On publish the server builds `logic.<type>` = `ont.<type>` + one column per derived property and rule. Because it sits on `ont`, logic always reflects the latest edits.
5. **Actions** validate parameters and submission criteria (criteria may call rules), then write into the `edits` tables in one transaction and append an **action log** row. An action can involve several objects: change the key that links one object to another, create an object linked to others, update both sides.
6. **Automations and apps** (stretch) use the same object sets and rules.
7. **The agent** reads and writes all of the above through tools that call the same service functions as the REST API (never through HTTP to itself). Every analyst answer goes through the bank (`resolve`) and is recorded as a trajectory.

## 5. Agent architecture (summary; full spec in `05-agent.md`)

- **Server-side loop** (survives a closed tab): `agent_sessions`, `agent_items` persisted after every step; the browser subscribes over SSE.
- **Modes**: `explore` (read), `semantics` (read + bank draft), `build` (read + workspace draft). A router stage picks the first mode; `build` is locked until a semantic version is published.
- **Drafts are a free zone** (bank draft and workspace draft). **Leaving a draft asks**: publishing semantics, publishing the workspace, running an action on real objects, enabling an automation.
- **Approval is a session state** (`awaiting_approval`); the card shows a plain-language summary, the diff, the exact arguments, and Reject / Allow.
- **Self-verification** with SQL, pipeline previews, logic tests and action dry-runs before claiming success; failed checks block "done".
- **Every tool call has a `rationale {title, why}`**, shown as a step card for non-technical users.

## 6. Configuration (`.env`)

```
DATABASE_URL=postgres://mini:mini@localhost:5432/mini   # Aiven: postgres://mini_app:…@<service>.aivencloud.com:<port>/defaultdb?sslmode=verify-full
DATABASE_CA_CERT=./var/aiven-ca.pem          # Aiven only: the project CA certificate, downloaded from the console
DB_POOL_MAX=5                                # server connections; keep small on the 1-CPU plan
PREVIEW_TIMEOUT_MS=30000                     # pipeline previews (agent SQL stays at 5 s)
ANTHROPIC_API_KEY=...                        # set by the team, never committed
LLM_MODEL=claude-opus-5-5
LLM_EFFORT=high                              # output_config.effort; Opus 5.5 defaults to medium, so set it
LLM_JUDGE_MODEL=claude-opus-5-5              # evolution judge (stretch), configured separately
LLM_MAX_CONTEXT_TOKENS=200000                # our working budget, well below the 1 M window
DATA_DIR=./var/uploads                       # raw uploaded files kept for audit (git-ignored)
UPLOAD_MAX_MB=400
PORT=4000
```

## 7. Security and data handling (slice level)

- Single organization, simple users (seeded), roles per project: owner / editor / viewer. No markings or row-level security in the slice.
- The agent runs **as the current user**: its tools check the same permissions as the API.
- The SQL tool uses a **read-only Postgres role** limited to schemas `logic`, `ont` and `data`, with a statement timeout and a row limit.
- **Kumo data:** sending it to Claude is allowed in the context of the hackathon. Kumo's agreement still applies:
  - the data files and anything derived from them row by row are **never committed** (`var/`, `data/`, `*.csv*`, `*.parquet` in `.gitignore`); the repo's test fixtures are a small **synthetic, Kumo-shaped** sample;
  - only **aggregated results** leave the hackathon, after Kumo's review;
  - the agent's base prompt forbids trying to identify who is behind a code (clients `C0421`, people `PERS07`, etc.);
  - the Aiven service is created in an **EU region**;
  - the uploaded files and the database are deleted on the date set by the agreement: **delete the Aiven service** (which also stops billing), plus `pnpm db:wipe` and `rm -rf var/` on every laptop.
- Secrets only in `.env`; the agent never sees them.

## 8. What is deliberately left out of the slice

Connectors and syncs, pipeline schedules (the data is static), writeback webhooks, branches and proposals (replaced by the two drafts), the Workshop-style drag-and-drop editor (the agent writes app JSON), the pipeline graph editor (the agent writes pipeline JSON; the UI shows it read-only), LLM blocks inside Logic functions, permissions beyond project roles, documents / embeddings, Parquet and XLSX upload, **the whole front end** (another team). Apps and automations are **stretch** goals. Each has a chapter in the feature book.

## 9. Deployment on Aiven

### What runs where

| Part | Where |
|---|---|
| Postgres (all five schemas, the semantic bank, the data) | **Aiven for PostgreSQL**, plan 1 CPU / 2 GB RAM / 8 GB storage, Postgres 16, EU region |
| Node server (API, SSE, agent loop) | A Node 22 host in the same region (or the presenter's laptop for the demo). Aiven hosts the database only |
| Front end | The front team's choice; it calls the server's API |
| Development and automated tests | Local Docker Postgres with `fixtures/kumo-mini/`; never against Aiven |

### Sizing (why this plan is enough)

- **Disk:** the 16 files are 466 MB as CSV (order lines 266 MB, simulated store stock 176 MB). In Postgres, with indexes and pipeline outputs: about **2–3 GB**, plus about 0.5 GB of staging while the biggest file loads. Alert at 80 % disk use.
- **RAM:** about 0.5 GB of Postgres cache plus about 1 GB of OS cache. Pipeline outputs (orders, returns, kitchens, lots) and indexes fit in memory; the 2.2 M order lines mostly do.
- **CPU:** one core, so one heavy query at a time and no parallel query. This is the real limit and drives the rules below.

### Rules for this plan

1. **Heavy work happens once, at publish.** Pipelines roll the 2.2 M lines up into small tables; logic and the agent's questions run on `logic.*` and pipeline outputs, never on raw line tables (rule in `prompts/build.md` and `prompts/explore.md`).
2. **One publish at a time**: a Postgres advisory lock; a second publish gets `409 PUBLISH_IN_PROGRESS`.
3. **The full-table profile runs as a background job** after loading; the upload returns as soon as the rows are in.
4. **Timeouts:** agent SQL 5 s, pipeline previews 30 s (`PREVIEW_TIMEOUT_MS`), publish has none but reports progress over SSE.
5. **Keep only the current version of large datasets** (> 500 000 rows) once a publish that uses it succeeds; older version tables are dropped.
6. **Pool of 5 connections**, direct connection (not Aiven's PgBouncer pools: we use session settings such as `SET ROLE` and `statement_timeout`).
7. **Load the real data before the demo**, with the seed script (`pnpm seed:kumo`), not live. `STOCKS_MAGASINS_JOUR_2025` is optional: the demo doesn't use it, and leaving it out halves loading time.

### Roles

| Role | Created by | Rights |
|---|---|---|
| `avnadmin` | Aiven | Used only by `pnpm db:migrate` (creates schemas and the two roles below) |
| `mini_app` | migration | Owner of the five schemas; used by the server |
| `mini_reader` | migration | `SELECT` on `logic`, `ont`, `data`; used by the agent's SQL tool and evidence queries |

### Steps (task T-D1)

1. Create the service in the Aiven console (PostgreSQL 16, the 1 CPU / 2 GB / 8 GB plan, EU region); download the CA certificate to `var/aiven-ca.pem`.
2. `DATABASE_URL=<avnadmin URL> pnpm db:migrate` (TLS with the CA), then `pnpm db:seed`.
3. Set the server's `.env` to `mini_app`, start the server, `GET /api/health` returns `{db: "ok"}`.
4. `pnpm seed:kumo <folder>` loads the 16 files (or 15 without the simulated store stock); wait for the background profiles.
5. Check disk use in the Aiven console (< 80 %) and run the rehearsal (`07-acceptance-tests.md` §3).
6. After the hackathon, at the agreed date: delete the service.
