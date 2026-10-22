# 06 — Screens (built by the front team)

> **Not built by us.** The front end is another team's work. This file is the **contract**: what each screen needs from the server. Our job is that every screen below can be built from `04-api.md` and the SSE stream alone. Endpoints per screen:
>
> | Screen | Endpoints |
> |---|---|
> | Shell | `/api/me`, `/api/projects/:pid`, `/api/notifications` |
> | Assistant | agent sessions, messages, SSE events, approvals, answers, stop; `GET workspace?version=draft`, `GET semantics?version=draft` for the drafts panel |
> | Data | datasets, upload, versions, preview, profile, jobs |
> | Meaning | semantics overview, records, workload, draft ops (`resolveConstraint`), publish, versions |
> | Pipelines | `GET workspace` (pipeline definitions), pipeline preview, `pipelines/builds` |
> | Objects | objects query / aggregate / get, actions run (dry-run and apply), actions log |
> | History | semantics versions, workspace history and diff, actions log |
>
> If a screen needs data no endpoint gives, the front team asks and we add the endpoint.

Plain-text wireframes. Visual style: clean, light, generous spacing, one accent color; no need to resemble any existing product. Routes are under `/p/:projectId`. UI labels follow the user's language (French for the Kumo demo); the wireframes below are in English.

## 1. Shell

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Mini-Foundry   [Kumo 2025 ▾]                           🔔 3   Ada ▾        │
├──────────────┬────────────────────────────────────────────────────────────┤
│ Assistant    │                                                            │
│ Data         │                (page content)                              │
│ Meaning      │                                                            │
│ Pipelines    │                                                            │
│ Objects      │                                                            │
│ Apps*        │                                                            │
│ Alerts*      │                                                            │
│ History      │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```
`*` stretch. The bell opens the notifications list.

## 2. Assistant (the main screen of the demo) — `/p/:pid/assistant/:sessionId?`

```
┌─ Conversations ─┐┌─ Chat ──────────────────────────────────────┐┌─ Plan & drafts ────────┐
│ + New           ││ You: I've loaded our NetSuite exports…      ││ ① Data   ② Meaning     │
│ • Kumo setup    ││                                             ││ ③ Objects ④ Logic      │
│ • Return rates  ││ ▸ Looking at your 16 tables         (step)  ││ ━━━━━━━━●━━━━━━━━━━━   │
│                 ││ ▸ Checking order numbers            (step)  ││ Plan                   │
│                 ││ ▸ Checking the sign of returns      (step)  ││ ✓ 1 Agree questions    │
│                 ││                                             ││ ● 2 Pin down meaning   │
│                 ││ Assistant: Here's what I suggest… [plan]    ││ ○ 3 Orders, kitchens…  │
│                 ││ ┌ Question ───────────────────────────────┐ ││ ○ 4 Return rate        │
│                 ││ │ Which questions matter to you?          │ ││ ○ 5 Move production    │
│                 ││ │ [x] Stores with the most returns        │ ││                        │
│                 ││ │ [x] Products returned most              │ ││ Meaning (draft)        │
│                 ││ │ [ ] Shelf weight vs app stock …         │ ││ 24 definitions · 9 rel │
│                 ││ │ [ other… ]                  [Answer]    │ ││ 2 decisions open       │
│                 ││ └─────────────────────────────────────────┘ ││ Workspace (draft)      │
│                 ││ ┌ Approval needed ────────────────────────┐ ││ + 4 pipelines          │
│                 ││ │ Adopt 24 definitions, 9 relations…      │ ││ + Commande (9 props)   │
│                 ││ │ ▸ What changes  ▸ Details (args)        │ ││ ✓ valid · 1 warning    │
│                 ││ │                  [Reject]   [Allow]     │ ││ [View diff]            │
│                 ││ └─────────────────────────────────────────┘ ││ Context ▓▓░░░░ 14%     │
│                 ││ [ Type a message…                  ] [Send] ││                        │
└─────────────────┘└─────────────────────────────────────────────┘└────────────────────────┘
```
- The **stage stepper** (Data → Meaning → Objects → Logic & actions) shows where the conversation is; a stage is done when its publish succeeded and was verified.
- **Step cards** (one line each) show `rationale.title`; click to expand `why`, the arguments and the result summary. Read steps are grey, draft steps blue, gated steps orange.
- **Blocks** render inline: plan (also pinned on the right), proposal table, verification checklist (green / red), **definition** (a Term with its evidence, e.g. "Retour = document `RMA-…`; quantities are negative — checked on 62 814 documents"), **decision** (a resolved choice), table, bar chart, object and app links.
- The **question card** supports single choice, **checkboxes** (seed questions) and free text. The question card and the approval card are the only things that need the user; while one is open, the input box is disabled with a hint "Answer the question above".
- Status line under the input: "Working…" (with the latest thinking summary), "Waiting for your answer", "Waiting for your approval", or an error with "Retry". **Stop** button while running.

## 3. Data — `/p/:pid/data`, `/p/:pid/data/:datasetId`

- List: name, rows, columns, last upload, uploaded by, a **Simulated** tag. Button **Upload** (modal: file `.csv` / `.csv.gz`, name, "new dataset / new version of…", SNAPSHOT / APPEND, "simulated data" checkbox) with a progress bar (bytes and rows loaded).
- Dataset page: tabs **Preview** (paged table, column header shows type), **Columns** (type, nulls, distinct, top values, pattern; click → profile; each column links to its card on the Meaning page), **Versions**, **Problems** (parse errors with row and value).

## 4. Meaning — `/p/:pid/meaning`, `/p/:pid/meaning/:recordId`

The semantic bank, readable by a non-technical user.
- Header: active version, draft status, counts (definitions, relations, rules), **Decisions** button with the number of open ones, and the **questions** picked at the start with how many are covered.
- **Definitions** list grouped by type (things, measures, categories, dates): name, one-line definition, status (`card` grey / `enriched` green), the columns it lives in, warnings (simulated, partial coverage).
- Definition page: definition, aliases, where it lives (table · column · grain), relations to other definitions in words ("an order line **is part of** an order"), rules that apply (severity, description, decision if any), **evidence** (what was checked, result, when; the SQL in details), questions it serves, objects and properties built from it.
- **Decisions** tab: open ambiguities with their choices (multiple choice when the options are clearly separable, free text otherwise); resolving one here goes into the bank draft and asks to publish.
- **Versions** tab: versions with summary and limitations; *stretch:* improvement rounds and their verdicts.

## 5. Pipelines — `/p/:pid/pipelines`, `/p/:pid/pipelines/:apiName`

Read-only (the agent writes pipelines).
- List: name, description, inputs, outputs, last build (rows, duration, status), the definitions it serves.
- Pipeline page: steps as a vertical list (one card per node: kind in words — "keep rows where the number starts with SO-", "one row per order" — and its inputs), a **Preview** button per step (first 50 rows + row count), checks with their last result, builds history.

## 6. Objects — `/p/:pid/objects`, `/p/:pid/objects/:type`, `/p/:pid/objects/:type/:pk`

- Catalog: one card per object type (display name, description, count, aliases as small tags, "built from" the definition).
- Type page: searchable, filterable table (filters from `allowedValues`; **rules as toggle filters**, e.g. "Over capacity"), derived properties as columns, count; "Actions" menu with the type's actions.
- Object page: title, properties (descriptions on hover), **derived properties** (with a "how it's calculated" tooltip in words), rule badges, **links** (lists of linked objects), **actions** buttons, and **history** (action log entries: who, when, what changed, on which objects).
- **Action form** (modal): one field per parameter (object parameters are pickers; prefilled when opened from an object), live validation via dry-run on change, the criterion messages shown in plain words ("Gennevilliers would be at 112 % of capacity on 14/10"), submit → toast with the success or failure message.

## 7. Apps, Alerts *(stretch)*

As in the previous version: a generic renderer for `AppDef` (metrics, object list with filters, detail panel with linked objects and action buttons, charts, markdown) and a list of automations with On/Off switch (the agent needs approval), last fired, events.

## 8. History — `/p/:pid/history`

Two timelines: **meaning** (semantic versions: version, summary, by, when, diff of definitions) and **workspace** (version, message, semantic version used, by, via UI/agent, when, diff, pipeline builds), plus the action log (filterable by action and object).

## 9. Empty and error states

- No datasets: "Upload your files to get started" + button.
- Datasets but no semantic version: "Ask the assistant to work out what your data means" + link to the assistant with a prefilled message.
- Semantic version but no object types: "Ask the assistant to turn your data into objects" + prefilled message.
- Errors always show the plain message, then "Details" (code, hint).
