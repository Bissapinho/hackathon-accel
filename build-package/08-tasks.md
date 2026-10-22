# 08 — Tasks for Claude Code

> **Read `09-work-split.md` first.** Every task below has one owner there (Alexandre = Part A, Alfred = Part B); take only your own.

Ordered so that something works at the end of every block. Each task is sized for one focused Claude Code session (≈30–90 min). "Done when" = the checks to run before moving on. Test ids refer to `07-acceptance-tests.md`.

## Block P — Before the hackathon


| #    | Task                                                                                                                                                                                                                                                                                                                                                 | Done when                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| T-P1 | **Port the EvoOntology engine to TypeScript** (feature book ch. 8 §6): the five record types and closed vocabularies, validation, versioned store on Postgres (`sem_`* tables), `browse` / `resolve`, publication with summary / limitations / question links, trajectories. Keep EvoOntology's MIT notice in `NOTICE` and in `prompts/semantics.md` | Parity tests against the Python behaviour on a small fixture bank; S1, S4, S5 |
| T-P2 | Update `types/shared.ts`, `schema.sql` and `tools/catalog.json` to this package and rewrite `prompts/*.md` (`semantics.md` new; `build.md`, `base.md`, `explore.md`, `router.md` per `05-agent.md` §6) | **Done in this package**; keep them in sync when a spec changes |




## Block 0 — Skeleton


| #     | Task                                                                                                                                                                                                                                                                                                                                 | Done when                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| T-01 | Create the pnpm monorepo (`apps/server`, `packages/shared` — the shared types are what the front team imports), TypeScript strict, ESLint, Vitest, `docker-compose.yml` with Postgres 16 for local work, `.env.example` (01-architecture §6), `.gitignore` with `var/`, `data/`, `*.csv*` outside `fixtures/`, `*.parquet`; copy `CLAUDE.md`; copy `LICENSE-EvoOntology` to the root as `NOTICE`; copy this package into `docs/build-package/` | `pnpm typecheck`, `pnpm test` (empty) and `docker compose up -d db` succeed |
| T-02 | Migrations runner + `001_init.sql` (= `schema.sql`, five schemas, roles `mini_app` and `mini_reader`, TLS with `DATABASE_CA_CERT` when set); seed: 2 users (Ada = owner, Ben = viewer), project "Kumo 2025" | `pnpm db:migrate && pnpm db:seed` idempotent, locally and against an Aiven-like TLS URL; tables and roles exist |
| T-02b | `fixtures/generate-kumo-mini.ts` (seeded) producing `fixtures/kumo-mini/` with the facts of `07` §0                                                                                                                                                                                                                                  | Running it twice gives identical files                                                   |
| T-03  | Fastify server with error mapping (`ApiError`), cookie "login as seeded user", `GET /api/me`, project role guard; copy `types/shared.ts` into `packages/shared`                                                                                                                                                                      | `/api/me` returns Ada and her project; viewer guard returns `FORBIDDEN` on a write route |
| T-04 | `pnpm chat` CLI client: opens a session, sends messages, prints SSE events (step titles, blocks, questions, approvals) and answers questions / approvals from the terminal. Lets us rehearse without the front | A message round-trips with the mock LLM |
## Block 1 — Ingest


| #    | Task                                                                                                                                                                                                      | Done when                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| T-05 | Upload `.csv` / `.csv.gz`: streamed `COPY` into a staging table, inference on 5 000 rows (03-data-model §5, French dates, `True`/`False`), typed table, parse errors; APPEND / SNAPSHOT; `simulated` flag | D1, D2, D3; the real 2.2 M-row file loads in < 2 min locally           |
| T-06 | SQL profile on the full table (incl. prefix patterns) as a **background job** (`jobs` table, one at a time), preview and profile endpoints (incl. composite `matchAgainst`) | D4; the upload returns before the profile is done |
| T-07 | Minimal semantic cards on upload (03-data-model §6)                                                                                                                                                       | D5                                                                     |
| T-08 | Seed script `pnpm seed:kumo <folder> [--skip STOCKS_MAGASINS_JOUR_2025]` that uploads the 16 real files (or the fixture folder) and waits for the profiles | The fixture loads by script; previews, profiles and cards exist |
## Block 2 — Semantics


| #    | Task                                                                                                                                                                                                      | Done when                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| T-09 | Semantic routes (04-api §1 Semantics): overview, records, browse, resolve, workload, draft ops with revisions, evidence queries run server-side, validate, publish with the open-decision check, versions | S1–S5 through the API                                       |
## Block 3 — Pipelines, workspace and objects


| #    | Task                                                                                                                                                                        | Done when                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T-11 | Workspace draft: zod schemas for `WorkspaceDoc` and `DraftOp` (incl. pipelines, logic, composite links, `semanticVersion`), `PATCH draft` with revisions, `discard`, `diff` | Applying `expected-workspace.json` as ops yields the same doc; diff lists additions |
| T-12 | Pipeline compiler (node graph → CTE SQL, 04-api §6), preview, checks, build on publish with "up to date" skip, `pipeline_builds`                                            | W2 (pipeline codes), W3                                                             |
| T-13 | Validation (04-api §5) incl. data checks on datasets and pipeline previews                                                                                                  | W1, W2                                                                              |
| T-14 | Publish: advisory lock (`PUBLISH_IN_PROGRESS`), progress events, build pipelines, indexes, `edits.*` tables, `ont.*` views with comments, history with semantic version, retention of large datasets | W4, W5, W6 |
| T-15 | Object set compiler (`ObjectSet`/`Filter` → SQL), query, aggregate, get object with links (single and composite keys)                                                       | O1 (without rules), O2                                                              |
| T-16 | Read-only SQL endpoint (role `mini_reader` on `logic`, `ont`, `data`; parser check, timeout, cap)                                                                           | O3                                                                                  |
## Block 4 — Logic and actions


| #    | Task                                                                                                                                                                                                                                                         | Done when                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| T-18 | Logic compiler (03-data-model §7): derived properties and rules → `logic.*` views on publish; `test_logic` on draft logic; cycle detection; rules usable in object-set filters                                                                               | L1, L2, O1                                             |
| T-19 | Action engine: object and value parameters, `modify` / `create` / `delete` rules, criteria incl. `rule` with `afterEdits` (evaluated inside the transaction before commit), dry-run, draft test, apply to `edits.*`, action log with before/after per object | A1–A5                                                  |
## Block 5 — The agent


| #    | Task                                                                                                                                                                                                                                                                                                                  | Done when                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| T-21 | LLM gateway on `@anthropic-ai/sdk` (05-agent §1 "Claude specifics": streaming + `finalMessage()`, adaptive thinking with summaries, effort, `auto` tool choice, eager input streaming with zod validation, fallbacks, refusal handling, caching) + **mock gateway** replaying recorded Anthropic responses from JSONL | Unit tests with the mock; one live call with a tool returns a `tool_use` block     |
| T-22 | Agent sessions, append-only items, SSE events, the loop (05-agent §1) with modes as mid-conversation system messages, the `build` lock, approvals and questions as pause states (including later tool calls of the same response)                                                                                     | G1–G6, G10 with the mock                                                           |
| T-23 | Meta + read tools incl. `bank_overview`, `browse_semantics`, `resolve_semantics` with trajectories; rationale, compact results, size tags; context editing past the threshold                                                                                                                                         | G7, G8, G11; each read tool has a test against the seeded DB                       |
| T-24 | Semantics tools (`set_workload`, `edit_semantics`, `validate_semantics`, gated `publish_semantics`) and build tools (`edit_draft`, `preview_pipeline`, `test_logic`, `test_action`, `validate_draft`, `diff_draft`, gated `publish_draft` and `run_action`) with approval summaries                                   | G3, G5; the mock script builds `expected-workspace.json` end to end on `kumo-mini` |
| T-25 | Prompts loader (`prompts/*.md` + session facts), chat blocks parser incl. `definition` and `decision`                                                                                                                                                                                                                 | G9                                                                                 |
## Block 6 — Deployment and rehearsal


| #    | Task                                                                                                                                                            | Done when                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| T-D1 | **Deploy on Aiven** (01-architecture §9): create the PostgreSQL service (1 CPU / 2 GB / 8 GB, EU), migrate as `avnadmin`, run the server as `mini_app` with TLS, `GET /api/health`, load the real data with `pnpm seed:kumo` | X1, X2 |
| T-28 | **Live rehearsal on the real data on Aiven**, three times with `pnpm chat` (or the front if ready), fixing prompts and tools between runs | R1–R12 three times; X3 |
| T-30 | Record `fixtures/demo-session.jsonl` from a live run on `kumo-mini` | `LLM_MOCK=1` replays the demo through the API |
## Block 7 — Stretch (if time allows)


| #    | Task                                                                   | Done when                                          |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| T-31 | App documents: validation of `AppDef` and the object sets its blocks use (the front renders them); the agent writes a kitchen planning app | P1 |
| T-32 | Automations on rules (over-capacity alert), notifications API | AU1 |
| T-33 | Evolution: trigger, run, judge gate, `adopt_semantic_version`          | A candidate is offered only after winning the gate |


**Front end:** built by another team against `04-api.md` and `06-screens.md`; no UI task is in this list. **Parallel work:** two people, Alexandre (Part A) and Alfred (Part B), split as described in `09-work-split.md`; the stretch block is the buffer.
