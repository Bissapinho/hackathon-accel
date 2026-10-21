# 07 — Acceptance tests

Three levels: (1) platform checks, automated with Vitest against a test database seeded with `fixtures/`; (2) agent loop checks with the mock LLM; (3) a live demo rehearsal with the real model, judged on outcomes.

## 1. Platform (automated)

### Datasets
- **D1** Given `tickets.csv`, when uploaded as a new dataset, then version 1 has 60 rows, 11 columns, `created_at` typed `date`, `estimate_hours` typed `integer`, `resolved_at` typed `date` with 43 nulls, and no parse errors.
- **D2** Given a CSV with a value `"abc"` in an integer column, then the cell is null and `parse_errors` contains `{row, column, value:"abc", expected:"integer"}`.
- **D3** APPEND with different columns is refused with `COLUMNS_MISMATCH`; APPEND with the same columns creates version 2 with old + new rows.
- **D4** `profile_columns` on `ticket_id` returns `isUnique: true, nullCount: 0`; on `assignee` matched against `people.full_name` returns a match rate of 59/59 non-null values and 1 null.

### Workspace
- **W1** Applying `fixtures/expected-workspace.json` as draft ops then validating returns no errors.
- **W2** Validation errors: primary key on `status` → `PK_NOT_UNIQUE`; missing property description → `MISSING_DESCRIPTION`; rule setting `title` (not editable) → `RULE_SETS_READONLY`; unknown column → `UNKNOWN_REFERENCE`.
- **W3** Publishing creates `ont.ticket` and `ont.team_member` views; `SELECT count(*) FROM ont.ticket` = 60; `edits.ticket` exists with columns for editable properties.
- **W4** Publishing with a stale `expectedRevision` → `VERSION_CONFLICT`; the draft is unchanged.
- **W5** History lists version 1 with message, user and `via`.

### Objects and SQL
- **O1** Query "status ≠ resolved, sorted by priority order urgent→low" returns 43 rows with urgent ones first.
- **O2** `get_object` on a ticket returns its `assignedTo` link (1 row) and, on a team member, `assignedTickets`.
- **O3** `run_sql` rejects `DELETE`, `UPDATE`, `DROP` and multi-statements with `SQL_REJECTED`; a 6-second query is cancelled with `SQL_TIMEOUT`; results are capped at 500 rows with `truncated: true`.

### Actions
- **A1** `ResolveTicket` dry-run on an open ticket → `valid`, nothing written. Apply → `applied`; `ont.ticket` shows `status = resolved`, `resolved_by = <user>`, `resolved_at = today`, the note; the action log has one entry with before/after.
- **A2** Same action on that ticket again → `rejected` with "This ticket is already resolved."
- **A3** Re-upload `tickets.csv` as SNAPSHOT and re-publish → the resolved ticket is still resolved (edits survive); object count still 60.
- **A4** A viewer can't run actions (`FORBIDDEN`).

### Apps and automations
- **P1** The triage app renders: 3 metric values match SQL counts; the list shows unresolved tickets urgent first; selecting a row shows the detail panel with the assignee link and both action buttons.
- **AU1** Enabling `urgent-alert` fires nothing. Changing an open ticket's priority to urgent fires once: one `automation_events` row, one notification for the user who enabled it. Changing it again (still urgent) doesn't fire again. Resolving it then making another ticket urgent fires for the new one only.

## 2. Agent loop (mock LLM, automated)

- **G1** A tool call with malformed JSON returns `BAD_ARGUMENTS` to the model; the session continues.
- **G2** A tool not allowed in the current mode returns `UNKNOWN_TOOL_FOR_MODE` with the hint to change mode.
- **G3** `publish_draft` pauses the session (`awaiting_approval`) and creates an approval; **Reject** returns `REJECTED_BY_USER` to the model and the loop continues; **Allow** runs the call and returns its result.
- **G4** `ask_user` pauses with `awaiting_answer`; answering resumes with the answer as the tool result.
- **G5** `edit_draft`, `validate_draft`, `test_action` never create approvals; `run_action`, `enable_automation` always do.
- **G6** Three identical failing calls stop the loop with a note.
- **G7** Over 90 % of the context budget, the oldest tool results are hidden automatically, keeping summaries; created-resource results are never hidden.
- **G8** Every tool call item has a non-empty `rationale.title`; the UI shows it.
- **G9** Chat blocks in assistant text are parsed; invalid JSON blocks fall back to text.

## 3. Live demo rehearsal (real model, judged on outcomes)

Run the script in `02-slice-and-demo.md` §4 three times from a fresh database. **Pass** when all of these hold each time (names and wording may differ):

| # | Outcome |
|---|---|
| R1 | Before proposing, the agent profiled the ticket key and the assignee match (visible step cards) |
| R2 | It asked at least one relevant business question and no question the data answers |
| R3 | It showed a plan and a proposal in plain language before the first publish |
| R4 | Published: a ticket type with 60 objects and a unique key; a team type with 6; a link covering 59 tickets |
| R5 | Every type, property, link and action has a description; most have aliases |
| R6 | A resolve action exists with a criterion refusing already-resolved tickets; the agent tested both cases |
| R7 | The triage app works: urgent first, unresolved only, resolve button works from the detail panel |
| R8 | The urgent alert fires exactly once when a ticket becomes urgent |
| R9 | "Who has the most open hours of work?" gets a correct number (check with SQL) and a table or chart |
| R10 | Nothing was published, run or enabled without an approval card |
| R11 | The final summary includes a verification block; no claim without a tool result behind it |
| R12 | Total time from first message to working app ≤ 10 minutes |

Record the best run as `fixtures/demo-session.jsonl` for the mock fallback.
