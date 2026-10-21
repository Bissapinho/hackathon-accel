# 01 — Architecture

> Product working name: **Mini-Foundry**. Scope: the hackathon slice of `02-slice-and-demo.md`. Everything here is our own design; the feature book (`../feature-book/`) explains where the ideas come from.

## 1. Goals and constraints

| Constraint | Consequence |
|---|---|
| 1–2 days, 1–3 people, built with Claude Code | One repo, one language, few moving parts, strong typing, tests that run in seconds |
| Runs on a laptop | `docker compose up` for the database; the app runs with `pnpm dev` |
| Data = static CSV files uploaded by hand | No connectors in the slice; upload + schema inference only |
| The demo = **the agent builds everything from a conversation** | Every platform capability is first an **API with a typed schema**, then a UI. The UI mostly shows what the agent built and asks for approvals |
| LLM = DeepSeek (any OpenAI-compatible API) | One small model gateway with `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`; tool calling through the standard chat-completions `tools` field |

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (Node 22) | One language for server, agent, UI and shared types |
| Repo | **pnpm workspaces**: `apps/server`, `apps/web`, `packages/shared` | Shared types and schemas between server and UI |
| Server | **Fastify** + **zod** (request validation) + `zod-to-json-schema` (tool schemas) | Fast, typed, one schema source for API and agent tools |
| Database | **Postgres 16** (Docker) via **`pg`** + **Kysely** (typed SQL) | Metadata *and* data in one place; SQL is also what the agent uses to verify and analyse |
| CSV parsing | `csv-parse` | Streaming, robust |
| LLM | `openai` npm client pointed at `LLM_BASE_URL` | DeepSeek speaks the same protocol |
| Streaming to the UI | **Server-Sent Events** (SSE) | Simple one-way stream for agent progress |
| Web | **React 18 + Vite + TanStack Query + React Router**, charts with **Recharts** | Quick to build, Claude Code knows it well |
| Tests | **Vitest** (unit + API integration against a test database), **Playwright** for one end-to-end demo rehearsal | |

No message queue, no object storage, no separate search engine, no Spark: Postgres handles it at this scale (thousands of rows).

## 3. Big picture

```
 Browser (React)
   │  REST + SSE
   ▼
 apps/server (Fastify)
   ├─ resources   : projects, folders (one tree)                     ─┐
   ├─ datasets    : upload CSV → schema inference → versioned tables   │
   ├─ ontology    : drafts, validation, publish, versions              │  Postgres
   ├─ objects     : object views (source + edits), queries, SQL       │   ├─ schema meta : all metadata tables
   ├─ actions     : validate / apply / log, edits overlay              │   ├─ schema data : one table per dataset version
   ├─ apps        : app documents (generic renderer)                   │   ├─ schema ont  : one VIEW per object type
   ├─ automations : condition → effects, events, notifications         │   └─ schema edits: one table per object type
   ├─ agent       : sessions, loop, tools, approvals, traces          ─┘
   └─ llm         : gateway to DeepSeek (OpenAI-compatible)  ──────────► LLM API (internet)
```

## 4. How data flows

1. **Upload**: a user uploads `tickets.csv` into a project. The server parses it, infers column types, writes the rows into a new table `data.ds_<datasetShortId>_v<version>` and records the dataset version. (APPEND creates a new version containing old + new rows; SNAPSHOT replaces.)
2. **Ontology** (built by the agent, approved by the user): an object type points at a dataset and maps columns to properties, with a primary key and a title property. On publish the server (re)creates:
   - `edits.<objectTypeApiName>`: one row per edited object (primary key + nullable edited columns + `deleted` flag + audit columns);
   - `ont.<objectTypeApiName>`: a **view** = current dataset table `LEFT JOIN` edits, with `COALESCE(edit, source)` per editable property and `deleted` rows filtered out.
   So "indexing" is instant and **edits survive dataset re-uploads** (they're keyed by primary key).
3. **Links** are declared on the ontology (foreign key: source property → target primary key, or matching property). Link traversal is a SQL join generated from the definition.
4. **Actions** validate parameters and submission criteria, then write into the `edits` table in one transaction, and append an **action log** row.
5. **Automations** are evaluated after every action run and every dataset publish: the server recomputes the members of the automation's object set and fires effects for objects that entered (or changed in) the set.
6. **Apps** are JSON documents rendered by one generic React renderer; their data comes from the objects API.
7. **The agent** reads and writes all of the above through tools that call the same service functions as the REST API (never through HTTP to itself).

## 5. Agent architecture (summary; full spec in `05-agent.md`)

- **Server-side loop** (survives a closed tab): `agent_sessions`, `agent_items` (messages, tool calls, tool results), persisted after every step; the browser subscribes over SSE.
- **Modes**: `explore` (read tools) and `build` (read + draft-writing tools); a tiny router stage picks the mode.
- **Drafts are a free zone**: the agent edits a **workspace draft** (ontology + apps + automations) without asking. **Leaving the draft asks**: publishing, running an action on real objects, enabling an automation.
- **Approval is a session state** (`awaiting_approval`), not a UI trick; the card shows the exact arguments, a plain-language summary and Reject / Allow.
- **Self-verification** with SQL and dry-runs before claiming success; failed checks block "done".
- **Every tool call has a `rationale {title, why}`**: the UI shows it as a step card for non-technical users.

## 6. Configuration (`.env`)

```
DATABASE_URL=postgres://mini:mini@localhost:5432/mini
LLM_BASE_URL=https://api.deepseek.com        # any OpenAI-compatible endpoint
LLM_MODEL=deepseek-chat                      # must support tool calling; check the provider's docs
LLM_API_KEY=...                              # set by the team, never committed
LLM_MAX_CONTEXT_TOKENS=64000                 # our working budget, below the model's maximum
DATA_DIR=./var/uploads                       # raw uploaded files kept for audit
PORT=4000
```

## 7. Security and data handling (slice level)

- Single organization, simple users (seeded), roles per project: owner / editor / viewer. No markings or row-level security in the slice.
- The agent runs **as the current user**: its tools check the same permissions as the API.
- The SQL tool uses a **read-only Postgres role** limited to schema `ont` (and `data` for dataset previews), with a statement timeout and a row limit.
- Everything sent to the LLM leaves the laptop: use synthetic or non-sensitive data for the demo.
- Secrets only in `.env`; the agent never sees them.

## 8. What is deliberately left out of the slice

Connectors and syncs, writeback webhooks, pipelines / transforms, branches and proposals (replaced by the single workspace draft), the Workshop-style drag-and-drop editor (the agent writes app JSON), permissions beyond project roles, documents / embeddings, Logic functions (the analyst answers with SQL instead). Each has a chapter in the feature book and a "later" slot in `08-tasks.md`.
