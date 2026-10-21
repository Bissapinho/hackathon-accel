# 04 — API and document formats

All types: `types/shared.ts` (copy to `packages/shared/src/index.ts`). Every route validates input with zod and returns `ApiError` on failure (HTTP 400 validation, 403 forbidden, 404 not found, 409 version conflict, 422 rejected by rules, 500 unexpected). Auth for the slice: a seeded user chosen at login (cookie with user id); every route checks project role (viewer: read; editor/owner: write).

## 1. Routes

### Projects and users
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/me` | → `{user, projects[]}` | |
| GET | `/api/projects/:pid` | → project + members | |

### Datasets (uploads are done by hand in the UI)
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/projects/:pid/datasets` | → `Dataset[]` with current version summary | |
| POST | `/api/projects/:pid/datasets` | multipart `{file, name?, transactionType?: SNAPSHOT|APPEND, datasetId?}` → `DatasetVersion` | New dataset if `datasetId` absent; otherwise new version. APPEND requires identical columns |
| GET | `/api/datasets/:id/versions` | → `DatasetVersion[]` | |
| GET | `/api/datasets/:id/preview?version=&limit=100&offset=0` | → `{columns, rows, total}` | |
| GET | `/api/datasets/:id/profile?column=` | → `ColumnProfile` (all columns if omitted) | Used by the agent to check keys and values |

### Workspace (ontology + apps + automations)
| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/api/projects/:pid/workspace?version=latest|draft|N` | → `{version, doc}` or `{draft:{revision, baseVersion, doc, validation}}` | |
| PATCH | `/api/projects/:pid/workspace/draft` | `{expectedRevision, ops: DraftOp[]}` → `{revision, validation}` | §2 |
| POST | `/api/projects/:pid/workspace/draft/validate` | → `{errors: FieldError[], warnings: FieldError[]}` | Also runs data checks (§4) |
| GET | `/api/projects/:pid/workspace/draft/diff` | → `{added[], changed[], removed[]}` each `{kind, apiName, summary}` | Shown on proposal and approval cards |
| POST | `/api/projects/:pid/workspace/publish` | `{expectedRevision, message}` → `{version}` | Refuses if validation has errors; regenerates `edits.*` tables and `ont.*` views; evaluates automations (§5) |
| POST | `/api/projects/:pid/workspace/draft/discard` | → `{revision}` | Resets the draft to the latest published doc |
| GET | `/api/projects/:pid/workspace/history` | → `[{version, message, publishedBy, via, at}]` | |

### Objects
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/projects/:pid/objects/query` | `QueryObjectsRequest` → `QueryObjectsResponse` |
| POST | `/api/projects/:pid/objects/aggregate` | `AggregateRequest` → `AggregateResponse` |
| GET | `/api/projects/:pid/objects/:type/:pk` | → `ObjectRow` + `links: {apiName, displayName, rows: ObjectRow[]}[]` |
| POST | `/api/projects/:pid/sql` | `{sql}` → `SqlResponse` (read-only role, 5 s, 500 rows; only `SELECT`/`WITH`) |

### Actions
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/projects/:pid/actions/:apiName/run` | `ActionRunRequest` → `ActionRunResponse` (`dryRun: true` = validate only) |
| GET | `/api/projects/:pid/actions/log?limit=50` | → action runs |

### Apps, automations, notifications
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
| POST | `/api/agent/sessions/:sid/answers/:qid` | `{answers: Record<id, string>}` → `202`; loop resumes |
| POST | `/api/agent/sessions/:sid/stop` | → `200`; loop stops after the current step |

## 2. Draft operations (`DraftOp`)

Small, entity-level operations (easier for the model than full-document rewrites, and they keep diffs readable):

```ts
type DraftOp =
  | { op: 'upsertObjectType'; value: ObjectTypeDef }
  | { op: 'upsertProperty'; objectType: string; value: PropertyDef }
  | { op: 'upsertLinkType'; value: LinkTypeDef }
  | { op: 'upsertActionType'; value: ActionTypeDef }
  | { op: 'upsertApp'; value: AppDef }
  | { op: 'upsertAutomation'; value: AutomationDef }
  | { op: 'remove'; kind: 'objectType' | 'property' | 'linkType' | 'actionType' | 'app' | 'automation'; apiName: string; objectType?: string }
  | { op: 'setMetadata'; target: { kind: 'objectType' | 'property' | 'linkType' | 'actionType'; apiName: string; objectType?: string };
      field: 'description' | 'displayName' | 'aliases'; value: string | string[] };
```

`upsert*` replaces the whole entity with the same `apiName` (or adds it). Every PATCH returns the new revision and the validation result, so the caller always knows whether the draft is publishable.

## 3. Document formats

See `types/shared.ts`: `WorkspaceDoc`, `ObjectTypeDef`, `PropertyDef`, `LinkTypeDef`, `ActionTypeDef` (`ActionParam`, `ValueExpr`, `ActionRule`, `Criterion`), `ObjectSet` / `Filter`, `AppDef` (`AppBlock`), `AutomationDef`. Example of the demo's target document: `fixtures/expected-workspace.json`.

## 4. Validation (structure + data)

`validate` returns **errors** (block publish) and **warnings** (shown, don't block). Codes:

| Code | Level | Rule |
|---|---|---|
| `DUPLICATE_API_NAME` | error | Unique names per kind / per type |
| `BAD_API_NAME` | error | Naming rules of `03-data-model.md` §6 |
| `UNKNOWN_REFERENCE` | error | Referenced dataset, column, type, property, link, action, param doesn't exist |
| `MISSING_DESCRIPTION` | error | Object types, properties, links and actions need a non-empty description |
| `PK_NOT_UNIQUE` | error | Primary key column has duplicates in the current dataset version (message gives a count and two examples) |
| `PK_HAS_NULLS` | error | Primary key column has nulls |
| `PK_EDITABLE` | error | Primary key can't be editable |
| `TYPE_MISMATCH` | error | Property type incompatible with its column, a rule's value, or a criterion. Compatibility: `now` fits `date` (today, server time zone UTC) and `timestamp`; `currentUser` fits `string` (display name); integers fit `double`; `literal` values must parse as the target type |
| `LINK_KEY_NOT_UNIQUE` | error | `toProperty` must be unique on the target |
| `LINK_LOW_MATCH` | warning | Less than 90 % of non-null `fromProperty` values match a target (message gives the match rate and examples of unmatched values) |
| `RULE_SETS_READONLY` | error | A rule sets a non-editable property |
| `UNKNOWN_BLOCK_KIND` | error | App block or effect kind / version not supported |
| `EMPTY_SET` | warning | An app list or automation condition currently matches 0 objects |
| `ALIAS_COLLISION` | warning | Same alias on two different types |

## 5. Automation evaluation

After **every applied action run** and **every publish**: for each enabled automation, compute the primary keys of `condition.set` now; `entered = now − state.members`; if `entered` is non-empty, run the effects for each entered object (notify: render templates; runAction: run with `via: 'automation'`), write `automation_events`, then store `members = now`. Enabling an automation initializes `members` to the current set **without firing** (only future entries fire). In effects, `currentUser` means **the user who enabled the automation** (stored in `automation_state.enabled_by`); templates `{{object.<property>}}` use property API names of the triggering object. Guard: an automation's `runAction` effect can't trigger the same automation again within the same evaluation (no loops).
