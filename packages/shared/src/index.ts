// packages/shared/src/index.ts — copy of build-package/types/shared.ts (frozen contract, 09 §6.2): types shared by the server, the agent tools and the front team.
// Server-side validation uses zod schemas that mirror these types (apps/server/src/modules/*/schemas.ts).

// ───────────────────────────── Common ─────────────────────────────

export type ApiError = {
  code: string;            // e.g. VALIDATION_FAILED, NOT_FOUND, VERSION_CONFLICT, FORBIDDEN, SQL_REJECTED, PUBLISH_IN_PROGRESS
  message: string;         // plain language
  hint?: string;           // what to do next
  details?: FieldError[];
};
export type FieldError = { path: string; code: string; message: string }; // path like "objectTypes[0].primaryKey"

export type ObjectRef = { objectType: string; primaryKey: string };

export type BaseType = 'string' | 'integer' | 'double' | 'boolean' | 'date' | 'timestamp';

export type Health = { ok: boolean; db: 'ok' | 'down'; diskUsedPct?: number };

// ───────────────────────────── Datasets (stage 1) ─────────────────────────────

export type ColumnInfo = {
  name: string;            // header as in the file
  sqlName: string;         // snake_case column name in the dataset table
  type: BaseType;
  nullable: boolean;
  sample: (string | number | boolean | null)[]; // up to 5 values
};

export type ProfileStatus = 'pending' | 'running' | 'done' | 'failed';

export type DatasetVersion = {
  datasetId: string; version: number; transactionType: 'SNAPSHOT' | 'APPEND';
  rowCount: number; columns: ColumnInfo[];
  parseErrors: { row: number; column: string; value: string; expected: BaseType }[];
  profileStatus: ProfileStatus;
  droppedAt?: string;      // table removed by the retention rule (03-data-model.md §4)
  createdAt: string; createdBy: string;
};

export type Dataset = {
  id: string; projectId: string; name: string; description: string;
  currentVersion: number | null;
  simulated: boolean;      // generated data (e.g. the synthetic capacity tables)
};

export type ColumnProfile = {
  column: string; type: BaseType; rowCount: number; nullCount: number; distinctCount: number;
  isUnique: boolean;                                   // distinct non-null == non-null count
  topValues: { value: string | null; count: number }[]; // up to 10
  patterns?: { pattern: string; count: number }[];     // strings: common prefixes, e.g. "SO-…", "RMA-…"
  min?: string | number; max?: string | number;
};

export type MatchRate = {                              // profile_columns with matchAgainst
  keys: { fromColumn: string; toColumn: string }[];    // one or more columns (composite keys)
  nonNull: number; matched: number; rate: number; unmatchedExamples: string[];
};

export type ProfileResponse = { status: ProfileStatus; profiles?: ColumnProfile[] };

export type Job = {
  id: string; kind: 'profile'; target: string /* dataset version id */;
  status: 'queued' | 'running' | 'done' | 'failed'; progress: number /* 0..1 */;
  error?: string; createdAt: string; finishedAt?: string;
};

// ───────────────────────────── Semantic bank (stage 2) ─────────────────────────────
// The five EvoOntology record types. Field names follow EvoOntology's ontology-schema.md (snake_case);
// fields marked "ours" are our additions (03-data-model.md §6).

export type SemKind = 'term' | 'mapping' | 'relation' | 'constraint' | 'evidence';
export type SemLifecycle = 'active' | 'superseded' | 'proposed';

export type SemTerm = {
  id: string;              // T_commande
  name: string;
  type: 'concept' | 'metric' | 'entity' | 'dimension' | 'category';
  definition: string;      // "to be defined" while status = 'card'
  scope: string;
  aliases: string[];
  evidence: string[];      // evidence ids
  status: 'card' | 'enriched'; // ours: 'card' = minimal card written at upload
};

export type SemMapping = {
  id: string;
  term_id: string;
  database_source: string; // dataset id (ours: the dataset, not a database)
  table: string;           // dataset name
  column: string;          // column sqlName
  semantic_filter?: string;        // in words, not SQL
  aggregation_semantics?: string;  // in words, e.g. "sum of delivered quantities"
  grain?: string;          // e.g. "one row per order line"
  validation?: string;
  evidence: string[];
};

export type RelationType = 'association' | 'hierarchy' | 'composition' | 'equivalence' | 'derivation';

export type SemRelation = {
  id: string;              // R_commande_client
  source: string;          // term id
  relation_type: RelationType;
  target: string;          // term id
  connection_condition?: string;   // in words
  description: string;
  keys?: { fromColumn: string; toColumn: string }[]; // ours: checked by an evidence join query; used to propose links
  evidence: string[];
};

export type ConstraintType = 'enum_semantics' | 'data_quality' | 'business_rule' | 'unit' | 'scope';

export type SemConstraint = {
  id: string;              // C_rma_negatif
  target: string;          // term or mapping id
  constraint_type: ConstraintType;
  trigger_keywords: string[];
  severity: 'block' | 'warning' | 'info';
  scope?: string;
  confidence: number;      // 0..1
  description: string;
  options?: string[];      // ours: readings the user can choose from (an open decision)
  resolution?: { choice: string; note?: string; by: string; at: string }; // ours
  evidence: string[];
};

export type SemEvidence = {
  id: string;
  source: string;          // dataset or pipeline output
  query?: string;          // read-only SQL, run by the server
  result?: string;         // summary written by the server, <= 2 KB
  validation_method: string;
  timestamp: string;
};

export type SemRecord =
  | { kind: 'term'; lifecycle: SemLifecycle; body: SemTerm }
  | { kind: 'mapping'; lifecycle: SemLifecycle; body: SemMapping }
  | { kind: 'relation'; lifecycle: SemLifecycle; body: SemRelation }
  | { kind: 'constraint'; lifecycle: SemLifecycle; body: SemConstraint }
  | { kind: 'evidence'; lifecycle: SemLifecycle; body: SemEvidence };

export type SemOp =
  | { op: 'upsertRecord'; record: Omit<SemRecord, 'lifecycle'> & { lifecycle?: SemLifecycle } }
  | { op: 'setLifecycle'; recordId: string; lifecycle: SemLifecycle }
  | { op: 'resolveConstraint'; recordId: string; choice: string; note?: string } // by = current user, at = now
  | { op: 'remove'; recordId: string };

export type SemVersionInfo = {
  version: string;         // 'draft' | 'v0' | 'v1' …
  status: 'draft' | 'active' | 'superseded';
  revision?: number;       // draft only
  summary: string;
  limitations: string[];
  questionLinks: Record<string /* question id */, string[] /* record ids */>;
  counts: { terms: number; enriched: number; mappings: number; relations: number; constraints: number;
            openDecisions: number; evidence: number };
  publishedBy?: string; publishedAt?: string;
};

export type WorkloadQuestion = {
  id: string; text: string; useCase?: string;
  source: 'proposed' | 'user'; picked: boolean;
};
export type Workload = { goal: string; questions: WorkloadQuestion[] };

export type BrowseResult = { id: string; kind: SemKind; name: string; summary: string; score: number; why: string }[];
export type ResolveResult = {
  version: string;
  mentions: {
    mention: string;
    term?: SemTerm;
    mappings: SemMapping[];
    constraints: SemConstraint[]; // decided readings carry `resolution`
    evidence: SemEvidence[];
    ambiguous?: { candidates: { id: string; name: string; why: string }[] };
  }[];
};

export type Trajectory = {
  id: string; sessionId: string; question: string; semVersion: string;
  semanticCalls: { tool: 'browse_semantics' | 'resolve_semantics'; input: unknown; result: unknown }[];
  toolCalls: { tool: string; input: unknown; resultSummary: string }[]; // results truncated ~2 KB
  answer: string; status: 'answered' | 'failed' | 'abandoned'; createdAt: string;
};

// ───────────────────────────── Workspace document (stages 3–4) ─────────────────────────────
// Everything the agent builds on top of the bank lives in ONE document per project (draft + published versions).

export type WorkspaceDoc = {
  semanticVersion: string;         // the bank version this document was built on
  pipelines: PipelineDef[];
  objectTypes: ObjectTypeDef[];
  linkTypes: LinkTypeDef[];
  logic: LogicDef[];
  actionTypes: ActionTypeDef[];
  apps: AppDef[];                  // stretch
  automations: AutomationDef[];    // stretch
};

// ── Pipelines ──

export type PipelineDef = {
  apiName: string;                 // snake_case, e.g. "commandes"
  description: string;
  terms?: string[];                // semantic terms it serves
  nodes: PipelineNode[];
  outputs: { apiName: string; node: string }[];  // materialized as data.pl_<pipeline>_<output>_v<n>
  checks: PipelineCheck[];
};

export type PipelineNode =
  | { id: string; kind: 'source'; datasetId: string }
  | { id: string; kind: 'filter'; input: string; where: Filter }          // Filter.property = column sqlName here
  | { id: string; kind: 'select'; input: string; columns: string[] }
  | { id: string; kind: 'rename'; input: string; map: Record<string, string> }
  | { id: string; kind: 'cast'; input: string; column: string; to: BaseType }
  | { id: string; kind: 'derive'; input: string; as: string; expr: LogicExpr } // column refs use { property: <column> }
  | { id: string; kind: 'join'; left: string; right: string; how: 'inner' | 'left';
      on: { left: string; right: string }[]; rightPrefix?: string }
  | { id: string; kind: 'union'; inputs: string[] }
  | { id: string; kind: 'aggregate'; input: string; groupBy: string[];
      measures: { as: string; fn: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max'; column?: string }[] }
  | { id: string; kind: 'deduplicate'; input: string; keys: string[]; keep: 'first' | 'last';
      orderBy?: { column: string; direction: 'asc' | 'desc' }[] };

export type PipelineCheck = {
  output: string;
  kind: 'unique' | 'notNull' | 'rowCount';
  columns?: string[];
  min?: number; max?: number;      // rowCount
};

export type PipelinePreview = {
  columns: { name: string; type: BaseType }[];
  rows: unknown[][];               // <= 50
  rowCount: number;                // of the previewed node
  nodeCounts: Record<string, number>;
  checks: { check: PipelineCheck; ok: boolean; detail: string }[];
  ms: number;
};

export type PipelineBuild = {
  pipeline: string; output: string; workspaceVersion: number; tableName: string;
  rowCount: number; inputVersions: Record<string /* datasetId */, number>;
  checks: { check: PipelineCheck; ok: boolean; detail: string }[];
  status: 'built' | 'upToDate' | 'failed'; durationMs: number; createdAt: string;
};

// ── Ontology ──

export type ObjectTypeDef = {
  apiName: string;                 // PascalCase, unique
  displayName: string;
  pluralDisplayName: string;
  description: string;             // required, plain language, 1–3 sentences (from the Term when there is one)
  aliases: string[];
  icon?: string;
  term?: string;                   // semantic term it represents
  source: { kind: 'dataset'; datasetId: string } | { kind: 'pipeline'; pipeline: string; output: string };
  primaryKey: string;              // property apiName; must be unique + non-null in the source
  titleProperty: string;
  properties: PropertyDef[];
  status: 'experimental' | 'active' | 'deprecated';
};

export type PropertyDef = {
  apiName: string;                 // camelCase
  column?: string;                 // source column sqlName; omit for edit-only properties
  type: BaseType;
  displayName: string;
  description: string;             // required
  aliases: string[];
  editable: boolean;               // may actions change it? (primary key: never)
  allowedValues?: string[];        // from enum_semantics constraints / the profile
  term?: string;
};

export type LinkTypeDef = {
  apiName: string;                 // camelCase, unique per "from" type, e.g. "client"
  from: string;                    // object type holding the key
  to: string;
  cardinality: 'many-to-one' | 'one-to-one';
  keys: { fromProperty: string; toProperty: string }[]; // one or more (composite keys); "to" side must be unique
  relation?: string;               // semantic relation it comes from
  displayName: string;             // "Client"
  reverseApiName: string;          // "commandes"
  reverseDisplayName: string;      // "Commandes"
  description: string;
};

// ── Logic (03-data-model.md §7) ──

export type LogicExpr =
  | { property: string }                                   // property of the object (or column in a pipeline)
  | { literal: string | number | boolean | null }
  | { now: true } | { today: true }
  | { add: [LogicExpr, LogicExpr] } | { sub: [LogicExpr, LogicExpr] }
  | { mul: [LogicExpr, LogicExpr] } | { div: [LogicExpr, LogicExpr] } // div = a / NULLIF(b, 0)
  | { coalesce: LogicExpr[] }
  | { case: { when: Filter; then: LogicExpr }[]; else?: LogicExpr }
  | { aggregate: { link: string; fn: 'count' | 'sum' | 'avg' | 'min' | 'max'; property?: string; where?: Filter } };

export type LogicDef = {
  apiName: string;                 // camelCase, unique per object type
  objectType: string;
  displayName: string;
  description: string;
  constraints?: string[];          // semantic constraints it implements
} & (
  | { kind: 'derived'; type: BaseType; expr: LogicExpr }   // a read-only computed property
  | { kind: 'rule'; condition: Filter }                    // a named boolean condition
);

// ── Actions ──

export type ActionTypeDef = {
  apiName: string;                 // PascalCase verb+noun
  displayName: string;
  description: string;             // for people
  agentDescription: string;        // for agents: when to use it, what it changes, preconditions
  constraints?: string[];          // semantic constraints it enforces
  parameters: ActionParam[];
  rules: ActionRule[];
  submissionCriteria: Criterion[]; // all must pass
  successMessage: string;          // may use {{param}} or {{param.property}}
};

export type ActionParam = {
  id: string;                      // camelCase
  displayName: string;
  description: string;
  required: boolean;
} & (
  | { kind: 'object'; objectType: string }
  | { kind: 'value'; type: BaseType; allowedValues?: string[]; default?: ValueExpr }
);

export type ValueExpr =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'param'; param: string }                          // a value parameter
  | { kind: 'paramProperty'; param: string; property: string } // property (or derived property) of an object parameter
  | { kind: 'now' }
  | { kind: 'currentUser' };                                   // display name of the user running it

// An object reached from the parameters: a parameter itself, or a lookup by key values
// (e.g. the target kitchen-day of a production lot: CuisineJour where lieu = target, date = lot.date).
export type ObjectRefExpr =
  | { kind: 'param'; param: string }
  | { kind: 'lookup'; objectType: string; keys: Record<string /* property */, ValueExpr> };

export type ActionRule =
  | { kind: 'modifyObject'; object: string /* object param id */; set: Record<string /* property */, ValueExpr> }
  | { kind: 'createObject'; objectType: string; primaryKey: ValueExpr; set: Record<string, ValueExpr> }
  | { kind: 'deleteObject'; object: string };

export type Criterion =
  | { kind: 'compare'; left: ValueExpr;
      op: 'eq' | 'neq' | 'in' | 'notIn' | 'isNull' | 'notNull' | 'gt' | 'gte' | 'lt' | 'lte';
      right?: ValueExpr | { kind: 'list'; values: (string | number)[] };
      failureMessage: string }     // plain language
  | { kind: 'rule'; objectType: string; rule: string /* rule-kind logic apiName */; object: ObjectRefExpr;
      expect: boolean;
      afterEdits: boolean;         // true = evaluate as if this action's edits were applied (inside the transaction)
      failureMessage: string };    // may use {{object.property}}, e.g. "{{object.lieuProduction}} would be over capacity"

// ── Object sets (shared query language: objects API, logic rules, pipelines, apps, automations, agent) ──

export type ObjectSet =
  | { kind: 'all'; objectType: string }
  | { kind: 'filter'; of: ObjectSet; where: Filter }
  | { kind: 'linked'; of: ObjectSet; link: string }            // follow a link (or reverse link) apiName
  | { kind: 'refs'; refs: ObjectRef[] };

export type CompareOp = 'eq' | 'neq' | 'in' | 'notIn' | 'isNull' | 'notNull' | 'gt' | 'gte' | 'lt' | 'lte' | 'startsWith';

export type Filter =
  | { kind: 'and' | 'or'; filters: Filter[] }
  | { kind: 'not'; filter: Filter }
  | { kind: 'cmp'; property: string; op: CompareOp; value?: string | number | boolean | (string | number)[] }
  | { kind: 'cmpProps'; left: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; right: string } // two properties
  | { kind: 'rule'; rule: string }                             // a rule-kind logic of the object type is true
  | { kind: 'search'; text: string };                          // case-insensitive contains on string properties

// ── Apps (stretch; rendered by the front team's generic renderer) ──

export type AppDef = {
  id: string;                      // kebab-case, unique
  name: string;
  description: string;
  pages: AppPage[];
};

export type AppPage = { id: string; title: string; blocks: AppBlock[] };

export type AppBlock =
  | { kind: 'metric'; version: 1; label: string; set: ObjectSet; aggregate: Aggregate }
  | { kind: 'objectList'; version: 1; id: string; title: string; set: ObjectSet;
      columns: string[]; sort: { property: string; direction: 'asc' | 'desc'; order?: string[] }[];
      filters: { property: string; control: 'select' | 'multiSelect' | 'search' }[];
      pageSize: number }
  | { kind: 'objectDetail'; version: 1; source: string /* objectList id */;
      properties: string[]; links: string[]; actions: string[] }
  | { kind: 'chart'; version: 1; title: string; set: ObjectSet; groupBy: string; aggregate: Aggregate; chart: 'bar' | 'pie' }
  | { kind: 'markdown'; version: 1; text: string };

export type Aggregate = { fn: 'count' } | { fn: 'sum' | 'avg' | 'min' | 'max'; property: string };

// ── Automations (stretch) ──

export type AutomationDef = {
  id: string;                      // kebab-case
  name: string;
  description: string;
  condition: { kind: 'objectsEnterSet'; set: ObjectSet };      // fires for objects that newly match
  effects: AutomationEffect[];
};

export type AutomationEffect =
  | { kind: 'notify'; recipients: ({ kind: 'user'; userId: string } | { kind: 'currentUser' })[];
      title: string; body: string /* may use {{object.property}} */ }
  | { kind: 'runAction'; action: string; params: Record<string, ValueExpr | { kind: 'triggerObject' }> };

// ── Draft operations (PATCH /workspace/draft, agent tool edit_draft) ──

export type EntityKind = 'pipeline' | 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType' | 'app' | 'automation';

export type DraftOp =
  | { op: 'upsertPipeline'; value: PipelineDef }
  | { op: 'upsertObjectType'; value: ObjectTypeDef }
  | { op: 'upsertProperty'; objectType: string; value: PropertyDef }
  | { op: 'upsertLinkType'; value: LinkTypeDef }
  | { op: 'upsertLogic'; value: LogicDef }
  | { op: 'upsertActionType'; value: ActionTypeDef }
  | { op: 'upsertApp'; value: AppDef }
  | { op: 'upsertAutomation'; value: AutomationDef }
  | { op: 'remove'; kind: EntityKind; apiName: string; objectType?: string }
  | { op: 'setMetadata';
      target: { kind: 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType'; apiName: string; objectType?: string };
      field: 'description' | 'displayName' | 'aliases'; value: string | string[] }
  | { op: 'setSemanticVersion'; version: string };

export type Validation = { errors: FieldError[]; warnings: FieldError[] };

// ───────────────────────────── Objects API ─────────────────────────────

export type ObjectRow = {
  ref: ObjectRef; title: string;
  properties: Record<string, unknown>;  // includes derived properties
  rules: Record<string, boolean>;       // rule-kind logic values
};
export type QueryObjectsRequest = { set: ObjectSet; select?: string[]; orderBy?: { property: string; direction: 'asc' | 'desc' }[];
  pageSize?: number; pageToken?: string };
export type QueryObjectsResponse = { rows: ObjectRow[]; total: number; nextPageToken?: string };
export type AggregateRequest = { set: ObjectSet; groupBy?: string[]; aggregate: Aggregate[] };
export type AggregateResponse = { groups: { keys: Record<string, unknown>; values: number[] }[] };
export type SqlResponse = { columns: { name: string; type: string }[]; rows: unknown[][]; truncated: boolean; ms: number };
export type LogicTestRequest = { objectType: string; apiNames: string[]; primaryKeys?: string[]; limit?: number };
export type LogicTestResponse = { rows: { ref: ObjectRef; values: Record<string, unknown> }[]; errors: FieldError[] };

// ───────────────────────────── Actions API ─────────────────────────────

export type ActionRunRequest = { params: Record<string, unknown /* ObjectRef for object params */>; dryRun?: boolean };
export type ActionRunResponse = {
  runId: string; status: 'applied' | 'valid' | 'rejected' | 'failed';
  errors: FieldError[];
  edits: { ref: ObjectRef; op: 'modify' | 'create' | 'delete'; before: Record<string, unknown>; after: Record<string, unknown> }[];
  message: string;                 // rendered successMessage or the first failure message
};

// ───────────────────────────── Agent (SSE events to the front) ─────────────────────────────

export type AgentMode = 'router' | 'explore' | 'semantics' | 'build';
export type AgentStatus = 'running' | 'idle' | 'awaiting_approval' | 'awaiting_answer' | 'error';

export type AgentEvent =
  | { type: 'status'; status: AgentStatus; mode: AgentMode }
  | { type: 'item'; item: AgentItemView }
  | { type: 'delta'; seq: number; text: string }               // streamed assistant text
  | { type: 'thinking'; seq: number; summary: string }         // streamed thinking summary ("Working…" line)
  | { type: 'progress'; operation: 'publish' | 'upload' | 'profile'; step: string; done: number; total?: number }
  | { type: 'tokens'; used: number; budget: number };

export type AgentItemView =
  | { seq: number; kind: 'user_message'; text: string }
  | { seq: number; kind: 'assistant_message'; text: string; blocks: ChatBlock[] }
  | { seq: number; kind: 'tool_call'; tool: string; title: string; why: string; args: unknown; risk: ToolRisk }
  | { seq: number; kind: 'tool_results'; results: { tool: string; callSeq: number; ok: boolean; summary: string; details?: unknown }[] }
  | { seq: number; kind: 'approval_request'; approvalId: string; tool: string; summary: string; args: unknown;
      diff?: { added: DiffEntry[]; changed: DiffEntry[]; removed: DiffEntry[] }; editableFields?: string[] }
  | { seq: number; kind: 'approval_decision'; approvalId: string; decision: 'allowed' | 'rejected'; note?: string }
  | { seq: number; kind: 'question'; questionId: string; questions: ClarifyingQuestion[] }
  | { seq: number; kind: 'answer'; questionId: string; answers: Record<string, string | string[]> }
  | { seq: number; kind: 'mode_change'; from: AgentMode; to: AgentMode }
  | { seq: number; kind: 'note'; text: string };

export type DiffEntry = { kind: EntityKind | SemKind; apiName: string; summary: string };

export type ToolRisk = 'meta' | 'read' | 'bankDraft' | 'draft' | 'gated';
export type ClarifyingQuestion = {
  id: string; text: string;
  choices?: string[];
  multiple?: boolean;              // checkboxes (seed questions)
  allowFreeText: boolean;
};

export type PlanStep = { text: string; status: 'todo' | 'doing' | 'done' | 'skipped';
  stage: 'ingest' | 'semantics' | 'ontology' | 'logic' };

// Rich blocks the agent can put in its messages (rendered by the front)
export type ChatBlock =
  | { kind: 'plan'; steps: PlanStep[] }
  | { kind: 'proposal'; rows: { item: string; whatItDoes: string; rows?: number }[]; caveats: string[] }
  | { kind: 'verification'; checks: { label: string; ok: boolean; detail: string }[] }
  | { kind: 'definition'; termId: string; name: string; definition: string; evidence: { what: string; result: string }[] }
  | { kind: 'decision'; constraintId: string; question: string; choice: string }
  | { kind: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | { kind: 'barChart'; x: string; y: string; data: Record<string, string | number>[] }
  | { kind: 'objectLink'; ref: ObjectRef; label: string }
  | { kind: 'appLink'; appId: string; label: string };
