# 05 — The agent ("FDE")

The agent is the product. A non-technical user describes what they want; the agent works in four stages: **ingest check → semantics → ontology → logic and actions**. It turns the goal into questions, pins down what the data means with evidence, builds pipelines, objects and links on that meaning, adds logic and actions, asks before anything leaves a draft, checks its own work and explains what it verified.

Design sources: feature book ch. 3 §3.2–3.8 and §4.x (router, stages, typed documents, clarifying questions, plan, self-verification, approvals, rationale, context budget) and ch. 8 (EvoOntology: seed workload, evidence-grounded build, browse / resolve, trajectories, evolution). All prompt text is **ours** (`prompts/`); the semantics prompt is adapted from EvoOntology's `build-ontology` skill and keeps its MIT notice.

## 1. Loop (server side)

```
onUserMessage(session, text):
  append item user_message
  runLoop(session)

runLoop(session):
  session.status = running
  for step in 1..MAX_STEPS (60):
    req = buildRequest(session)                 // §6: cached system + all tools + items (append-only)
    res = llm.stream(req).finalMessage()        // stream text and thinking-summary deltas to SSE
    append assistant_message with res.content AS IS (text, thinking, tool_use blocks)
    if res.stop_reason == 'refusal': append note (plain message); session.status = idle; return
    if res.stop_reason == 'max_tokens': append note; continue           // ask the model to continue
    if no tool_use blocks: session.status = idle; return
    results = []
    for call in tool_use blocks (in order):
      tool = registry[call.name]
      if !tool.modes.includes(session.mode): results += error UNKNOWN_TOOL_FOR_MODE (+hint: change_mode); continue
      check zod(call.input) else results += error BAD_ARGUMENTS with field errors; continue
      append tool_call item (title/why from input.rationale)
      if tool.risk == 'gated': create approval; append approval_request; pending = call; break
      if tool.name == 'ask_user': append question; pending = call; break
      results += await tool.run(input, ctx)       // ctx: user, project, session, services
    if pending:                                   // pause: the paused call's tool_result is sent on resume,
      store results so far; set status (awaiting_approval | awaiting_answer); return
    append ONE user turn with all tool_result blocks (is_error: true for failures)
    if sameToolSameErrorCount >= 3: append note "stopping after repeated error"; break
  session.status = idle

onApproval(decision):
  allow → run the stored call (with editedArgs if any); reject → {ok:false, code:'REJECTED_BY_USER', note}
  run any calls after it in the same response; append one user turn with every tool_result; runLoop(session)

onAnswer(answers): the answer is the tool_result of ask_user; same as above
```

### Claude specifics (gateway `apps/server/src/llm/`)

- SDK `@anthropic-ai/sdk`, model `LLM_MODEL` (`claude-opus-5-5`), `thinking: {type: 'adaptive', display: 'summarized'}` (the summaries feed the "Working…" line), `output_config: {effort: LLM_EFFORT}` (set it: Opus 5.5 defaults to `medium`). No `temperature` (rejected on this model).
- Streaming with `client.beta.messages.stream(...)` and `finalMessage()` (the beta namespace because fallbacks and context editing are betas); `max_tokens` 32 000.
- **Tool choice is always `auto`**: forced `any` / `tool` returns a 400 on this model. Steer from the prompt ("call `set_plan` first"). Tools are declared with `eager_input_streaming: true`; every input is validated with its zod schema before running (a truncated or invalid input → `BAD_ARGUMENTS`).
- **Parallel tool calls**: one response may contain several `tool_use` blocks; all their `tool_result` blocks go back in **one** user turn, failures included with `is_error: true`.
- **Refusals**: send the server-side fallback (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, on `client.beta.messages`), and always check `stop_reason === 'refusal'` before reading content.
- **Append-only history**: assistant `content` (including `thinking` blocks) is stored and replayed unchanged; earlier items are never edited or removed (editing them invalidates thinking blocks and the prompt cache). Context management is server-side (§7).
- **Errors**: retry 429 / 5xx / connection errors with the SDK's retries; a 400 ends the step with a plain message and the details in the trace.

DeepSeek / OpenAI-compatible APIs are no longer supported; the mock gateway (§12) replays recorded Anthropic responses.

## 2. Stages and modes

| Mode | Stage | Purpose | Tools available |
|---|---|---|---|
| `router` | — | First turn of a session: understand the request, choose a mode | meta tools only |
| `explore` | — | Investigate data, the bank and the ontology; answer questions (analyst) | meta + read tools |
| `semantics` | 1–2 | Check what was ingested, agree seed questions, enrich and validate the bank, settle decisions, publish a semantic version | meta + read + bank-draft tools + `publish_semantics` (gated) |
| `build` | 3–4 | Pipelines, object types, links, logic, actions (apps and automations as stretch); validate, test, publish | meta + read + workspace-draft tools + gated tools |

- `change_mode` is free (no approval). **`build` is refused (`NO_SEMANTIC_VERSION`) until a semantic version is published.** The agent may go back to `semantics` to add a Term or a Relation it finds missing, then re-publish (gated) and `setSemanticVersion` in the workspace draft.
- The mode is told to the model with a **mid-conversation system message** (`{role: 'system', content: <mode guide>}` appended after the user turn), not by changing the top-level `system`, and the **tool list is the same in every mode**: both keep the cached prefix intact. The server enforces which tools a mode may call.
- **Placement rule of the API**: a mid-conversation system message must follow a user message and be either the last message or followed by an assistant message (anything else is a 400). Notes are appended just before a model call, so they normally end the request; when no assistant reply follows them (the call failed, a bare refusal) or they follow an assistant message (the "continue" note after `max_tokens`), `buildMessages` sends that run of notes as one user message of `<system-reminder>` text blocks instead. The choice depends only on items that never change, so answered notes are replayed as system messages forever. The mock gateway refuses any request that breaks these rules (`checkMessageSequence`).

## 3. Tools

Every tool's input has a required `rationale: { title: string (≤ 60 chars, plain language), why: string (≤ 160 chars) }`, shown to the user as the step card. Schemas are generated from zod (`apps/server/src/agent/tools/*.ts`); `tools/catalog.json` lists them with their inputs.

| Tool | Modes | Risk | What it does |
|---|---|---|---|
| `change_mode` | all | meta | Switch mode (`{mode, reason}`) |
| `ask_user` | all | meta | 1–3 questions, each with choices (`multiple: true` allowed, used for seed questions) + free text; pauses the session |
| `set_plan` | all | meta | Record / update a numbered plan in plain language (`{steps:[{text, status, stage}]}`); shown as the plan card and the stage stepper |
| `list_datasets` | all but router | read | Datasets with current version, row count, columns, `simulated` |
| `get_dataset` | all but router | read | Columns, types, parse errors of a dataset version |
| `preview_dataset` | all but router | read | First N rows (≤ 50) |
| `profile_columns` | all but router | read | `ColumnProfile` for given columns; `matchRate` between columns of two datasets (single or composite keys) |
| `run_sql` | all but router | read | Read-only SQL on `logic.*`, `ont.*`, `data.*`: ≤ 500 rows, 5 s |
| `bank_overview` | all but router | read | Semantic version, counts, enriched vs card terms, open decisions, uncovered questions |
| `browse_semantics` | all but router | read | EvoOntology `browse`: ranked concepts for a query (≤ 6) |
| `resolve_semantics` | all but router | read | EvoOntology `resolve`: mentions (≤ 5) → grounded mappings, constraints, evidence. **Required before SQL in explore mode**; writes the trajectory |
| `get_workspace` / `search_ontology` | all but router | read | Published or draft document / ranked matches over names, descriptions, aliases |
| `query_objects` / `aggregate_objects` / `get_object` | all but router | read | Objects API on `logic.*` (≤ 50 rows per call) |
| `get_action_log` | all but router | read | Recent runs |
| `set_workload` | semantics | bank draft | Save the goal and the proposed / picked seed questions |
| `edit_semantics` | semantics | bank draft | Apply `SemOp[]` (`04-api.md` §2) → revision + validation. Evidence queries run server-side |
| `validate_semantics` | semantics | bank draft | Full bank validation (`04-api.md` §5) |
| `publish_semantics` | semantics | **gated** | Publish the bank draft as `vN` with summary, limitations, question links |
| `edit_draft` | build | draft | Apply `DraftOp[]` to the workspace draft |
| `preview_pipeline` | build | draft | Run a draft pipeline (or one node) on the real input with a limit; returns rows, row counts per node, check results |
| `test_logic` | build | draft | Evaluate draft derived properties and rules on published objects |
| `validate_draft` / `diff_draft` / `discard_draft` | build | draft | As before |
| `test_action` | build | draft | Dry-run an action **as defined in the draft** against published objects; nothing is written |
| `publish_draft` | build | **gated** | Publish the workspace (builds pipelines, views, logic) |
| `run_action` | explore, build | **gated** | Apply a published action to real objects |
| `enable_automation` / `disable_automation` | build | **gated** | *Stretch* |
| `adopt_semantic_version` | semantics | **gated** | *Stretch:* adopt an evolution candidate that won the judge gate |

**Tool results** are compact JSON with a `summary` line and, for lists, `total` + `truncated`. Errors are `{ok:false, code, message, hint}` and never throw out of the loop.

## 4. What the agent must always do (enforced in prompts and, where possible, in code)

1. **Start from the goal, not the tables.** Restate the user's goal, then propose 8–12 seed questions in their words (`ask_user`, `multiple: true`). Don't ask the user to write questions.
2. **Investigate before claiming meaning:** every enriched Term, Relation and Constraint has Evidence from a query on the real data (profile, distinct values, join match rate, sign of quantities, date coverage). Compare competing columns and record why the others were rejected. Never use outside knowledge about the company.
3. **Ask only what the data can't answer**, as choices: business definitions (what "return rate" is measured against), scope (which months count). Record answers as resolved Constraints.
4. **Build on the bank:** object types and properties take descriptions and aliases from Terms; links come from Relations with checked keys; value lists from `enum_semantics` constraints; criteria and logic cite the Constraints they implement.
5. **Plan in plain words first** (`set_plan`) and keep the stage stepper current.
6. **Build in a draft, then validate**, preview every pipeline output, `test_logic` every derived property and rule, `test_action` every action on a valid and an invalid case; fix all errors before asking to publish.
7. **Show a proposal** (`proposal` block: item → what it does, row counts, caveats) before each first publish of a stage.
8. **Verify after publishing:** counts vs pipeline outputs and source distinct counts, link coverage, rule sizes, action dry-runs. Report with a `verification` block. **A failed check means "not done"**: say so plainly and propose a fix.
9. **Never claim** something was created, changed or verified unless a tool result says so.
10. **Explain in plain language, in the user's language;** ids, SQL and JSON go in details only. Label simulated data as simulated.
11. **Never try to identify** who is behind a code (client, person, banner); treat codes as opaque.

## 5. Approval policy

| Risk | Examples | Approval | Rationale |
|---|---|---|---|
| `meta`, `read` | search, profile, SQL, browse, resolve | Never | Changes nothing |
| `bank draft`, `draft` | `edit_semantics`, `edit_draft`, `preview_pipeline`, `test_logic`, `test_action` | Never | Drafts are the agent's free zone; nothing users rely on changes |
| `gated` | `publish_semantics`, `publish_draft`, `run_action`, `enable_automation`, `adopt_semantic_version` | **Always**, per call | Leaves a draft: changes the official meaning of the data, what users see, real objects, or starts background behavior |

The approval card shows: the plain-language summary (from `tool.summarize(args)`, e.g. "Adopt 24 definitions, 9 relations and 11 rules as the official meaning of your data", "Publish 4 pipelines, 7 object types, 6 links, 4 logic items and 2 actions"), the diff, the exact arguments (collapsible), and **Reject / Allow**; publish cards let the user edit the message. A rejection returns `REJECTED_BY_USER` with the user's optional note; the agent must not retry the same call without a new instruction.

## 6. Prompts (our own text, in `prompts/`)

Request = **top-level `system`** = `base.md` + session facts that change rarely (project name, user display name) — cached · **tools** (all, stable order) — cached · **messages**: the items, with mode guides and fresh facts (date, datasets, active semantic version, published workspace inventory) appended as mid-conversation system messages when they change.

| File | Contents |
|---|---|
| `prompts/base.md` | Role and audience (non-technical users), the four stages, output rules (plain language, user's language, ChatBlocks, never invent ids or links), the 11 rules of §4, approval etiquette, error handling, data rules (opaque codes, simulated data) |
| `prompts/router.md` | How to choose a mode; a new project with no semantic version always starts in `semantics` |
| `prompts/semantics.md` | Adapted from EvoOntology `build-ontology` (MIT): goal → seed questions → coverage map → design records → ground each with evidence (candidate comparison) → commit → validate → decisions → publish with summary, limitations, question links. The five record types and closed vocabularies |
| `prompts/build.md` | **Modelling guide**: pipelines first (when to roll up, split, deduplicate, derive keys; checks), then object types from entity Terms, links from Relations, logic from metric Terms and business-rule Constraints, actions (parameters, rules, criteria with `afterEdits`); common mistakes; the protocol (plan → draft → preview/test → validate → propose → publish → verify) |
| `prompts/explore.md` | Analyst rules: `resolve_semantics` first, apply decided readings and say which one, discover real values before filtering, `logic.*` and pipeline outputs before raw tables (never scan the 2.2 M order lines for an answer), how to answer (one sentence + table / chart) |

## 7. Context management

- The window is 1 M tokens; our working budget is `LLM_MAX_CONTEXT_TOKENS` (200 000). Estimate tokens per item (`chars / 4`) and keep `session.token_estimate`; show it as the context gauge.
- Tool results are wrapped `<item seq="12" tool="profile_columns" tokens="340">…</item>` and truncated at 6 000 characters with `"truncated": true` and a hint to narrow the query.
- **History is never rewritten by our server.** Old tool results are cleared by the API's context editing (`context_management.edits: [{type: 'clear_tool_uses_20250919'}]`, beta `context-management-2025-06-27`), triggered as the conversation grows; the UI still shows every item from the database.
- **Prompt caching**: one `cache_control` breakpoint after `system` + tools, and automatic caching on the message history; check `usage.cache_read_input_tokens` in the trace.

## 8. Persistence (`meta.agent_items.payload`)

| kind | payload |
|---|---|
| `user_message` | `{text}` |
| `assistant_message` | `{content: <Anthropic content blocks as returned>, blocks?: ChatBlock[]}` |
| `tool_call` | `{callId, tool, args, risk}` |
| `tool_results` | `{results: [{callId, ok, summary, result | error}]}` (one per user turn) |
| `approval_request` / `approval_decision` | `{approvalId, tool, summary, args}` / `{approvalId, decision, note?}` |
| `question` / `answer` | `{questionId, questions}` / `{questionId, answers}` |
| `mode_change` / `system_note` / `note` | `{from, to}` / `{text}` (sent to the model) / `{text}` (UI only) |

The model's message list is rebuilt from the items in order on every step, with no edits.

## 9. Chat blocks

The agent can embed `ChatBlock`s (`types/shared.ts`) in its messages using fenced blocks:

````
```block
{"kind":"verification","checks":[{"label":"Commandes chargées","ok":true,"detail":"72 677 sur 72 677 documents SO"}]}
```
````

The server parses them out of the text; invalid JSON is shown as plain text. The UI renders plan, proposal, verification, decision (a resolved constraint), definition (a Term with its evidence), table, bar chart, object and app links.

## 10. Trajectories and evolution

- Every `explore` turn that answers a question writes a `sem_trajectories` row: question, semantic version, `browse` / `resolve` calls and results, other tool calls (results truncated ~2 KB), final answer, status. No thinking content.
- *Stretch:* when 30 trajectories or 7 days have accumulated since the last checkpoint, the semantics page shows "an improvement round is due". A run diagnoses failures from trajectories, patches a candidate version, and replays a sample of questions on parent and candidate; a separate judge call (`LLM_JUDGE_MODEL`, A/B order randomized) picks a winner per question. The candidate is offered (`adopt_semantic_version`, gated) only with zero critical errors and strictly more wins. This replaces the old "metadata suggestions" step.

## 11. Limits and safety

- Max 60 steps per user message; max 3 identical failing calls; max 6 tool calls in one response.
- SQL and pipeline previews: read-only role, `SELECT`/`WITH` only (checked by parser), 5 s (30 s for previews), 500 rows.
- The deployed database has one CPU (`01-architecture.md` §9): the agent queries `logic.*` and pipeline outputs, not raw line tables; a profile still `pending` is reported as such, never guessed.
- The agent never sees secrets; tools act as the current user and check project roles.
- `run_action` on more than 5 objects in one turn requires a fresh approval each time (no bulk loops).
- Sample values and query results are sent to Claude (allowed for the hackathon); keep tool results small and aggregated.

## 12. Testing the agent

- **Tool tests** (deterministic): each tool against a test database seeded with `fixtures/kumo-mini/`.
- **Scripted LLM** (`LLM_MOCK=1`): a fake gateway returning recorded Anthropic responses from `fixtures/demo-session.jsonl`, to test the loop, approvals, questions and UI without network.
- **Live rehearsal** (real model, real Kumo data, locally): the demo script; pass criteria in `07-acceptance-tests.md` §3 are outcome-based, not wording-based.
