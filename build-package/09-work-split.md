# 09 — Work split: two people, two machines

> **Mandatory reading** for both developers and for every Claude Code session, before any task in `08-tasks.md`. It says who owns which task, which folders each person may edit, and every point where the two parts meet.

## 1. Who does what

| | **Part A — Data platform** | **Part B — Semantics and agent** |
|---|---|---|
| Owner | **Alexandre** | **Alfred** |
| Machine | Alexandre's laptop | Alfred's laptop |
| In one sentence | Everything that turns uploaded files into versioned datasets, pipelines, objects, logic and actions in Postgres | The semantic bank (EvoOntology engine), read-only SQL, the LLM gateway, the agent loop, prompts and the CLI |
| Tested with | Vitest on `kumo-mini`, **no LLM at all** | Vitest on hand-made rows + `kumo-mini`, **mock LLM** (`LLM_MOCK=1`) and fake tools |
| Needs `ANTHROPIC_API_KEY` | Not until the rehearsal | Yes (T-21 live check, T-30) |

**Claude Code sessions:** at the start of a session, find out which part you are working on (ask the user, or read `git config user.name`). Edit only the files of that part (§3). If a change is needed in the other part, **stop and say so** instead of making it: describe the change so the user can pass it to the other owner.

## 2. Tasks by owner

Task ids come from `08-tasks.md`; test ids from `07-acceptance-tests.md`.

### Phase 0 — Common base (Alexandre, then one push to `main`)

Everything both parts build on. **Alfred does not edit `apps/server/` before this push**; meanwhile he works on T-02b and T-P1, which need nothing from Phase 0.

| Task | Content |
|---|---|
| T-01 | pnpm monorepo, TypeScript strict, ESLint, Vitest, `docker-compose.yml`, `.env.example`, `.gitignore`, `CLAUDE.md`, `NOTICE`, `docs/build-package/` |
| T-02 | Migration runner, `001_init.sql` = `schema.sql` (all tables, both parts), roles, TLS; seed users and project |
| T-03 | Fastify, `ApiError` mapping, cookie login, `/api/me`, `/api/health`, role guard, `packages/shared` = `types/shared.ts` |
| P0-deps | **All known dependencies installed once** (§6.4) so the lockfile is stable from the start |
| P0-ports | `apps/server/src/ports.ts`, the agent tool type and the read-only helper (§4). Interfaces and stubs only |
| P0-register | `apps/server/src/register.alexandre.ts` and `register.alfred.ts` (routes), `agent/tools/index.alexandre.ts` and `index.alfred.ts` (tools), all empty, wired into `app.ts` and the registry once |

### Part A — Alexandre

| Task | What | Checks |
|---|---|---|
| T-05 | Upload `.csv` / `.csv.gz`, `COPY`, inference, versions | D1, D2, D3 |
| T-06 | Background profile job, preview, profile, `matchAgainst`; **calls the `onProfileDone` hook** (§4.2) | D4 |
| T-08 | `pnpm seed:kumo` | fixture loads by script |
| T-11 | Workspace draft: `WorkspaceDoc`, `DraftOp`, revisions, discard, diff | — |
| T-12 | Pipeline compiler, preview, checks, builds | W2, W3 |
| T-13 | Workspace validation incl. data checks; **term references checked through `SemanticsPort`** | W1, W2 |
| T-14 | Publish (lock, builds, `edits.*`, `ont.*`, history with semantic version, retention) | W4, W5, W6 |
| T-15 | Object sets, query, aggregate, get object with links | O1, O2 |
| T-18 | Logic compiler, `logic.*` views, `test_logic` | L1, L2, O1 |
| T-19 | Action engine, dry-run, apply, action log | A1–A5 |
| Tools A | Agent tools on Part A services (§5), with `summarize(args)` for `publish_draft` and `run_action` | one test per tool on `kumo-mini` |
| T-D1 | Aiven deployment (database, roles, TLS, real data load) | X1, X2 |
| *Stretch* | T-31 (app documents), T-32 (automations + `enable_automation` / `disable_automation` / `get_automation_events`) | P1, AU1 |

### Part B — Alfred

| Task | What | Checks |
|---|---|---|
| T-02b | `fixtures/generate-kumo-mini.ts` + `fixtures/kumo-mini/`. **First thing pushed** (§4.6) | identical output twice |
| T-P1 | EvoOntology engine in TypeScript on the `sem_*` tables | parity tests, S1, S4, S5 |
| T-07 | Minimal semantic cards, **implemented as the `onProfileDone` hook** (§4.2) | D5 |
| T-09 | Semantic routes, evidence queries (run through the read-only helper), validate, publish | S1–S5 |
| T-16 | `POST /api/projects/:pid/sql`: parser check, timeout, 500-row cap, on top of the read-only helper | O3 |
| — | **Real `SemanticsPort`** replacing the Phase 0 stub (§4.1) | unit tests |
| T-21 | LLM gateway + mock gateway | — |
| T-22 | Sessions, append-only items, SSE, loop, modes, `build` lock, approvals and questions as pauses | G1–G6, G10 |
| T-23 | Meta and read tools of Part B, trajectories, rationale, context editing | G7, G8, G11 |
| T-24 (semantics half) | `set_workload`, `edit_semantics`, `validate_semantics`, `publish_semantics` | G3, G5 |
| T-25 | Prompts loader, chat blocks parser | G9 |
| T-04 | `pnpm chat` | round trip with the mock |
| T-30 | Record `fixtures/demo-session.jsonl` | mock replays the demo |
| *Stretch* | T-33 (evolution, `adopt_semantic_version`) | — |

### Together (after both parts are merged)

| Task | Lead | What |
|---|---|---|
| Integration | both | Real `SemanticsPort` and `onProfileDone` live; both tool indexes registered; the mock script builds `expected-workspace.json` end to end on `kumo-mini` (the "done when" of T-24) |
| T-28 | both | Live rehearsals on Aiven. Alexandre fixes services, Alfred fixes prompts and the loop |

## 3. Folder ownership

Only the owner edits these paths. The other may read them.

| Path | Owner |
|---|---|
| `apps/server/src/modules/{resources,datasets,jobs,pipelines,workspace,objects,logic,actions}/` | Alexandre |
| `apps/server/src/modules/{apps,automations}/` *(stretch)* | Alexandre |
| `apps/server/src/db/`, `apps/server/src/app.ts`, `apps/server/src/ports.ts` | Alexandre (Phase 0); changes to `ports.ts` after Phase 0 follow §6.2 |
| `apps/server/src/register.alexandre.ts`, `apps/server/src/agent/tools/index.alexandre.ts` and the tool files listed for A in §5 | Alexandre |
| `apps/server/migrations/001_init.sql`, `100`–`199` | Alexandre |
| `scripts/seed-kumo.*`, `docker-compose.yml` | Alexandre |
| `apps/server/src/modules/{semantics,sql,agent,llm}/` | Alfred |
| `apps/server/src/agent/loop.ts`, `agent/registry.ts`, `agent/prompts/`, and the tool files listed for B in §5 | Alfred |
| `apps/server/src/register.alfred.ts`, `apps/server/src/agent/tools/index.alfred.ts` | Alfred |
| `apps/server/migrations/200`–`299` | Alfred |
| `apps/cli/`, `fixtures/kumo-mini/`, `fixtures/generate-kumo-mini.ts`, `fixtures/demo-session.jsonl` | Alfred |
| `packages/shared/`, `docs/build-package/` | **Shared, frozen**: changes follow §6.2 |
| `fixtures/expected-workspace.json` | Alexandre (it is the workspace document); Alfred's mock script must produce it |

## 4. Every point where the two parts meet

These are the only couplings. Each one has a contract written before the split and a stub so neither side waits for the other.

### 4.1 `SemanticsPort` (A needs B)

Part A needs three things from the semantic bank: the active semantic version (stored by publish in the workspace history and in `setSemanticVersion`), whether a referenced record exists in that version (validation of `termRef` / `relationRef` / `constraintRef` in object types, links, logic and actions), and the data of a record for descriptions and aliases.

```ts
// apps/server/src/ports.ts (Phase 0)
export interface SemanticsPort {
  activeVersion(projectId: string): Promise<string | null>;               // 'v0', 'v1'… or null if never published
  recordExists(projectId: string, version: string, recordId: string): Promise<boolean>;
  getRecord(projectId: string, version: string, recordId: string): Promise<SemRecord | null>;
}
```

- **Stub (Phase 0):** `activeVersion` returns `'v0'`, `recordExists` returns `true`, `getRecord` returns `null`. Part A's tests run on the stub.
- **Real one:** written by Alfred in `modules/semantics/port.ts`, reading `meta.sem_versions` / `meta.sem_records`.
- A test written by Alexandre that needs a missing reference to fail injects its own fake port; it never inserts into `sem_*` tables by hand.

### 4.2 `onProfileDone` hook (B needs A's output)

The minimal semantic cards (T-07) are built when a dataset version's profile is done. Alexandre's job runner calls the hook; Alfred implements it.

```ts
export type OnProfileDone = (ctx: { projectId: string; datasetId: string; version: number }) => Promise<void>;
```

- **Data contract:** the hook reads `meta.datasets` (`simulated`, `name`) and `meta.dataset_versions` (`columns`, `profile`, `table_name`) with the shapes of `ColumnInfo` and `ColumnProfile` in `packages/shared`. Those shapes are frozen (§6.2).
- **Stub (Phase 0):** a no-op. Alfred tests T-07 by inserting `datasets` / `dataset_versions` rows by hand with a realistic `profile`, before T-06 exists.
- **Failure rule:** an error in the hook is logged and recorded on the job, it never fails the upload or the profile.

### 4.3 Read-only SQL (both need it)

Evidence queries (B), the SQL endpoint and `run_sql` (B), and pipeline previews (A) all run as `mini_reader`.

```ts
// apps/server/src/db/readonly.ts (Phase 0)
export function withReadOnly<T>(opts: { timeoutMs: number }, fn: (db: Kysely<DB>) => Promise<T>): Promise<T>;
// one connection: BEGIN; SET LOCAL ROLE mini_reader; SET LOCAL statement_timeout; fn; ROLLBACK
```

- Phase 0 writes this helper only. The `SELECT`/`WITH` parser check, the 500-row cap and the `SQL_REJECTED` / `SQL_TIMEOUT` errors are Alfred's (T-16, in `modules/sql/`). Alexandre's previews call the helper directly with `PREVIEW_TIMEOUT_MS`; they generate their own SQL, so they don't go through the parser check.

### 4.4 Agent tools (B runs what A writes)

```ts
// apps/server/src/agent/tools/types.ts (Phase 0)
export type ToolContext = { user: User; projectId: string; sessionId: string; mode: AgentMode; services: Services; semantics: SemanticsPort };
export type ToolDef<I extends z.ZodTypeAny> = {
  name: string; modes: AgentMode[]; risk: ToolRisk;
  input: I;                                      // must include `rationale` (shared zod fragment `rationaleSchema`)
  run(input: z.infer<I>, ctx: ToolContext): Promise<ToolResult>;
  summarize?(input: z.infer<I>, ctx: ToolContext): Promise<string>; // required when risk === 'gated'
};
export type ToolResult = { ok: true; summary: string; result: unknown } | { ok: false; code: string; message: string; hint?: string };
export function defineTool<I extends z.ZodTypeAny>(def: ToolDef<I>): ToolDef<I>;
```

- Names, modes, risks and inputs are those of `tools/catalog.json`. Each owner exports an array from their `index.*.ts`; Alfred's registry concatenates both and fails at startup on a duplicate name or a name missing from the catalog.
- Tool errors are returned, never thrown (`05-agent.md` §3). The loop (Alfred) handles approval, pause, `BAD_ARGUMENTS`, `UNKNOWN_TOOL_FOR_MODE` for every tool, including Part A's.
- `services` is the object of all service modules, built in `app.ts`. A tool calls services, never HTTP (`CLAUDE.md` rule 1).

### 4.5 The `build` lock and the workspace's semantic version

- Refusing `change_mode` to `build` (`NO_SEMANTIC_VERSION`) is in the loop: **Alfred**, via `SemanticsPort.activeVersion`.
- Recording the semantic version on the workspace draft and in the history: **Alexandre**, via the same port.

### 4.6 The `kumo-mini` fixture (A needs B early)

- Alfred pushes T-02b **first**, before T-P1. Until it lands, Alexandre writes tests against the facts listed in `07-acceptance-tests.md` §0, which are the contract.
- Any change to the generator that changes a number in `07` §0 is announced first (§6.2), since Part A's tests depend on it.

### 4.7 Agent events and the front team

`AgentEvent`, `AgentItemView`, `ChatBlock` in `packages/shared` belong to Alfred's area but are a contract with the front team: changing them follows §6.2 and is announced to the front team too. Part A's routes (datasets, workspace, objects, actions) are the same kind of contract for Alexandre.

### 4.8 What is *not* a coupling

- Tables: every table is created by `001_init.sql` in Phase 0, so neither side waits for the other's migration.
- Databases: each laptop has its own Docker Postgres and its own test database. **Nobody develops or runs tests against Aiven** before T-D1.
- Prompts: Alfred's. If Part A's behaviour needs a rule in `prompts/build.md` (e.g. a new validation code the agent should know), Alexandre asks Alfred.

## 5. Agent tools by owner

| Tool | Owner | Calls |
|---|---|---|
| `change_mode`, `ask_user`, `set_plan` | Alfred | loop |
| `run_sql` | Alfred | `modules/sql` |
| `bank_overview`, `browse_semantics`, `resolve_semantics` | Alfred | `modules/semantics` |
| `set_workload`, `edit_semantics`, `validate_semantics`, `publish_semantics` (gated) | Alfred | `modules/semantics` |
| `adopt_semantic_version` (gated, stretch) | Alfred | `modules/semantics` |
| `list_datasets`, `get_dataset`, `preview_dataset`, `profile_columns` | Alexandre | `modules/datasets` |
| `get_workspace`, `search_ontology` | Alexandre | `modules/workspace` |
| `query_objects`, `aggregate_objects`, `get_object` | Alexandre | `modules/objects` |
| `get_action_log` | Alexandre | `modules/actions` |
| `edit_draft`, `preview_pipeline`, `test_logic`, `validate_draft`, `diff_draft`, `test_action`, `discard_draft` | Alexandre | `modules/{workspace,pipelines,logic,actions}` |
| `publish_draft` (gated), `run_action` (gated) | Alexandre | `modules/{workspace,actions}` |
| `enable_automation`, `disable_automation` (gated), `get_automation_events` (stretch) | Alexandre | `modules/automations` |

## 6. Working rules

### 6.1 Git

- Branches `alexandre/<task>` and `alfred/<task>`, one task per branch, merged into `main` by their owner as soon as the task's checks pass. Rebase on `main` before merging; never force-push `main`.
- Pull `main` often: the other part's merged work is never a reason to touch their files.
- A merge conflict outside the shared files (§3) means someone edited the other part's files: the owner's version wins.

### 6.2 Changing a shared contract

Shared contracts: `packages/shared/`, `ports.ts`, `agent/tools/types.ts`, `db/readonly.ts`, `schema.sql` / migrations, `tools/catalog.json`, the facts of `07` §0, the data shapes of `dataset_versions`.

1. Tell the other owner what changes and why, before writing code.
2. Make the change in **its own small commit** on `main` (no feature code in it), additive when possible (new optional field rather than renamed field).
3. Update the spec in `docs/build-package/` in the same commit.
4. The other owner pulls and adapts their part.

### 6.3 Migrations

`001_init.sql` holds the whole schema. New migrations: Alexandre numbers `100`–`199`, Alfred `200`–`299`, so names never clash. A migration only touches tables of its owner's area, or follows §6.2.

### 6.4 Dependencies

Phase 0 installs the known set: `fastify`, `@fastify/multipart`, `@fastify/cookie`, `zod`, `zod-to-json-schema`, `kysely`, `pg`, `pg-copy-streams`, `csv-parse`, `@anthropic-ai/sdk`, `dotenv`, `tsx`, `vitest`, `typescript`, `eslint`. A new dependency later: rebase on `main`, add it with `pnpm add`, commit `package.json` and the lockfile alone; never merge `pnpm-lock.yaml` by hand (on conflict: take `main`'s, re-run `pnpm install`).

### 6.5 Kumo data

Unchanged and applies to both: the real files are never committed, never in tests, logs or recordings (`01-architecture.md` §7). Only `fixtures/kumo-mini/` is in git.

## 7. Integration checklist

Done together when both parts have merged their tasks:

1. Phase 0 stubs replaced: real `SemanticsPort` passed to services and tools; `onProfileDone` = T-07.
2. Both tool indexes registered; the registry starts with every name of `tools/catalog.json` (stretch tools excepted) and no duplicate.
3. `pnpm test` green on a clean checkout of `main`, on both laptops.
4. `pnpm seed:kumo fixtures/kumo-mini` → profiles done → minimal cards present (D5 through the real hook).
5. Mock script: semantics published → `build` unlocked → `expected-workspace.json` built and published → verification passes.
6. T-D1 on Aiven, then T-28 three times (R1–R12), then T-30.
