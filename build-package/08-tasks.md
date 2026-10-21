# 08 — Tasks for Claude Code

Ordered so that something works at the end of every block. Each task is sized for one focused Claude Code session (≈30–90 min). "Done when" = the checks to run before moving on. Test ids refer to `07-acceptance-tests.md`.

## Block 0 — Skeleton (≈1 h)

| # | Task | Done when |
|---|---|---|
| T-01 | Create the pnpm monorepo (`apps/server`, `apps/web`, `packages/shared`), TypeScript strict, ESLint, Vitest, `docker-compose.yml` with Postgres 16, `.env.example` (01-architecture §6), copy `CLAUDE.md`, copy this package into `docs/build-package/` | `pnpm typecheck`, `pnpm test` (empty) and `docker compose up -d db` succeed |
| T-02 | Migrations runner + `001_init.sql` (= `schema.sql`); seed: 2 users (Ada = owner, Ben = viewer), project "Support Ops" | `pnpm db:migrate && pnpm db:seed` idempotent; tables exist |
| T-03 | Fastify server with error mapping (`ApiError`), cookie "login as seeded user", `GET /api/me`, project role guard; copy `types/shared.ts` into `packages/shared` | API test: `/api/me` returns Ada and her project; viewer guard returns `FORBIDDEN` on a write route |
| T-04 | Web shell (06-screens §1), login picker, project switcher, API client with TanStack Query | Shell renders, shows the user and project |

## Block 1 — Data (≈2 h)

| # | Task | Done when |
|---|---|---|
| T-05 | CSV upload: parse, infer types (03-data-model §5), create `data.ds_*_v1`, record version + parse errors; APPEND / SNAPSHOT | D1, D2, D3 |
| T-06 | Preview + profile endpoints (incl. `matchAgainst`) | D4 |
| T-07 | Data pages (06-screens §3) with upload modal | Upload `fixtures/*.csv` by hand, see preview and profiles |

## Block 2 — Workspace and objects (≈4 h)

| # | Task | Done when |
|---|---|---|
| T-08 | Workspace draft: zod schemas for `WorkspaceDoc` and `DraftOp`, `PATCH draft` with revisions, `discard`, `diff` | Applying `expected-workspace.json` as ops yields the same doc; diff lists additions |
| T-09 | Validation (04-api §4) incl. data checks (unique key, link match rate) | W1, W2 |
| T-10 | Publish: versions, generate `edits.*` tables and `ont.*` views (03-data-model §3) with column comments, history | W3, W4, W5 |
| T-11 | Object set compiler (`ObjectSet`/`Filter` → SQL), query, aggregate, get object with links | O1, O2 |
| T-12 | Read-only SQL endpoint (role `mini_reader`, parser check, timeout, cap) | O3 |
| T-13 | Objects pages (catalog, type table, object page) (06-screens §4) | Browse tickets and team members after publishing the expected doc by API |

## Block 3 — Actions, apps, automations (≈4 h)

| # | Task | Done when |
|---|---|---|
| T-14 | Action engine: validate params + criteria (`ValueExpr` evaluation), dry-run, apply in one transaction to `edits.*`, action log with before/after | A1, A2, A3, A4 |
| T-15 | Action form (modal) with live dry-run, history on object page | Resolve a ticket from its page |
| T-16 | App renderer for all `AppBlock` kinds (06-screens §5) | P1 with the expected doc |
| T-17 | Automations: state, enable/disable, evaluation after action runs and publishes, notify effect, events, notifications API + bell | AU1 |
| T-18 | Alerts and History pages | Toggle the alert, see events; see versions and diffs |

## Block 4 — The agent (≈6 h)

| # | Task | Done when |
|---|---|---|
| T-19 | LLM gateway (OpenAI-compatible, `LLM_*` env, streaming, tool calls) + **mock gateway** replaying a JSONL script | Unit test with the mock; one live "hello" call with DeepSeek returns text |
| T-20 | Agent sessions, items, SSE events, the loop (05-agent §1) with modes, approvals and questions as pause states | G1–G6 with the mock |
| T-21 | Tools: meta + read tools (05-agent §3), with rationale, compact results, size tags; context budget and auto-hide | G7, G8; each read tool has a test against the seeded DB |
| T-22 | Tools: draft + gated tools, approval summaries (`tools/catalog.json` `approvalSummary`), diff on the publish card | G3, G5; the mock script builds `expected-workspace.json` end to end |
| T-23 | Prompts loader (`prompts/*.md` + session facts), chat blocks parser, post-answer suggestion step | G9; suggestions appear and can be accepted |
| T-24 | Assistant screen (06-screens §2): conversations, step cards, blocks, question and approval cards, plan & draft panel, context gauge, stop | Full demo script with the mock; then **live rehearsal** R1–R12 three times; record `fixtures/demo-session.jsonl` |

## Block 5 — Polish for the demo (≈2 h)

| # | Task | Done when |
|---|---|---|
| T-25 | Empty states, error states, loading skeletons; seed script that uploads the two CSVs ("manual connection" done in 1 click) | Fresh start to demo-ready in < 1 minute |
| T-26 | Playwright rehearsal test with the mock LLM (upload → chat → approvals → app → alert → question) | `pnpm test:e2e` green |

**Total ≈ 19 h of focused work**; with 2–3 people in parallel (Block 1 + Block 2 + Block 4 tools/prompts can start once T-03 and T-08 exist), it fits two days with margin.

## Later (after the hackathon)

Connectors and syncs (feature book ch. 7) · writeback webhooks (S9) · pipelines (ch. 5) · branches and proposals (ch. 3 §3.5) · Workshop-style editor (ch. 4) · documents and embeddings (ch. 3 §4.x answer) · Logic functions (ch. 6) · fine-grained security · real APPEND without copying · multi-page apps.
