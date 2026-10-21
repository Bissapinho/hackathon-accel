# Docs comparison: what the public Foundry documentation describes that the book missed

> **Status:** v0.1 (2026-10-20)
> **Sources:** the public documentation at `palantir.com/docs/foundry/`: the index, the 12 capability overviews (data integration, pipelines, ontology, AIP, app building, security, analytics, observability, product delivery, developer toolchain) and detail pages on datasets, schedule triggers, branching, health checks, object edits, object permissions, action types, functions, Workshop, Object Explorer, Automate, AIP Logic, Chatbot Studio and AI FDE. Everything below is **summarized in our own words**; nothing is copied.
> **Legend:** ✅ covered in the book (observed) · ⚠️ seen in passing (a screen, a menu, an API name) · ❌ not in the book. Importance is for the **reduced** version: **H** high, **M** medium, **L** low.

---

## 1. What this means, in short

The book covers well the **core loop we could click through**: datasets → pipelines → ontology → apps → automations → AI. The docs show four big areas we **didn't see at all**, because the test org had no use for them:

1. **Getting data in and out**: connectors to databases, cloud storage and SaaS apps, scheduled syncs, inbound webhooks and listeners, exports. We only tried CSV upload. *A real product needs at least a few connectors.*
2. **Code**: code-based pipelines (Python, SQL, Java) with unit tests and pull requests, and code **functions** (TypeScript, Python) used by apps and actions. We only saw no-code tools.
3. **Governance**: groups, markings, row- and object-level security, audit logs, approvals. We worked as a single user.
4. **Programmatic access**: generated SDKs for the ontology (OSDK), platform APIs, custom endpoints and **MCP servers** that expose the ontology to outside AI agents.

There are also **details that change our data model**: two more dataset transaction types, the rules for merging user edits with source data, compound schedule triggers, and how branches fall back. These are cheap to get right now and expensive to change later. §3 lists them first.

## 2. Coverage by area

| Area | Capability in the docs | Book | Imp. | Note |
|---|---|---|---|---|
| **Datasets** | SNAPSHOT, APPEND transactions; views | ✅ ch. 1 | H | |
| | **UPDATE** (add or overwrite files) and **DELETE** (remove file references) transactions | ❌ | **H** | Changes the view rule: last SNAPSHOT + later APPEND / UPDATE / DELETE in order |
| | Retention policies (DELETE doesn't free storage) | ❌ | M | |
| | Structured / unstructured / semi-structured datasets, media sets | ⚠️ ch. 1 | L | |
| | Iceberg tables, virtual tables (data left in an external warehouse), CDC, streams | ❌ | L–M | Virtual tables are worth a look later (Snowflake / BigQuery users) |
| **Data connection** | Sources + **batch / streaming / file syncs**, agents (on-prem), large connector catalog (S3, Postgres, Snowflake, Salesforce, REST, Kafka, SFTP…) | ❌ | **H** | Our only entry point was manual upload |
| | **Exports** to external systems | ❌ | M | |
| | **Webhooks** (outbound calls) and **listeners** (inbound HTTPS, WebSocket, email) | ❌ | **H** | Needed by action side effects and integrations |
| | HyperAuto (automatic ERP / CRM ingestion), private links, peering | ❌ | L | Drop |
| **Pipelines** | Pipeline Builder: graph, transforms, outputs, schedules, branches | ✅ ch. 5 | H | |
| | **Code-based transforms** (Python, PySpark, SQL, Java, R, containers) in Code Repositories with unit tests, previews, PRs | ❌ | **H** | Most production pipelines are code |
| | **Incremental** pipelines (process only new data) | ❌ | M | Builds on APPEND |
| | Streaming pipelines | ❌ | L | Already "Drop" |
| | **Data expectations** (checks inside a pipeline) and **health checks** (status, time, size, content, schema) with notifications; Data Health app | ⚠️ ch. 5 (menus) | M | Basic freshness / row-count / schema checks are cheap |
| | Pipeline and dataset **rollbacks**, stale-dataset tracking, build timeline | ⚠️ | M | |
| | Linter (pipeline best-practice checks), Spark tuning, partitioning, projections | ❌ | L | |
| | SQL warehouse: SQL Studio, worksheets, **Arrow Flight SQL**, ontology SQL | ❌ | M | Lets BI tools and analysts query |
| **Schedules** | Time trigger (cron + time zone) and "data updated" trigger | ✅ ch. 5 | H | |
| | **More event triggers**: job succeeded, schedule ran / failed, new logic deployed, table / media set updated | ❌ | **H** | |
| | **Compound triggers** with nested AND / OR; trigger stays satisfied until the whole condition is met; DST caveats | ⚠️ (we saw "or") | **H** | Changes the trigger data model |
| | Build scopes, parameterization | ⚠️ | M | |
| **Branching** | Global branches + proposals | ✅ ch. 3 | H | |
| | **Fallback chain** (read from the parent branch when a job spec / input is missing), branches never modify other branches, **no merge for dataset branches** (code merges, data rebuilds) | ⚠️ (one dialog) | **H** | Key design rule for our branches |
| | Branch protection, approvals on proposals | ❌ | M | |
| **Ontology** | Object, link, action types; drafts; indexing | ✅ ch. 2 | H | |
| | **How edits merge with source data**: by default edited properties keep the user's value; optional "most recent wins" per datasource using a timestamp; edit-only properties; a deleted source row removes the object and its edits come back if the row returns; deletes via actions are final; edits are periodically written into a merged dataset | ⚠️ (we saw edits survive) | **H** | Refines our pattern S9 |
| | Interfaces (shared shape across types), shared properties, value types, structs | ⚠️ ch. 2 | M | |
| | **Derived properties** (computed at runtime) | ❌ | M | |
| | Object views (standard / full / panel) | ⚠️ | M | |
| | Semantic search, search syntax | ⚠️ | M | |
| | Object storage versions (V1 / V2), scale limits | ❌ | L | Internal |
| | Scenarios (what-if copies of the ontology) | ❌ | L | |
| | Time series, geospatial (Map), events (Vertex), media | ⚠️ | L | Already "Later" |
| **Actions** | Rules, parameters, submission criteria, run | ✅ ch. 2 | H | |
| | **Side effects: notifications and webhooks** | ❌ | **H** | "When a ticket is resolved, call Jira" |
| | **Action log** (record of every action run) and **revert** | ⚠️ (revert option seen) | **H** | Audit and undo |
| | **Inline edits** (edit a cell in a table) | ❌ | M | |
| | Function-backed actions, **batched execution** | ⚠️ | M | |
| | Permissions, consistency guarantees, metrics, attachments / media upload | ❌ | M | |
| **Functions (code)** | **TypeScript and Python functions** with first-class object access and edits; used for Workshop variables, **derived columns**, chart aggregations, function-backed actions, **external calls**, **streaming results** (LLMs); versioning, branching, unit tests, metrics | ❌ (only names in API lists) | **H** | Our only functions were no-code Logic |
| **AIP Logic** | Inputs, Use LLM block, preview, trace | ✅ ch. 6 | H | |
| | **Staged writes** (edits held for human review) | ⚠️ (effect option "stage or apply") | **H** | Our 6.L5 is close; make "stage" the default |
| | **AIP Evals** (test suites, results analyzer that groups failures and suggests prompt fixes) | ⚠️ (Evals tab) | M | |
| | Logic metrics, execution-mode settings, compute usage | ⚠️ | M | |
| **Agents** | AI FDE (builder), AIP Analyst | ✅ ch. 3 | H | |
| | **Chatbot Studio**: configurable agents with retrieval context, citations, tools, application state; deployed as a **Workshop widget**, as a **function**, via **API / SDK**, via Marketplace; session logging | ❌ | **M–H** | Our users will want their own assistant per app |
| | AI FDE also builds Data Connection sources, code transforms, OSDK React apps, custom widgets; reviews CI checks; uses skills; URL-prefilled sessions | ⚠️ | M | |
| | AIP Assist (help bot), Threads, Document Intelligence, Model Catalog, bring-your-own-model, LLM rate limits / capacity, markings to control what LLMs see | ❌ | M | BYO model and LLM data-access controls matter for enterprise buyers |
| **Apps** | Workshop core | ✅ ch. 4 | H | |
| | Workshop: **embedded modules**, loop layouts, **state saving**, routing, auto-refresh, AIP widgets (Analyst, Chatbot, generated content), mobile, custom widgets, performance profiler | ⚠️ | M | |
| | **OSDK React apps** (custom code apps on the ontology), Pilot (generates apps from a prompt) | ❌ | M | Fits our "everything has an API" pattern |
| | Slate (low-code HTML/JS), Carbon (workspaces per user group), Code Workspaces apps (Streamlit, Dash, Shiny) | ❌ | L | |
| **Object Explorer** | Search, explorations, links, object page, actions | ✅ ch. 6 | H | |
| | **SQL over object sets**, **compare** two sets, **bulk actions** on a whole set, saved explorations and lists, URL generation | ⚠️ | M | |
| **Automate** | Object conditions, notification effect, pause, history | ✅ ch. 6 | H | |
| | Time + object combined conditions, dataset condition, **email** with attachments, **fallback effects**, manual execution, branching, limits | ⚠️ | M | Fallback effects ("if the action fails, notify") are cheap and useful |
| **Analytics** | Contour (table analysis at scale), Quiver (object and time-series analysis, dashboards), Notepad (documents with live widgets), Fusion (spreadsheets on the ontology), Insight, Code Workbook (legacy) | ❌ | M | We relied on AIP Analyst; a simple dashboard / report tool may be expected |
| | **BI connectivity**: Power BI, Tableau, Excel, ODBC / JDBC | ❌ | M | Cheap via SQL endpoint |
| **Security** | Organizations (strict silos), spaces, projects, **roles incl. Discoverer** | ⚠️ ch. 1 | **H** | |
| | **Groups** (internal or from the identity provider), SSO / MFA | ❌ | **H** | |
| | **Markings** and classification (mandatory, travel through lineage) | ⚠️ | M | |
| | **Restricted views** (row / column filters), **object security policies**, property security markings | ⚠️ | M | |
| | **Audit logs** | ❌ | **H** | Enterprise must-have |
| | Approvals (request → review), checkpoints and justifications for sensitive actions, sensitive data scanner, data retention policies | ❌ | M | |
| **Observability** | Builds and schedule history | ✅ ch. 5 | H | |
| | **Metrics** for functions, actions and Logic (success / failure, P95); **traces** across functions, actions and LLM calls; run history (7 days); log search; monitoring views with alerts to **Slack / PagerDuty**; log export | ⚠️ | M | Our trace stream (S7) is the base |
| **Developer toolchain** | **Ontology SDK** (generated Python, Java, TypeScript clients for objects, actions, functions, Logic) and Developer Console | ❌ | **H** | Same idea as our S10 |
| | **Platform APIs** (datasets, filesystem, admin, orchestration, connectivity, SQL, media) | ⚠️ (we saw the internal ones) | **H** | |
| | **Custom endpoints** (API endpoints backed by actions / functions) | ❌ | M | |
| | **MCP**: Palantir MCP (lets AI tools build on the platform) and **Ontology MCP** (exposes ontology resources as tools to external agents) | ❌ | **H** | Very relevant for an AI-native reduced Foundry |
| | Compute modules (containers in any language), Code Workspaces (Jupyter, RStudio), VS Code extension, CLI | ❌ | L–M | |
| **Product delivery** | Marketplace, products (bundles of resources), installations, automatic upgrades, release channels | ⚠️ | L | Already "Drop" |

## 3. What to add to the plan, ranked

### 3.1 Data-model corrections (cheap now, costly later) — do before building M1–M4

| # | Change | Where it lands |
|---|---|---|
| C1 | Four transaction types: SNAPSHOT, APPEND, **UPDATE, DELETE**; view = last SNAPSHOT + later transactions in order; retention removes physical files | 1.D2–D3 |
| C2 | **Edit merge rules** per datasource: "user edits win" (default) or "most recent wins" (needs a timestamp); edit-only properties; source row deleted → object gone, edits restored if it returns; action deletes are final | S9, ch. 2 objects service |
| C3 | **Compound triggers**: a tree of AND / OR over time triggers and event triggers (data updated, job succeeded, schedule succeeded / failed, logic deployed); an event stays "satisfied" until the whole tree fires | 5.P11 |
| C4 | **Branch fallback chain** for builds; builds never write outside their branch; data branches are rebuilt, not merged | S6, 1.D6 |
| C5 | **Action log** as a first-class table (who, when, parameters, edits, revertable) | 2.F6, S2 |

### 3.2 New must-haves for a real product

| # | Feature | Why | Milestone |
|---|---|---|---|
| N1 | **3 connectors**: Postgres (JDBC), S3-compatible storage, REST API; scheduled batch syncs into datasets | Without them data only arrives by upload | M1 |
| N2 | **Webhooks** (outbound) usable as action side effects and automation effects; one **inbound HTTPS listener** | Integrations with Jira, Slack… | M2 / M5 |
| N3 | **Code functions** (TypeScript or Python): read objects, follow links, return values or proposed edits; usable as Workshop derived columns and function-backed actions | Logic alone can't cover business rules | M3 |
| N4 | **Code transforms** (SQL first, then Python) next to the visual builder, with preview and unit tests | Production pipelines | M4 |
| N5 | **Groups + roles (owner / editor / viewer / discoverer)**, SSO | Multi-user from day one | M1 |
| N6 | **Audit log** of reads of sensitive resources and all writes | Enterprise requirement | M1 |
| N7 | **Generated SDK** (TypeScript + Python) from the ontology, and an **MCP server** exposing object queries, actions and functions as tools | External apps and external AI agents | M3 / M6 |
| N8 | **Staged writes** (human review) as the default for AI-proposed edits | Safety | M6 |
| N9 | Basic **health checks** (freshness, row count, schema change) with notifications | Trust in pipelines | M4 |
| N10 | **SQL endpoint** over datasets and object sets (one wire protocol for BI tools) | Analysts and BI | M4 |

### 3.3 Worth adding to "Later"

Chatbot Studio–style configurable agents (deploy as widget / function / API) · AIP Evals · incremental pipelines · dataset / pipeline rollbacks · derived properties · interfaces · inline edits and bulk actions · Object Explorer SQL / compare / saved lists · Workshop embedded modules, state saving, AI widgets · fallback effects and email in Automate · metrics, traces and log search across functions, actions and LLMs · alerts to Slack / PagerDuty · restricted views and object security policies · markings and classification · approvals and checkpoints · BYO model and LLM data-access controls · a simple dashboard / report app · virtual tables.

### 3.4 Confirmed "Drop for now"

Streaming, Iceberg, media sets, HyperAuto, private links, peering, Marketplace and DevOps packaging, Slate, Carbon, Fusion, Code Workbook, mobile, scenarios, time series, geospatial and Vertex.

## 4. Things the docs confirm about what we observed

- Automate is the successor of "Object Monitoring" (we saw `object-sentinel` and `MonitorRegistry` in the API; the old name survives in the internals).
- AIP Logic edits can be **applied or staged** (we saw the option in the Automate Logic effect); our design choice 6.L5 matches the docs' recommended safe default.
- AI FDE works on **Global Branches by default** and proposes changes for review (ch. 3 observed it refusing Main).
- "Agent Studio" has been **renamed Chatbot Studio** (the docs say so); the term "agents" now mostly refers to AI FDE / Analyst style builders.
- Datasets behave like Git for data: transactions as commits, branches as pointers, views as the effective file set (ch. 1).

## 5. Gaps the docs can't close

The docs describe *what* exists, not the payload shapes. Before building N1–N10, a short observation pass in the test org would help for: a Data Connection source + sync (N1), an action webhook side effect (N2), a TypeScript function in a code repository (N3), a SQL transform (N4), and the Ontology SDK generation in Developer Console (N7). Each fits the same batch recipe (§12 of `HANDOFF.md`).
