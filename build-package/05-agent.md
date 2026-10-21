# 05 — The agent ("FDE")

The agent is the product. A non-technical user describes what they want; the agent investigates the data, proposes a design in plain words, builds it in a **draft**, asks before anything leaves the draft, checks its own work and explains what it verified.

Design sources (feature book ch. 3 §3.2–3.8 and §4.x): router → explore / build stages; typed documents written through a few broad tools; clarifying questions; plan; self-verification with SQL and dry-runs; approval as a pause state; rationale on every tool call; context budget with hideable items; post-answer metadata suggestions. All prompt text is **ours** (`prompts/`).

## 1. Loop (server side)

```
onUserMessage(session, text):
  append item user_message; if session.mode == 'router' keep it, else stay in current mode
  runLoop(session)

runLoop(session):
  session.status = running
  for step in 1..MAX_STEPS (40):
    req = buildRequest(session)                 // §6: prompt for the mode + visible items + tools for the mode
    res = llm.chat(req, stream=true)            // stream assistant text deltas to SSE
    if res.text: append assistant_message (with parsed ChatBlocks, §9)
    if no tool calls: session.status = idle; maybeSuggestMetadata(session); return
    for call in res.toolCalls (in order):
      tool = registry[call.name]
      if !tool or !tool.modes.includes(session.mode): append tool_result error UNKNOWN_TOOL_FOR_MODE (+hint: change_mode); continue
      args = parseJson(call.arguments) else append tool_result error BAD_ARGUMENTS; continue
      check zod(args) else append tool_result error with field errors; continue
      append tool_call item (title/why from args.rationale)
      if tool.risk == 'gated':
         create approval (summary = tool.summarize(args)); append approval_request
         session.status = awaiting_approval; return           // loop resumes on decision
      if tool.name == 'ask_user': append question; session.status = awaiting_answer; return
      result = await tool.run(args, ctx)                       // ctx: user, project, session, services
      append tool_result (compact JSON + one-line summary, wrapped with size metadata, §7)
    if sameToolSameErrorCount >= 3: append note "stopping after repeated error"; break
  session.status = idle

onApproval(decision):
  if allow: run the stored call (with editedArgs if any), append tool_result; else append tool_result
     {ok:false, code:'REJECTED_BY_USER', message, note}
  runLoop(session)                                             // the model sees the outcome and continues

onAnswer(answers): append answer item as a tool_result of ask_user; runLoop(session)
```

DeepSeek / OpenAI-compatible details: send `tools` as `{type:'function', function:{name, description, parameters}}`; tool results go back as `role:'tool'` messages with the matching `tool_call_id`; handle several tool calls in one response; if the model returns malformed JSON arguments, return a `BAD_ARGUMENTS` tool result instead of crashing. Temperature 0.2. Keep `LLM_MODEL` configurable.

## 2. Stages and modes

| Mode | Purpose | Tools available |
|---|---|---|
| `router` | First turn of a session: understand the request, choose a mode | meta tools only |
| `explore` | Investigate data and the ontology; answer questions (analyst) | meta + read tools |
| `build` | Change the workspace: draft edits, validation, gated publishing | meta + read + draft + gated tools |

`change_mode` is free (no approval). The agent may go router → explore → build → explore… The prompt for each mode = base prompt + mode guide (§6).

## 3. Tools

Every tool's input has a required `rationale: { title: string (≤ 60 chars, plain language), why: string (≤ 160 chars) }`, shown to the user as the step card. Schemas are generated from zod (`apps/server/src/agent/tools/*.ts`); `tools/catalog.json` lists them with their inputs.

| Tool | Modes | Risk | What it does |
|---|---|---|---|
| `change_mode` | all | meta | Switch to `explore` or `build` (`{mode, reason}`) |
| `ask_user` | all | meta | 1–3 questions, each with optional choices + free text; pauses the session |
| `set_plan` | all | meta | Record / update a numbered plan in plain language (`{steps:[{text, status}]}`); shown as the plan card |
| `hide_items` | all | meta | Hide finished tool results from the model's context (`{seqs[]}`); a summary stays |
| `list_datasets` | explore, build | read | Datasets of the project with current version, row count, columns |
| `get_dataset` | explore, build | read | Columns, types, parse errors of a dataset version |
| `preview_dataset` | explore, build | read | First N rows (≤ 50) |
| `profile_columns` | explore, build | read | `ColumnProfile` for given columns: nulls, distinct, uniqueness, top values, min/max; plus `matchRate` between two columns of two datasets (for links) |
| `get_workspace` | explore, build | read | Published or draft document, whole or one entity, plus validation of the draft |
| `search_ontology` | explore, build | read | Several queries at once over names, descriptions and aliases of types, properties, links, actions; returns ranked matches with why they matched |
| `query_objects` | explore, build | read | `QueryObjectsRequest` → rows (≤ 50 per call) |
| `aggregate_objects` | explore, build | read | `AggregateRequest` → groups |
| `get_object` | explore, build | read | One object with its links |
| `run_sql` | explore, build | read | Read-only SQL on `ont.*` (and `data.*`): ≤ 500 rows, 5 s |
| `get_action_log` / `get_automation_events` | explore, build | read | Recent runs / firings |
| `edit_draft` | build | draft | Apply `DraftOp[]` to the workspace draft (`{expectedRevision, ops}`) → revision + validation |
| `validate_draft` | build | draft | Full validation incl. data checks (`04-api.md` §4) |
| `diff_draft` | build | draft | What publishing would change |
| `test_action` | build | draft | Dry-run an action **as defined in the draft** against current published objects; nothing is written |
| `discard_draft` | build | draft | Reset the draft to the published version |
| `publish_draft` | build | **gated** | Publish the draft (`{expectedRevision, message}`) |
| `run_action` | explore, build | **gated** | Apply a published action to real objects |
| `enable_automation` / `disable_automation` | build | **gated** | Switch an automation on / off |
| `suggest_metadata` | post-answer | draft | Record up to 3 metadata suggestions (`{target, field, value, rationale}`) |

**Tool results** are compact JSON with a `summary` line and, for lists, `total` + `truncated`. Errors are `{ok:false, code, message, hint}` and never throw out of the loop.

## 4. What the agent must always do (enforced in prompts and, where possible, in code)

1. **Investigate before proposing:** list datasets, read schemas, **profile** candidate keys (uniqueness, nulls) and candidate link columns (match rate), look at real values before using them in filters or rules.
2. **Plan in plain words first** (`set_plan`), and **ask** when the request is ambiguous or a business rule is unknown (`ask_user` with choices). Don't ask about things the data answers.
3. **Write rich metadata:** every object type, property, link and action gets a description; add 1–3 aliases where people use other words; actions get an `agentDescription`.
4. **Build in the draft, then validate** (`validate_draft`) and fix all errors before asking to publish.
5. **Show a proposal** (`proposal` block: item → what it does, plus caveats) before the first publish of a session.
6. **Verify after publishing:** counts vs datasets, link coverage, `test_action` on a valid and an invalid case, app blocks return rows, automation set size. Report with a `verification` block. **A failed check means "not done"**: say so plainly and propose a fix.
7. **Never claim** something was created, changed or verified unless a tool result says so.
8. **Explain in plain language;** put ids, SQL and JSON in details only.

## 5. Approval policy

| Risk | Examples | Approval | Rationale |
|---|---|---|---|
| `meta`, `read` | search, profile, SQL, preview | Never | Changes nothing |
| `draft` | `edit_draft`, `validate_draft`, `test_action`, `suggest_metadata` | Never | The draft is the agent's free zone; nothing users rely on changes |
| `gated` | `publish_draft`, `run_action`, `enable_automation`, `disable_automation` | **Always**, per call | Leaves the draft: changes what users see, changes real objects, or starts background behavior |

The approval card shows: the tool's plain-language summary (from `tool.summarize(args)`, e.g. "Publish 2 object types, 1 link, 1 action and the 'Ticket triage' app"), the diff (for publish), the exact arguments (collapsible), and **Reject / Allow**; `publish_draft` lets the user edit the `message`. A rejection returns `REJECTED_BY_USER` with the user's optional note; the agent must not retry the same call without a new instruction.

## 6. Prompts (our own text, in `prompts/`)

Prompt for a request = `base.md` + the mode file (`router.md` | `explore.md` | `build.md`) + **session facts** (date, user display name, project name, datasets in the project with row counts, published workspace version and a one-line inventory of types / apps / automations). `suggest.md` is used for the post-answer step.

| File | Contents |
|---|---|
| `prompts/base.md` | Role and audience (non-technical users), output rules (plain language, ChatBlocks, never invent ids or links), modes and tools overview, the 8 rules of §4, approval etiquette, error handling, context budget |
| `prompts/router.md` | How to choose a mode; when to ask first |
| `prompts/explore.md` | Analyst rules: search before reading, discover real values before filtering, SQL vs aggregate, when to stop, how to answer (one sentence + table / chart) |
| `prompts/build.md` | **Modelling guide**: choosing object types, keys, titles, property types and names, editable fields, links, actions (parameters, rules, criteria), apps (blocks), automations; common mistakes; the build protocol (plan → investigate → draft → validate → propose → publish → verify) |
| `prompts/suggest.md` | When and how to suggest metadata improvements |

## 7. Context management

- Estimate tokens per item (`chars / 4`); keep `session.token_estimate`.
- Every tool result sent to the model is wrapped: `<item seq="12" tool="profile_columns" tokens="340" total="8120">…</item>`.
- Large results are truncated at 6 000 characters with `"truncated": true` and a hint to narrow the query.
- Budget: `LLM_MAX_CONTEXT_TOKENS` (default 64 000). Above 70 % the request adds a note asking the agent to `hide_items`; above 90 % the server hides the oldest tool results automatically (keeping their summaries). Never hide user messages, assistant messages, or results of tools that created things.

## 8. Persistence (`meta.agent_items.payload`)

| kind | payload |
|---|---|
| `user_message` / `assistant_message` | `{text, blocks?: ChatBlock[]}` |
| `tool_call` | `{callId, tool, args, risk}` |
| `tool_result` | `{callId, ok, summary, result | error}` |
| `approval_request` / `approval_decision` | `{approvalId, tool, summary, args}` / `{approvalId, decision, note?}` |
| `question` / `answer` | `{questionId, questions}` / `{questionId, answers}` |
| `mode_change` / `note` | `{from, to}` / `{text}` |

The model's message list is rebuilt from visible items on every step (hidden items become a one-line summary).

## 9. Chat blocks

The agent can embed `ChatBlock`s (`types/shared.ts`) in its messages using fenced blocks:

````
```block
{"kind":"verification","checks":[{"label":"Tickets loaded","ok":true,"detail":"60 of 60 rows"}]}
```
````

The server parses them out of the text; invalid JSON is shown as plain text. The UI renders plan, proposal, verification, table, bar chart, object and app links.

## 10. Post-answer metadata suggestions

After an `explore` turn that answered a question, the server makes one extra cheap call with `prompts/suggest.md` and only the `suggest_metadata` tool: if a search needed several tries, or the user used a word missing from aliases, the agent records up to 3 suggestions. The UI shows them as a small card; "Accept" applies them with `edit_draft` `setMetadata` and asks to publish.

## 11. Limits and safety

- Max 40 steps per user message; max 3 identical failing calls; max 6 tool calls in one response.
- SQL: read-only role, `SELECT`/`WITH` only (checked by parser), 5 s, 500 rows.
- The agent never sees secrets; tools act as the current user and check project roles.
- `run_action` on more than 5 objects in one turn requires a fresh approval each time (no bulk loops).

## 12. Testing the agent

- **Tool tests** (deterministic): each tool against a seeded test database.
- **Scripted LLM** (`LLM_MOCK=1`): a fake gateway returning recorded responses from `fixtures/demo-session.jsonl`, to test the loop, approvals and UI without network.
- **Live rehearsal** (real model): the demo script; pass criteria in `07-acceptance-tests.md` §3 are outcome-based, not wording-based.
