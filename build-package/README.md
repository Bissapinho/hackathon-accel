# Build package — Mini-Foundry (hackathon slice)

Everything needed for Claude Code to build a small data-and-ontology platform where **a non-technical person builds a working ontology, an app and an alert just by talking to an AI agent**, starting from a static CSV.

It is derived from the feature book (`../feature-book/`, observations of Palantir Foundry, behavior only) but contains **only our own design**: our architecture, our data model, our document formats, our tools and our prompt texts.

## Decisions already made

| Topic | Decision |
|---|---|
| Event | Hackathon, 1–2 days, 1–3 people |
| Data | Static CSV files uploaded by hand (`fixtures/tickets.csv`, `fixtures/people.csv`) |
| Stack | TypeScript full-stack: Node 22, Fastify, Postgres 16, React + Vite (01-architecture) |
| Runs on | A laptop (`docker compose` for Postgres) |
| LLM | DeepSeek through an OpenAI-compatible gateway, configurable (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) |
| Demo | The agent builds the whole slice from conversation; the user only approves (02-slice-and-demo) |

## Read in this order

| File | What it gives you |
|---|---|
| `02-slice-and-demo.md` | **What** we build and the minute-by-minute demo script |
| `01-architecture.md` | Stack, components, data flow, configuration |
| `CLAUDE.md` | Copy to the repo root: commands, layout, the 12 rules |
| `03-data-model.md` + `schema.sql` | Database: metadata tables, per-dataset tables, edits tables, object views |
| `04-api.md` + `types/shared.ts` | REST routes, draft operations, validation codes, document formats (ontology, apps, automations) |
| `05-agent.md` | The agent: loop, modes, tools, approval policy, verification, context, persistence |
| `prompts/*.md` | Our prompt texts: base, router, explore (analyst), build (modelling guide), suggest |
| `tools/catalog.json` | The 26 tools with modes, risk and inputs |
| `06-screens.md` | Wireframes: assistant, data, objects, apps, alerts, history |
| `07-acceptance-tests.md` | Platform tests, agent-loop tests, demo rehearsal criteria |
| `08-tasks.md` | 26 ordered tasks with "done when" checks (≈19 h) |
| `fixtures/` | Demo CSVs and `expected-workspace.json` (the target the agent should reach) |

## How to start with Claude Code

1. Create an empty repo, copy this folder to `docs/build-package/` and `CLAUDE.md` to the root.
2. Put the DeepSeek key in `.env` yourself (never in the repo).
3. Ask Claude Code: *"Read docs/build-package/README.md and do task T-01 from 08-tasks.md. Stop when its 'done when' checks pass."* Then T-02, T-03… one task per prompt, reviewing each.
4. From T-19 on, test the agent with the mock LLM first, then live.

## Known open points

- **Model capability:** confirm the chosen DeepSeek model supports tool calling reliably with ~26 tools; if not, reduce tools per mode (the router/explore/build split already helps) or switch `LLM_MODEL`.
- **Data leaves the laptop:** whatever the agent reads goes to the LLM provider; use the synthetic fixtures for the demo.
- **Later:** connectors, writeback, pipelines, branches and documents are out of the slice (see `08-tasks.md` "Later").
