# CLAUDE.md — Mini-Foundry (specs + code in one repository)

This repository holds the specs (`build-package/`), the research (`feature-book/`) **and the code** (`apps/`, `packages/`). The specs say `docs/build-package/`: in this repository that folder is **`build-package/`** (not copied, so there is one source of truth). Shared contracts that the specs place in `docs/build-package/` (`tools/catalog.json`, `types/shared.ts`, `schema.sql`) are updated there.

## ⚠️ Mandatory before any task: the work split

Two people build this on two machines: **Alexandre owns Part A (data platform)** and **Alfred owns Part B (semantics and agent)**. Before starting any task, **read `build-package/09-work-split.md`**, then:

1. Find out which part this session works on: ask the user if it isn't obvious from the request or from `git config user.name`.
2. Only take tasks of that part (09 §2) and only edit that part's files (09 §3).
3. Never edit the other part's files. If the task needs a change there, or in a shared contract (`packages/shared/`, `ports.ts`, `agent/tools/types.ts`, `db/readonly.ts`, migrations, `tools/catalog.json`), stop and say what must change so the owner can do it (09 §6.2).
4. Where the two parts meet, code against the contract and stub of 09 §4, never against the other part's implementation.

## What we're building

The **server** of a reduced data-and-ontology platform where a **non-technical user turns their company's data into something they can trust and act on by chatting with an AI agent**, on Kumo's NetSuite 2025 exports: upload files → the agent agrees questions with the user and builds the **meaning** of the data (EvoOntology semantic bank, with evidence) → it builds **pipelines, object types and links** on that meaning → it adds **logic and actions** → the user approves each publish → the agent verifies and explains. The front end is built by another team against our API. Specs live in `build-package/`. Read `02-slice-and-demo.md` first, then the spec for the area you're touching.

## Commands

```
pnpm install
docker compose up -d db          # local Postgres 16 on :5432 (development and tests)
pnpm db:migrate                  # applies apps/server/migrations/*.sql (TLS + CA when DATABASE_CA_CERT is set, e.g. Aiven)
pnpm db:seed                     # demo users + project "Kumo 2025"
pnpm seed:kumo <folder>          # upload a folder of CSV / CSV.gz files (fixtures/kumo-mini or the real files)
pnpm dev                         # server :4000
pnpm chat                        # CLI client for the agent (SSE), for rehearsals without the front
pnpm test                        # vitest (unit + API integration on a local test DB, LLM_MOCK=1)
pnpm typecheck && pnpm lint
```

## Layout

```
apps/server/src/
  modules/<area>/        resources, datasets, jobs, semantics, pipelines, workspace, objects, logic, actions,
                         apps, automations, agent, llm
    service.ts           business logic (the only place that touches the DB for this area)
    routes.ts            Fastify routes: validate with zod, call service, map errors
    schemas.ts           zod schemas (imported by routes AND by agent tools)
  agent/
    loop.ts              the agent loop (append-only items, pauses for approvals and questions)
    tools/<tool>.ts      one file per tool: zod input schema, modes, risk level, handler calling services
    prompts/             our own prompt text (build-package/prompts); semantics.md keeps the EvoOntology notice
  llm/                   Anthropic gateway + mock gateway (LLM_MOCK=1)
  db/                    Kysely instance, generated types, ident() helper
  migrations/            numbered SQL files
apps/cli/                pnpm chat
packages/shared/src/     types shared by server, CLI and the front team (documents, API DTOs, SSE events)
fixtures/kumo-mini/      synthetic Kumo-shaped data + its seeded generator
```

## Rules (follow them; they come from what makes this kind of platform work)

1. **API first.** Every capability is a service function + a zod schema. The REST route and the agent tool both call the service. Never let a tool call the HTTP API.
2. **One schema source.** zod schemas in `schemas.ts`; JSON schemas for tools are generated from them (`zod-to-json-schema`). Never hand-write a JSON schema that duplicates a zod one.
3. **Validate separately from apply.** Every write has a `validate*` function returning field-level errors (`{path, code, message}`); `apply*` calls it first and refuses on errors. The agent uses validate, previews and tests as dry-runs.
4. **Versioned documents, two drafts.** The semantic bank and the workspace document each have one draft (with `revision`) and immutable published versions; saves send `expectedRevision` and fail with `409 VERSION_CONFLICT` if stale. The workspace records the semantic version it was built on.
5. **Meaning first.** Build mode is locked until a semantic version is published. Objects, links, logic and actions point at the Terms, Relations and Constraints they come from.
6. **The bank holds meaning only.** No SQL in semantic records except Evidence queries, which the server runs with the read-only role and whose results the server writes.
7. **Objects are addressed by `{objectType, primaryKey}`.** Never expose internal row ids.
8. **Edits never touch source tables.** They go to `edits.<type>` and are merged by `ont.<type>`; `logic.<type>` adds derived properties and rules on top. Re-uploads and pipeline rebuilds must keep edits.
9. **No raw SQL from documents.** Pipelines, filters and logic are typed JSON compiled to SQL with parameterized values and `ident()`-checked names.
10. **Typed building blocks.** Every block in a document has `kind` (+ `version` when it can evolve); unknown kinds fail validation with a clear message.
11. **Errors explain themselves.** API and tool errors carry `code`, a human `message` and, when relevant, a `hint`. "Not found" says *why*.
12. **Drafts are a free zone; leaving them asks.** Tools are tagged `meta`, `read`, `bankDraft`, `draft` or `gated`. Only `gated` tools pause for approval (`05-agent.md` §5).
13. **Append-only agent history.** Never update or delete `agent_items`; Claude's content (thinking blocks included) is replayed exactly as returned.
14. **Small database.** The deployed Postgres has one CPU: heavy work only at publish, one publish at a time, profiles as background jobs, no scans of raw line tables per request.
15. **Kumo data never enters git.** Only `fixtures/kumo-mini/` (synthetic) is committed. No real values in tests, logs at info level, or recorded sessions.
16. **Plain language for users.** Any text shown to end users avoids jargon; IDs go in details.
17. **Small, tested steps.** Each task in `08-tasks.md` ends with its "done when" checks passing. Add or update tests with every change.
18. **No secrets in code or logs.** `ANTHROPIC_API_KEY` and database passwords only in `.env`.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- SQL identifiers built from user input go through one helper (`ident()`) that validates `^[a-z][a-z0-9_]{0,62}$`.
- API names: object types `PascalCase`, properties / links / logic `camelCase`, pipelines `snake_case`; SQL names are `snake_case`.
- Semantic record ids: `T_…`, `M_…`, `R_…`, `C_…`, `E_…`; record fields follow EvoOntology's snake_case names.
- Dates: store `timestamptz` in UTC.
- Commit messages: imperative, one topic per commit.

## When unsure

Check the spec in `build-package/`; if it's silent, follow the nearest existing pattern in the code; if still unsure, ask in the PR description rather than inventing a new pattern.

## Phase 0 decisions (not in the specs)

- **Services by part:** `apps/server/src/services.alexandre.ts` and `services.alfred.ts` each return their part's service modules; `services.ts` merges them into `Services` (the `services` of `ToolContext`). Same split as `register.*.ts` and `agent/tools/index.*.ts`.
- **Login (slice auth):** `GET /api/users` (seeded users), `POST /api/login {email}` (sets the signed cookie `mini_uid`), `POST /api/logout`. A route without a valid cookie returns `401 UNAUTHENTICATED`. `User`, `ProjectSummary` and `Me` live in `modules/resources/schemas.ts` (not yet in `packages/shared`).
- **Route guard:** `requireProject(req, services.resources, projectId, 'read' | 'write')` from `src/auth.ts`.
- **Tests:** `pnpm test` migrates and seeds `TEST_DATABASE_URL` (default `postgres://mini:mini@localhost:5432/mini_test`, created by `scripts/docker-initdb/`) once, then runs files one after another.
- **Migrations** are tracked in `public.schema_migrations`; `MINI_APP_PASSWORD` (Aiven) is set on `mini_app` by `pnpm db:migrate`.
