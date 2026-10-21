# 06 — Screens

Plain-text wireframes. Visual style: clean, light, generous spacing, one accent color; no need to resemble any existing product. Routes are under `/p/:projectId`.

## 1. Shell

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Mini-Foundry   [Support Ops ▾]                         🔔 3   Ada ▾        │
├──────────────┬────────────────────────────────────────────────────────────┤
│ Assistant    │                                                            │
│ Data         │                (page content)                              │
│ Objects      │                                                            │
│ Apps         │                                                            │
│ Alerts       │                                                            │
│ History      │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```
The bell opens the notifications list (title, body, time, link to the object).

## 2. Assistant (the main screen of the demo) — `/p/:pid/assistant/:sessionId?`

```
┌─ Conversations ─┐┌─ Chat ──────────────────────────────────────┐┌─ Plan & draft ─────────┐
│ + New           ││ You: I just uploaded our tickets…           ││ Plan                   │
│ • Ticket setup  ││                                             ││ ✓ 1 Look at the data   │
│ • Workload Q    ││ ▸ Looking at your datasets          (step)  ││ ● 2 Ticket & Team…     │
│                 ││ ▸ Checking ticket IDs are unique    (step)  ││ ○ 3 Resolve action     │
│                 ││ ▸ Matching assignees to team list   (step)  ││ ○ 4 Triage screen      │
│                 ││                                             ││ ○ 5 Urgent alert       │
│                 ││ Assistant: Here's what I suggest… [plan]    ││                        │
│                 ││ ┌ Question ───────────────────────────────┐ ││ Draft (not published)  │
│                 ││ │ When a ticket is resolved, should we…   │ ││ + Ticket (13 props)    │
│                 ││ │ (•) Yes, record who and when            │ ││ + TeamMember (5)       │
│                 ││ │ ( ) No, just change the status          │ ││ + Assigned to          │
│                 ││ │ [ other… ]                  [Answer]    │ ││ + Resolve ticket       │
│                 ││ └─────────────────────────────────────────┘ ││ ✓ valid · 1 warning    │
│                 ││ ┌ Approval needed ────────────────────────┐ ││ [View diff]            │
│                 ││ │ Publish 2 object types, 1 link, 1 action│ ││                        │
│                 ││ │ ▸ What changes (diff)  ▸ Details (args) │ ││ Context ▓▓▓░░░ 21%     │
│                 ││ │ Message: [Create tickets and team…   ]  │ ││                        │
│                 ││ │                  [Reject]   [Allow]     │ ││                        │
│                 ││ └─────────────────────────────────────────┘ ││                        │
│                 ││ [ Type a message…                  ] [Send] ││                        │
└─────────────────┘└─────────────────────────────────────────────┘└────────────────────────┘
```
- **Step cards** (one line each) show `rationale.title`; click to expand `why`, the arguments and the result summary. Read steps are grey, draft steps blue, gated steps orange.
- **Blocks** render inline: plan (also pinned on the right), proposal table, verification checklist (green / red), table, bar chart, object and app links.
- The **question card** and the **approval card** are the only things that need the user; while one is open, the input box is disabled with a hint "Answer the question above".
- Status line under the input: "Working…", "Waiting for your answer", "Waiting for your approval", or an error with "Retry".
- **Stop** button while running.

## 3. Data — `/p/:pid/data`, `/p/:pid/data/:datasetId`

- List: name, rows, columns, last upload, uploaded by. Button **Upload CSV** (modal: file, name, "new dataset / new version of…", SNAPSHOT / APPEND).
- Dataset page: tabs **Preview** (paged table, column header shows type), **Columns** (type, nulls, distinct, sample; click → profile with top values), **Versions** (version, type, rows, by, when), **Problems** (parse errors with row and value).

## 4. Objects — `/p/:pid/objects`, `/p/:pid/objects/:type`, `/p/:pid/objects/:type/:pk`

- Catalog: one card per object type (display name, description, count, aliases as small tags).
- Type page: searchable, filterable table (filters from `allowedValues`), count; "Actions" menu with the type's actions.
- Object page: title, properties (with descriptions on hover), **links** (lists of linked objects), **actions** buttons, and **history** (action log entries for this object: who, when, what changed).
- **Action form** (modal): one field per parameter (object parameters prefilled when opened from an object), live validation via dry-run (`dryRun: true`) on change, submit → toast with the success or failure message.

## 5. Apps — `/p/:pid/apps`, `/p/:pid/apps/:appId`

Generic renderer for `AppDef`:
- `metric` → card with label and value.
- `objectList` → table with filter controls above, sort per definition, row click selects.
- `objectDetail` → side panel for the selected row: properties, linked objects, action buttons (open the action form prefilled with the selected object).
- `chart` → bar or pie (Recharts).
- `markdown` → rendered text.
Layout: metrics in a row, then list (2/3 width) + detail (1/3 width); stacks vertically on narrow screens. After an action succeeds, all blocks refetch.

## 6. Alerts — `/p/:pid/alerts`

List of automations: name, description, condition in words ("Ticket becomes urgent and isn't resolved"), effect in words, **On/Off** switch (a user may switch it directly; the agent needs approval), last fired, events list (time, objects, effect status).

## 7. History — `/p/:pid/history`

Published workspace versions (version, message, by, via UI/agent, when) with a diff view, plus the action log (filterable by action and object).

## 8. Empty and error states

- No datasets: "Upload a CSV to get started" + button.
- No object types: "Ask the assistant to turn your data into objects" + link to the assistant with a prefilled message.
- Errors always show the plain message, then "Details" (code, hint).
