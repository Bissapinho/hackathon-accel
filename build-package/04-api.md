# 04 — API and document formats

All types: `types/shared.ts` (copy to `packages/shared/src/index.ts`). Every route validates input with zod and returns `ApiError` on failure (HTTP 400 validation, 403 forbidden, 404 not found, 409 version conflict, 422 rejected by rules, 500 unexpected). Auth for the slice: a seeded user chosen at login (cookie with user id); every route checks project role (viewer: read; editor/owner: write).

## 1. Routes

### Projects and users
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/health` | → `{ok, db: 'ok' | 'down', diskUsedPct?}` | No auth; used by the deployment check |
| GET | `/api/me` | → `{user, projects[]}` | |
| GET | `/api/projects/:pid` | → project + members | |

### Datasets (stage 1, uploads are done by hand in the UI or by the seed script)
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/projects/:pid/datasets` | → `Dataset[]` with current version summary | |
| POST | `/api/projects/:pid/datasets` | multipart `{file, name?, transactionType?: SNAPSHOT|APPEND, datasetId?, simulated?}` → `DatasetVersion` | `.csv` or `.csv.gz`, up to `UPLOAD_MAX_MB`. New dataset if `datasetId` absent; otherwise new version. APPEND requires identical columns. Returns once the rows are loaded, with `profileStatus: 'pending'`; the background profile then writes the minimal semantic cards into the bank draft |
| GET | `/api/projects/:pid/jobs?status=` | → `Job[]` | Background jobs (profiles) with progress |
| GET | `/api/datasets/:id/versions` | → `DatasetVersion[]` | |
| GET | `/api/datasets/:id/preview?version=&limit=100&offset=0` | → `{columns, rows, total}` | |
| GET | `/api/datasets/:id/profile?column=` | → `ColumnProfile` (all columns if omitted), or `{status: 'pending' | 'running'}` | From the stored SQL profile |

### Semantics (stage 2)
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/projects/:pid/semantics?version=active|draft|vN` | → `{version, status, counts, summary, limitations}` | Overview: how many cards, enriched terms, relations, open constraints |
| GET | `/api/projects/:pid/semantics/records?version=&kind=&q=&limit=` | → `SemRecord[]` | Browse records |
| POST | `/api/projects/:pid/semantics/browse` | `{query, kind?, limit≤6, version?}` → ranked concepts | EvoOntology `browse_semantics` |
| POST | `/api/projects/:pid/semantics/resolve` | `{mentions≤5, context, version?}` → grounded mappings + constraints + evidence | EvoOntology `resolve_semantics` |
| GET · PUT | `/api/projects/:pid/semantics/workload` | `{goal, questions: WorkloadQuestion[]}` | Seed questions, picked or not |
| PATCH | `/api/projects/:pid/semantics/draft` | `{expectedRevision, ops: SemOp[]}` → `{revision, validation}` | §2 |
| POST | `/api/projects/:pid/semantics/draft/validate` | → `{errors, warnings}` | §5 |
| POST | `/api/projects/:pid/semantics/publish` | `{expectedRevision, summary, limitations[], questionLinks}` → `{version}` | Refuses on errors or on open `block` constraints without `resolution` |
| GET | `/api/projects/:pid/semantics/versions` | → `[{version, status, summary, publishedBy, at}]` | |
| GET | `/api/projects/:pid/semantics/trajectories?limit=` | → trajectories | |

### Workspace (stages 3–4: pipelines + ontology + logic + actions + apps + automations)
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/projects/:pid/workspace?version=latest|draft|N` | → `{version, doc}` or `{draft:{revision, baseVersion, semVersion, doc, validation}}` | |
| PATCH | `/api/projects/:pid/workspace/draft` | `{expectedRevision, ops: DraftOp[]}` → `{revision, validation}` | §3 |
| POST | `/api/projects/:pid/workspace/draft/validate` | → `{errors: FieldError[], warnings: FieldError[]}` | Also runs data checks (§5) |
| GET | `/api/projects/:pid/workspace/draft/diff` | → `{added[], changed[], removed[]}` each `{kind, apiName, summary}` | Shown on proposal and approval cards |
| POST | `/api/projects/:pid/workspace/draft/pipelines/:apiName/preview` | `{node?, limit≤50}` → `{columns, rows, rowCount, checks, nodeCounts}` | Runs the draft pipeline up to `node` (default: each output) on the full input with `LIMIT`, plus `count(*)` per node |
| POST | `/api/projects/:pid/workspace/draft/logic/test` | `{objectType, apiNames[], primaryKeys?[], limit≤20}` → rows with the derived values | Evaluates draft logic on published objects |
| POST | `/api/projects/:pid/workspace/publish` | `{expectedRevision, message}` → `{version, builds[]}` | Refuses if validation has errors, or with `409 PUBLISH_IN_PROGRESS` while another publish runs; builds pipelines, regenerates `edits.*`, `ont.*`, `logic.*` (`03-data-model.md` §3); evaluates automations; applies the retention rule |
| POST | `/api/projects/:pid/workspace/draft/discard` | → `{revision}` | Resets the draft to the latest published doc |
| GET | `/api/projects/:pid/workspace/history` | → `[{version, semVersion, message, publishedBy, via, at}]` | |
| GET | `/api/projects/:pid/pipelines/builds?limit=` | → `PipelineBuild[]` | |

### Objects
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/projects/:pid/objects/query` | `QueryObjectsRequest` → `QueryObjectsResponse` (reads `logic.*`, so derived properties and rules are queryable and filterable) |
| POST | `/api/projects/:pid/objects/aggregate` | `AggregateRequest` → `AggregateResponse` |
| GET | `/api/projects/:pid/objects/:type/:pk` | → `ObjectRow` (with derived properties) + `links: {apiName, displayName, rows: ObjectRow[]}[]` |
| POST | `/api/projects/:pid/sql` | `{sql}` → `SqlResponse` (read-only role, 5 s, 500 rows; only `SELECT`/`WITH`) |

### Actions
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/projects/:pid/actions/:apiName/run` | `ActionRunRequest` → `ActionRunResponse` (`dryRun: true` = validate only) |
| POST | `/api/projects/:pid/workspace/draft/actions/:apiName/test` | `ActionRunRequest` → `ActionRunResponse` (dry-run of the **draft** definition against published objects) |
| GET | `/api/projects/:pid/actions/log?limit=50&objectType=&primaryKey=` | → action runs |

### Apps, automations, notifications *(stretch)*
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/projects/:pid/apps/:appId` | → `AppDef` from the latest published version |
| GET | `/api/projects/:pid/automations` | → `[{def, enabled, lastEvent}]` |
| POST | `/api/projects/:pid/automations/:id/enable` · `/disable` | → state (enable = gated for the agent) |
| GET | `/api/projects/:pid/automations/:id/events` | → events |
| GET | `/api/notifications?unread=1` · POST `/api/notifications/:id/read` | |

### Agent
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/projects/:pid/agent/sessions` | `{}` → session |
| GET | `/api/agent/sessions/:sid` | → session + items (`AgentItemView[]`) |
| POST | `/api/agent/sessions/:sid/messages` | `{text}` → `202`; loop starts |
| GET | `/api/agent/sessions/:sid/events` | SSE stream of `AgentEvent` |
| POST | `/api/agent/sessions/:sid/approvals/:aid` | `{decision: 'allow'|'reject', editedArgs?, note?}` → `202`; loop resumes |
| POST | `/api/agent/sessions/:sid/answers/:qid` | `{answers: Record<id, string | string[]>}` → `202`; loop resumes |
| POST | `/api/agent/sessions/:sid/stop` | → `200`; loop stops after the current step |

## 2. Semantic draft operations (`SemOp`)

```ts
type SemOp =
  | { op: 'upsertRecord'; kind: 'term' | 'mapping' | 'relation' | 'constraint' | 'evidence'; value: SemRecordBody }
  | { op: 'setLifecycle'; recordId: string; lifecycle: 'active' | 'superseded' | 'proposed' }
  | { op: 'resolveConstraint'; recordId: string; choice: string; note?: string }   // by = current user, at = now
  | { op: 'remove'; recordId: string };
```

`upsertRecord` with an `evidence` whose `query` is set runs the query with the read-only role and stores the result summary; the agent never writes `result` itself.

## 3. Workspace draft operations (`DraftOp`)

Small, entity-level operations (easier for the model than full-document rewrites, and they keep diffs readable):

```ts
type DraftOp =
  | { op: 'upsertPipeline'; value: PipelineDef }
  | { op: 'upsertObjectType'; value: ObjectTypeDef }
  | { op: 'upsertProperty'; objectType: string; value: PropertyDef }
  | { op: 'upsertLinkType'; value: LinkTypeDef }
  | { op: 'upsertLogic'; value: LogicDef }
  | { op: 'upsertActionType'; value: ActionTypeDef }
  | { op: 'upsertApp'; value: AppDef }
  | { op: 'upsertAutomation'; value: AutomationDef }
  | { op: 'remove'; kind: 'pipeline' | 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType' | 'app' | 'automation'; apiName: string; objectType?: string }
  | { op: 'setMetadata'; target: { kind: 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType'; apiName: string; objectType?: string };
      field: 'description' | 'displayName' | 'aliases'; value: string | string[] }
  | { op: 'setSemanticVersion'; version: string };
```

`upsert*` replaces the whole entity with the same `apiName` (or adds it). Every PATCH returns the new revision and the validation result, so the caller always knows whether the draft is publishable.

## 4. Document formats

See `types/shared.ts`. New or changed types for this slice:

| Type | Shape (summary) |
|---|---|
| `PipelineDef` | `{apiName, description, terms?[], nodes: PipelineNode[], outputs: [{apiName, node}], checks: PipelineCheck[]}` |
| `PipelineNode` | `{id, kind, …}` with `kind` ∈ `source {datasetId}` · `filter {input, where: Filter}` · `select {input, columns[]}` · `rename {input, map}` · `cast {input, column, to}` · `derive {input, as, expr: ValueExpr}` · `join {left, right, how: inner|left, on: [{left, right}]}` · `union {inputs[]}` · `aggregate {input, groupBy[], measures: [{as, fn, column?}]}` · `deduplicate {input, keys[], keep: first|last, orderBy?}` |
| `PipelineCheck` | `{output, kind: 'unique' | 'notNull' | 'rowCount', columns?, min?, max?}` |
| `ObjectTypeDef` | as before, with `source: {kind:'dataset', datasetId} | {kind:'pipeline', pipeline, output}` replacing `datasetId`, plus `term?` |
| `LinkTypeDef` | `keys: [{fromProperty, toProperty}]` (one or more) replacing `fromProperty` / `toProperty`, plus `relation?` |
| `LogicDef` | `{apiName, objectType, kind: 'derived' | 'rule', type?, expr?: LogicExpr, condition?: Filter, displayName, description, constraints?[]}` (`03-data-model.md` §7) |
| `ActionTypeDef` | parameters of kind `object` (`objectType`), `value` (`type`, `allowedValues?`); rules `modify {object: param, set: {property: ValueExpr}}` · `create {objectType, values: {property: ValueExpr}}` · `delete {object: param}`; `submissionCriteria: Criterion[]` where a criterion may be `{rule: {objectType, apiName, object: ObjectRefExpr, expect: true|false, afterEdits?: boolean}, message}` |
| `ObjectRefExpr` | a parameter, or `{lookup: {objectType, keys: {property: ValueExpr}}}` (e.g. the target kitchen-day of a lot) |

`afterEdits: true` evaluates the rule **as if the action's edits were applied** (inside the transaction, before commit): this is how *Réaffecter une production* refuses a move that would overload the target kitchen.

Example of the demo's target document: `fixtures/expected-workspace.json`, rewritten for `kumo-mini`.

## 5. Validation (structure + data)

`validate` returns **errors** (block publish) and **warnings** (shown, don't block).

### Semantic bank
| Code | Level | Rule |
|---|---|---|
| `SEM_BAD_REFERENCE` | error | A record points at a missing record, dataset or column |
| `SEM_BAD_VOCABULARY` | error | `relation_type`, constraint type or severity outside the closed lists |
| `SEM_MISSING_FIELD` | error | Required field empty (term definition once `status: enriched`, constraint `trigger_keywords`, evidence query) |
| `SEM_PROCEDURAL_CONTENT` | error | SQL or instructions outside Evidence `query` |
| `SEM_RELATION_KEYS_UNCHECKED` | warning | A relation has `keys` but no Evidence join query |
| `SEM_OPEN_DECISION` | error at publish | A `block` constraint with `options` and no `resolution` |
| `SEM_UNCOVERED_QUESTION` | warning | A picked seed question is linked to no record |

### Workspace
| Code | Level | Rule |
|---|---|---|
| `DUPLICATE_API_NAME` | error | Unique names per kind / per type |
| `BAD_API_NAME` | error | Naming rules of `03-data-model.md` §8 |
| `UNKNOWN_REFERENCE` | error | Referenced dataset, pipeline output, column, type, property, link, logic, action, param or semantic record doesn't exist |
| `MISSING_DESCRIPTION` | error | Object types, properties, links, logic and actions need a non-empty description |
| `PIPELINE_CYCLE` | error | The node graph has a cycle |
| `PIPELINE_SQL_ERROR` | error | The compiled SQL fails on `EXPLAIN` (message gives the node) |
| `PIPELINE_CHECK_FAILED` | error | A check fails on the preview (message gives a count and two examples) |
| `PK_NOT_UNIQUE` / `PK_HAS_NULLS` / `PK_EDITABLE` | error | As before, on the source table (dataset or pipeline preview) |
| `TYPE_MISMATCH` | error | Property type incompatible with its column, a rule's value, a logic expression or a criterion. Compatibility: `now` fits `date` and `timestamp`; `currentUser` fits `string`; integers fit `double`; literals must parse as the target type |
| `LINK_KEY_NOT_UNIQUE` | error | The target key (all `toProperty` columns together) must be unique |
| `LINK_LOW_MATCH` | warning | Less than 90 % of non-null source keys match a target (match rate + unmatched examples) |
| `LOGIC_CYCLE` | error | Derived properties depend on each other in a loop |
| `LOGIC_UNKNOWN_LINK` | error | An aggregate uses a link that doesn't start from the logic's object type |
| `RULE_SETS_READONLY` | error | An action rule sets a non-editable or derived property |
| `CRITERION_UNKNOWN_RULE` | error | A criterion calls a rule that isn't a `rule`-kind logic of that type |
| `MISSING_TERM` | warning | An object type or link has no `term` / `relation` |
| `SEM_VERSION_STALE` | warning | A newer semantic version is active than the draft's `semanticVersion` |
| `UNKNOWN_BLOCK_KIND` | error | App block or effect kind / version not supported |
| `EMPTY_SET` | warning | An app list, rule or automation condition currently matches 0 objects |
| `ALIAS_COLLISION` | warning | Same alias on two different types |

## 6. Pipeline compilation

Each node becomes a CTE named after its id; `source` reads the dataset's **current** version table (pinned in `pipeline_builds.input_versions`); filters and `derive` use the same `Filter` / `ValueExpr` grammar as object sets and logic, compiled with parameterized literals and `ident()`-checked names (no raw SQL in pipeline definitions). Preview = the same SQL with `LIMIT` on the output plus `SELECT count(*)` per node, under the read-only role and a 30 s timeout (`PREVIEW_TIMEOUT_MS`).

## 7. Automation evaluation *(stretch)*

After **every applied action run** and **every publish**: for each enabled automation, compute the primary keys of `condition.set` now (sets may filter on rules: "CuisineJour where `surcharge`"); `entered = now − state.members`; if non-empty, run the effects for each entered object (notify: render templates; runAction: run with `via: 'automation'`), write `automation_events`, then store `members = now`. Enabling initializes `members` without firing. `currentUser` in effects = the user who enabled the automation. An automation's `runAction` can't trigger the same automation again in the same evaluation.
