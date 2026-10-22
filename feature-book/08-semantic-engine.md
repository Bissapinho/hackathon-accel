# Chapter 8 — The semantic engine: EvoOntology

> **Status:** v0.1 (2026-10-22) — **decision record**: the semantic engine of our product is **EvoOntology**, rewritten in **TypeScript, engine only** (no front end).
> **Source:** EvoOntology, `github.com/ruc-datalab/EvoOntology`, **MIT licence** (author Meiduo Chong), studied from the Claude Code plugin v1.1.1 (`~/.claude/plugins/cache/evoontology/evoontology/1.1.1/`: README, `docs/`, `skills/*/SKILL.md`, `skills/*/references/ontology-schema.md`, Python core `evoontology/`). Unlike Palantir's code, it is open source: we may port and adapt it, **keeping its MIT copyright notice** in our repository.
> **Legend:** 📦 how EvoOntology works · 🔵 our adaptation.

---

## 1. Why we need it

Chapter 3 (§4.x) showed that Foundry's analyst agent depends on **good semantics** (descriptions, aliases, status) and improves them with a post-answer "suggest improvements" step. Our build package had only that light mechanism. EvoOntology gives us a complete, explicit **semantic layer between the raw columns and the agents**: what each column *means*, how to use it correctly, the evidence behind it, and a **gated, measured way to improve it** as people ask questions.

It plays the role of the "pipeline builder × analyst" bridge: data is ingested, its meaning is built and checked, and both the ontology builder (the FDE agent) and the analyst read from it.

## 2. The user journey 🔵

1. **Ingest a CSV** (manual, as today).
2. **The business operator gives ~30 seed questions**, with their use cases and their own definitions (a small glossary).
3. **Every column is semanticized into the "data bank"**: each column gets at least a **minimal card** (§5); the seed questions drive deeper work on the columns that matter (precise definitions, value meanings, rules, relations, metrics).
4. **The operator builds the operational ontology in natural language** (object types, links, actions, app, alert) with the FDE agent, **picking any column from the bank**. Definitions and aliases come from the bank's Terms; links come from its Relations.
5. **Every analyst question goes through the bank** before SQL and is recorded; after enough questions the bank **evolves** (a candidate version is judged against the current one and adopted only if better, with the user's approval).

## 3. The semantic model 📦

A typed graph serialized as **five record types**:

| Record | What it holds (our summary) | Key fields |
|---|---|---|
| **Term** | An analytical concept: entity, metric, dimension, category or business concept | id, name, type (`concept` / `metric` / `entity` / `dimension` / `category`), definition, scope, aliases, evidence refs |
| **Mapping** | Where a Term lives in the data | term id, data source, table, column, *semantic* filter (what must hold, not SQL), aggregation semantics (e.g. "sum of individual estimates"), grain, validation |
| **Relation** | A typed link between two Terms | source, target, `relation_type` ∈ **association / hierarchy (is-a) / composition (part-of) / equivalence / derivation**, connection condition described in words, description, evidence |
| **Constraint** | A rule needed to interpret or use a Term or Mapping correctly | target, type (`enum_semantics`, `data_quality`, `business_rule`, `unit`, `scope`), **trigger keywords** (words in questions that should surface it), severity (`block` / `warn` / `info`), scope, confidence, description |
| **Evidence** | A reproducible observation backing a claim | source, query, result, validation method, timestamp |

Principles: every claim is **evidence-grounded**; the layer stores **meaning and grounding only** (no prompts, no SQL templates, no agent strategies); relation types are a closed list with a decision order (is-a → part-of → equivalence → derivation → association); records have a lifecycle state and a confidence.

## 4. How it runs 📦

**Modes.** *Fixed split* (benchmarks with ground truth) or **rolling trajectory** (production / cold start: a seed workload builds v0, later question trajectories drive evolution). **We use rolling trajectory.**

**Build (v0).** Resolve context → read the seed workload and make a **coverage map** of what it needs → design Terms / Mappings / Relations / Constraints → explore the data to ground each one (compare candidate columns, record why others were rejected) → commit with evidence → **validate** (valid JSON, complete references, loadable) → publish `ontology_v0` with a summary, known limitations and **question → object links**.

**Runtime for data agents.** Two navigation tools: `browse_semantics {query, kind, limit ≤ 6}` (discover relevant concepts) and `resolve_semantics {mentions ≤ 5, context}` (turn concepts into grounded mappings with their constraints and evidence), plus a session manifest describing the active version.

**Trajectories.** After each task the data agent appends a record: task id, question, ontology version (required), semantic calls (input + result), native tool calls (results truncated around 2 KB with a summary), final answer, status, errors. **No chain-of-thought.**

**Evolution.** Triggered when **30 new trajectories or 7 days** have accumulated since the checkpoint (a reminder only; never automatic). Loop: freeze context → **diagnose** problems from trajectories → **attribute** causes → **patch** a candidate (`vN-cK`) → **gate**. Without ground truth, an **independent judge model** compares Parent and Candidate answers anonymously (A/B randomized) and returns `winner / reason / critical_error`; the candidate is **accepted only if it has zero critical errors and strictly more wins than the parent**. Accept → published as `ontology_vN+1` and the checkpoint advances; Reject → parent stays, next round continues; Incomplete → nothing changes. Default budgets: quick (2 rounds) or full (8 rounds).

**Versions.** `ontology_v0, v1…` immutable; candidates in their own space until accepted; an `active` pointer.

## 5. Our adaptations 🔵

| Topic | EvoOntology default | Ours |
|---|---|---|
| Coverage | Minimal: only objects the workload needs | **Every column gets a minimal card** ("blank page"): a Term (name from the column, type guessed: id / dimension / metric / date / text), a Mapping to its table and column, and one Evidence (type, null count, distinct count, sample values). Definition left as "to be defined" until enriched. The seed questions then **enrich** the columns they touch |
| Storage | Files in a `.evoontology/` workspace | **Postgres tables** next to the rest of the platform (one row per record, per version), same five record types |
| Access | MCP server over stdio | **Direct TypeScript calls** from our services and agent tools (no extra process) |
| Data exploration | The builder agent's own read-only tools | Our existing tools: `profile_columns`, `preview_dataset`, `run_sql` |
| Link to the operational ontology | — | Object type / property descriptions and aliases are **taken from Terms**; links are proposed from **composition / association** relations with a column-level connection condition; `enum_semantics` constraints feed `allowedValues` and value hints in filters; actions can cite constraints in their criteria |
| Analyst | — | Explore mode calls `resolve` before writing SQL; every answered question writes a trajectory |
| Improvement | — | **Evolution replaces the "metadata suggestions" step** of the build package; adopting a candidate version is a gated, user-approved step |
| Judge | Independent model with its own credential | A second model (or second DeepSeek model) configured separately; optional for the hackathon demo |

## 6. The TypeScript rewrite: scope 🔵

Engine only: no visualization, no MCP server, no CLI. The Python core is ≈ 3 900 lines without visualization, standard library only.

| Module (Python) | Lines | TypeScript scope |
|---|---|---|
| `ontology/` (models, store) | 472 | The five record types, versioned store on Postgres, active pointer |
| `validate.py`, `workspace.py`, `workflow.py` | 806 (with `__init__`) | Validation (references, required fields, controlled vocabularies), publication with summary + limitations + question links |
| `runtime/` (runtime, ops, tools; MCP server not ported) | 1 406 | `browse` and `resolve` (token matching, aliases, disambiguation, evidence views), session manifest |
| `trajectory/` | 184 | Append / read trajectories |
| `trigger/` | 198 | 30 trajectories or 7 days since checkpoint → `evolutionDue` |
| `evaluation/` | 123 | Judge interface + the aggregate gate rule |
| `evolution/` | 692 | Runs, rounds, candidates, accept / reject / incomplete, checkpoint |

Estimate: **≈ 2 000–2 500 lines of TypeScript, 4–6 h with Claude Code**, best done **before** the hackathon as a preparatory task, with parity tests against the Python behavior. The *intelligence* of build and evolve stays in the agent's **method** (our prompts, adapted from EvoOntology's skills with attribution), not in the engine.

## 7. Feature list and verdicts

| # | Feature | Verdict | Why |
|---|---|---|---|
| E1 | Five record types + controlled relation and constraint vocabularies | **Must** | The semantic model |
| E2 | Minimal card for every column, enriched by seed questions | **Must** | The "data bank" the operator builds from |
| E3 | Seed questions + glossary input | **Must** | Drives what gets enriched |
| E4 | Validation + versioned publication with question → object links | **Must** | Trust and traceability |
| E5 | `browse` / `resolve` for agents | **Must** | How the FDE and the analyst use the bank |
| E6 | Trajectory recording for every analyst question | **Must** | Fuel for evolution |
| E7 | Evolution trigger + run + judge gate + accept / reject | **Must** (minimal) / demo optional | The self-improving part |
| E8 | Bank review screen (column → meaning, values, evidence, questions served) | **Must** (simple) | The operator must see and trust the meaning |
| E9 | Visual graph explorer, MCP server, CLI | Drop | Not needed by our product |

## 8. Open points

- Choose and budget the **judge model** (second credential).
- EvoOntology's validation checks structure, **not** database semantics: keep our own data checks (keys, match rates) in the platform.
- Decide how a bank version and a workspace (ontology) version relate when both change (proposal: the workspace records the bank version it was built on).
- Keep the **MIT notice** of EvoOntology in our repository and in the adapted prompt files.
