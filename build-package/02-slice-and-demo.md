# 02 — The slice and the demo script

## 1. The pitch in one sentence

**A support manager who has never written code uploads two spreadsheets and, in ten minutes of conversation, gets a working ticket-triage system: objects, a link, a "resolve" action with rules, a triage screen, an alert for urgent tickets, and answers to questions about the data.**

## 2. What is in the slice

| # | Capability | Built by | Feature-book refs |
|---|---|---|---|
| 1 | Projects, users, project roles | seed + UI | 1.P1–P2 |
| 2 | **Upload CSV** → dataset with inferred schema, versions (SNAPSHOT / APPEND), preview, column profile | user (by hand) | 1.D1–D5 |
| 3 | **Ontology**: object types from datasets (primary key, title, properties with descriptions and aliases), link types (foreign key), action types (modify / create rules, parameters, submission criteria) | **agent** | 2.F1–F7, F8 (simple) |
| 4 | **Workspace draft → validate → publish** with versions and history | agent edits, user approves publish | 2.F9–F10, pattern S2 |
| 5 | **Objects**: views over source + edits, query, aggregate, read-only SQL, object page with links | platform | 6.X1–X2, pattern S9 |
| 6 | **Actions**: form, validation, apply, action log; edits survive re-upload | user or agent (gated) | 2.F6, C5 of docs check |
| 7 | **App**: a JSON app document (list + filters + detail + action button + metric cards) rendered by a generic renderer | **agent** | 4.W1–W3 (reduced) |
| 8 | **Automation**: "when an object enters a set → in-app notification" | **agent** (enabling is gated) | 6.A1–A4 (reduced) |
| 9 | **AI FDE agent**: router → explore / build modes, tools, plan, clarifying questions, approvals, verification, plain-language summaries, rationale per step, context budget | — | 3.G1–G8, G11, G17; ch. 3 §3.7–3.8 |
| 10 | **Analyst answers** inside the same chat: SQL / aggregation over objects, small table or bar chart | agent (explore mode) | 3.G8; ch. 3 §4.x |
| 11 | **Metadata improvement suggestions** after answers (description / alias tweaks, applied through the draft) | agent | ch. 3 §4.x |

**Out of the slice:** connectors and syncs, writeback, pipelines, branches / proposals (the workspace draft replaces them), Workshop drag-and-drop editor, documents and embeddings, Logic functions, fine-grained security.

## 3. Demo data

`fixtures/tickets.csv` (60 rows: `ticket_id, title, description, status, priority, category, assignee, customer, created_at, resolved_at, estimate_hours`; 36 open, 7 in_progress, 17 resolved; priorities low / medium / high / urgent; one ticket unassigned) and `fixtures/people.csv` (6 rows: `person_id, full_name, email, team, role`). `tickets.assignee` contains the person's **full name**, so a link can be built on `assignee → full_name`.

## 4. Demo script (≈10 minutes)

Before the demo: the project **Support Ops** exists; the presenter has uploaded `tickets.csv` and `people.csv` (this is the "manual connection" step, shown in 20 seconds).

| # | User says (chat) | Agent does (visible step cards) | User sees / approves |
|---|---|---|---|
| 1 | "I just uploaded our tickets and our team list. I'm not technical. Can you turn this into something my team can work with?" | Router → explore mode. Lists datasets in the project, reads both schemas, profiles key columns (uniqueness of `ticket_id`, distinct values of `status` and `priority`, match rate of `assignee` against `people.full_name`) | A **plan card** in plain language: "1. Ticket and Team member objects 2. a link 'assigned to' 3. a way to resolve tickets 4. a triage screen 5. an alert for urgent tickets" + **one clarifying question**: "When a ticket is resolved, should we record who resolved it and when?" (choices) |
| 2 | Picks "Yes, record who and when" | Switches to build mode. Writes into the **draft**: object types `Ticket` (key `ticket_id`, title `title`, descriptions and aliases for every property, `status` editable) and `TeamMember` (key `person_id`, title `full_name`); link `Ticket.assignedTo → TeamMember` (on `assignee = full_name`); action `ResolveTicket` (parameter ticket + resolution note; rule: status ← "resolved", resolved_at ← now, resolved_by ← current user; submission criterion: status ≠ resolved). Runs **validate draft** | A **proposal card**: table of what will be created + caveats in plain words ("1 ticket has no assignee; it will simply have no link") |
| 3 | — | Calls `publish_draft` → **approval card** | **Allow** |
| 4 | — | Verifies with SQL: 60 tickets, 6 team members, 59 links (1 unassigned), action dry-run on an open ticket passes, on a resolved ticket is refused with the right message | A **verification card**: "Checked: 60 tickets, 6 team members, 59 tickets linked, the resolve action works on open tickets and is refused on resolved ones" |
| 5 | "Now give my team a screen to triage tickets, urgent ones first, and let them resolve from there." | Writes an **app document** into the draft (list filtered to not-resolved, sorted urgent → low, filters on priority / assignee / category; detail panel with properties and the assignee; button "Resolve" → `ResolveTicket`; metric cards: open, urgent, average estimate). Validates. Asks to publish | Approval card → **Allow**; a link "Open Triage app" |
| 6 | (opens the app, resolves one urgent ticket with a note) | — | The ticket disappears from the list; counts update |
| 7 | "Warn me whenever a ticket becomes urgent." | Writes an **automation** into the draft: condition "Ticket enters set: priority = urgent and status ≠ resolved"; effect "notify <current user>". Asks to enable | Approval card → **Allow** |
| 8 | (presenter changes a ticket's priority to urgent with a second action the agent created on request, or edits it in the app) | Automation fires | A **notification** "Ticket T-20xx is now urgent" |
| 9 | "Who has the most open hours of work right now?" | Explore mode: SQL over `ont.ticket` joined to `ont.team_member` | A small **table + bar chart** and one-sentence answer; step cards show the SQL in "details" |
| 10 | — | After the answer: suggests a metadata improvement ("add alias 'workload' to estimate_hours"), placed in the draft | A small suggestion card the user can accept (publish) or dismiss |

**What the audience should take away:** no code, no clicks in an editor; every change was proposed in plain words, approved, and checked.

## 5. Fallbacks for a live demo

- **LLM slow or down:** `LLM_MOCK=1` replays a recorded session (`fixtures/demo-session.jsonl`, recorded during rehearsal, task T-24) through the same UI.
- **Agent makes a different but valid choice** (e.g. names the type `SupportTicket`): fine; the script never depends on exact names.
- **Agent asks an unexpected question:** answer it naturally; the rehearsal checklist in `07-acceptance-tests.md` lists the outcomes that must hold whatever the wording.
