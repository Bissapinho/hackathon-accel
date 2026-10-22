# Build package — Mini-Foundry (hackathon slice, Kumo)

Everything needed for Claude Code to build the **server** of a small data-and-ontology platform where **a non-technical person turns their company's data into definitions, objects, calculations and safe actions just by talking to an AI agent**. The use case is Kumo's NetSuite 2025 exports; the agent works in four stages: **ingest → meaning (EvoOntology semantic bank) → objects (pipelines, object types, links) → logic and actions**.

It is derived from the feature book (`../feature-book/`, observations of Palantir Foundry, behavior only; chapter 8 for EvoOntology) but contains **only our own design**: our architecture, data model, document formats, tools and prompt texts. The semantics prompt is adapted from EvoOntology (MIT, see `LICENSE-EvoOntology`).

## Decisions already made

| Topic | Decision |
|---|---|
| Event | Hackathon, 1–2 days, 1–3 people |
| Data | Kumo's 13 NetSuite / app tables + 3 simulated tables, uploaded as CSV / CSV.gz (02-slice-and-demo §3). **Never committed**; tests use the synthetic `fixtures/kumo-mini/` |
| Stack | TypeScript server: Node 22, Fastify, zod, Kysely, Postgres 16 (01-architecture) |
| Front end | **Built by another team** against `04-api.md` and `06-screens.md`; no UI work in this package |
| Database | Local Docker Postgres for development and tests; **Aiven for PostgreSQL** (1 CPU / 2 GB / 8 GB, EU region) for the deployed demo (01-architecture §9) |
| LLM | **Claude** (`claude-opus-5-5`) through `@anthropic-ai/sdk`; allowed by Kumo for the hackathon (05-agent §1) |
| Semantic engine | EvoOntology's model and method, ported to TypeScript, stored in Postgres (feature book ch. 8; task T-P1) |
| Demo | The agent builds everything from conversation; the user only answers choices and approves (02-slice-and-demo) |

## Read in this order

| File | What it gives you |
|---|---|
| **`09-work-split.md`** | **Mandatory first read.** Who builds what: Alexandre = Part A (data platform), Alfred = Part B (semantics and agent); folder ownership; every interdependency and its contract |
| `02-slice-and-demo.md` | **What** we build, the Kumo data, and the demo script |
| `01-architecture.md` | Stack, components, data flow, configuration, data handling, **deployment on Aiven** |
| `CLAUDE.md` | Copy to the repo root: commands, layout, rules |
| `03-data-model.md` + `schema.sql` | Database: metadata, semantic bank, dataset and pipeline tables, edits, object and logic views |
| `04-api.md` + `types/shared.ts` | REST routes, semantic and workspace draft operations, document formats (pipelines, ontology, logic, actions), validation codes |
| `05-agent.md` | The agent: loop on Claude, modes and stages, tools, approval policy, verification, context, trajectories |
| `prompts/*.md` | Our prompt texts: base, router, semantics (from EvoOntology), build (modelling guide), explore (analyst) |
| `tools/catalog.json` | The agent's tools with modes, risk and inputs |
| `06-screens.md` | The front team's screens and the endpoints each one needs (contract only) |
| `07-acceptance-tests.md` | The `kumo-mini` fixture, platform tests, agent-loop tests, deployment checks, rehearsal criteria |
| `08-tasks.md` | Ordered tasks with "done when" checks, starting with two before the hackathon |
| `fixtures/` | **Legacy** tickets demo files, to be replaced by `kumo-mini/` (T-02b) and a Kumo `expected-workspace.json` (T-24) |

## How to start with Claude Code

1. Create an empty repo, copy this folder to `docs/build-package/`, `CLAUDE.md` to the root and `LICENSE-EvoOntology` to the root as `NOTICE`.
2. Put `ANTHROPIC_API_KEY` in `.env` yourself (never in the repo).
3. Each person reads `09-work-split.md` and takes only their part's tasks. Ask Claude Code: *"I am Alexandre (Part A) / Alfred (Part B). Read docs/build-package/README.md and 09-work-split.md, then do task T-P1 from 08-tasks.md. Stop when its 'done when' checks pass."* Then T-P2 is already done in this package; continue with T-01, T-02… one task per prompt, reviewing each.
4. From T-21 on, test the agent with the mock LLM first, then live on `kumo-mini`, then on the real data on Aiven.

## Known open points

- **Kumo agreement:** the data may go to Claude and to Aiven for the hackathon; it is never committed, only aggregated results leave the hackathon after Kumo's review, and the Aiven service and local copies are deleted at the agreed date.
- **Where the server runs:** Aiven hosts only the database; pick a Node host in the same region, or run the server on the presenter's laptop.
- **Judge model** for evolution (stretch): `LLM_JUDGE_MODEL`, configured separately.
- **Later:** connectors, pipeline schedules and editor, writeback, branches, LLM blocks in Logic, documents (see the feature book).
