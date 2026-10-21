# CLAUDE.md — Mini-Foundry

Copy this file to the root of the new repository. It tells Claude Code how this project works.

## What we're building

A reduced data-and-ontology platform where a **non-technical user builds a working ontology by chatting with an AI agent**: upload a CSV → the agent proposes object types, links and actions → the user approves → the agent builds a simple app and an automation, verifies its work and explains it in plain language. Specs live in `docs/build-package/` (this package). Read `02-slice-and-demo.md` first, then the spec for the area you're touching.

## Commands

```
pnpm install
docker compose up -d db          # Postgres 16 on :5432
pnpm db:migrate                  # applies apps/server/migrations/*.sql
pnpm db:seed                     # demo users + project "Support Ops"
pnpm dev                         # server :4000 + web :5173
pnpm test                        # vitest (unit + API integration on a test DB)
pnpm test:e2e                    # playwright demo rehearsal (needs LLM_* env or LLM_MOCK=1)
pnpm typecheck && pnpm lint
```

## Layout

```
apps/server/src/
  modules/<area>/        resources, datasets, ontology, objects, actions, apps, automations, agent, llm
    service.ts           business logic (the only place that touches the DB for this area)
    routes.ts            Fastify routes: validate with zod, call service, map errors
    schemas.ts           zod schemas (imported by routes AND by agent tools)
  agent/
    loop.ts              the agent loop
    tools/<tool>.ts      one file per tool: zod input schema, risk level, handler calling services
    prompts/             our own prompt text (see 05-agent.md); never copy third-party prompts
  db/                    Kysely instance, generated types
  migrations/            numbered SQL files
apps/web/src/            React app (pages, components, api client, renderer for app documents)
packages/shared/src/     types shared by server and web (documents, API DTOs, SSE events)
```

## Rules (follow them; they come from what makes this kind of platform work)

1. **API first.** Every capability is a service function + a zod schema. The REST route and the agent tool both call the service. Never let a tool call the HTTP API.
2. **One schema source.** zod schemas in `schemas.ts`; JSON schemas for tools are generated from them (`zod-to-json-schema`). Never hand-write a JSON schema that duplicates a zod one.
3. **Validate separately from apply.** Every write has a `validate*` function returning field-level errors (`{path, code, message}`); `apply*` calls it first and refuses on errors. The agent uses validate as a dry-run.
4. **Versioned documents.** Ontology, apps and automations are JSON documents with `version`; saves send `expectedVersion` and fail with `409 VERSION_CONFLICT` if stale. Drafts are separate from published versions.
5. **Objects are addressed by `{objectTypeApiName, primaryKey}`**. Never expose internal row ids.
6. **Edits never touch dataset tables.** They go to `edits.<type>` and are merged by the `ont.<type>` view. Re-uploading a dataset must keep edits.
7. **Typed building blocks.** Every block in a document has `kind` (+ `version` when it can evolve); unknown kinds fail validation with a clear message.
8. **Errors explain themselves.** API and tool errors carry `code`, a human `message` and, when relevant, a `hint`. "Not found" says *why* (no match, no permission, not published yet).
9. **The agent's draft is a free zone; leaving it asks.** Tools are tagged `read`, `draft`, or `gated`. Only `gated` tools pause for approval (`05-agent.md` §5).
10. **Plain language for users.** Any text shown to end users (errors, agent summaries, action messages) avoids jargon; IDs go in details, not in the main sentence.
11. **Small, tested steps.** Each task in `08-tasks.md` ends with its "done when" checks passing. Add or update tests with every change.
12. **No secrets in code or logs.** LLM keys only in `.env`. Never log full prompts with user data at info level.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- SQL identifiers built from user input go through one helper (`ident()`) that validates `^[a-z][a-z0-9_]{0,62}$`.
- API names: object types `PascalCase`, properties `camelCase`; SQL names are their `snake_case` forms.
- Dates: store `timestamptz` in UTC; show local time in the UI.
- Commit messages: imperative, one topic per commit.

## When unsure

Check the spec in `docs/build-package/`; if it's silent, follow the nearest existing pattern in the code; if still unsure, ask in the PR description rather than inventing a new pattern.
