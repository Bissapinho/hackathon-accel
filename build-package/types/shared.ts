// packages/shared/src/index.ts — types shared by server, agent tools and web.
// Server-side validation uses zod schemas that mirror these types (apps/server/src/modules/*/schemas.ts).

// ───────────────────────────── Common ─────────────────────────────

export type ApiError = {
  code: string;            // e.g. VALIDATION_FAILED, NOT_FOUND, VERSION_CONFLICT, FORBIDDEN, SQL_REJECTED
  message: string;         // plain language
  hint?: string;           // what to do next
  details?: FieldError[];
};
export type FieldError = { path: string; code: string; message: string }; // path like "objectTypes[0].primaryKey"

export type ObjectRef = { objectType: string; primaryKey: string };

export type BaseType = 'string' | 'integer' | 'double' | 'boolean' | 'date' | 'timestamp';

// ───────────────────────────── Datasets ─────────────────────────────

export type ColumnInfo = {
  name: string;            // header as in the file
  sqlName: string;         // snake_case column name in the dataset table
  type: BaseType;
  nullable: boolean;
  distinctEstimate: number;
  sample: (string | number | boolean | null)[]; // up to 5 values
};

export type DatasetVersion = {
  datasetId: string; version: number; transactionType: 'SNAPSHOT' | 'APPEND';
  rowCount: number; columns: ColumnInfo[];
  parseErrors: { row: number; column: string; value: string; expected: BaseType }[];
  createdAt: string; createdBy: string;
};

export type Dataset = { id: string; projectId: string; name: string; description: string; currentVersion: number | null };

export type ColumnProfile = {
  column: string; type: BaseType; rowCount: number; nullCount: number; distinctCount: number;
  isUnique: boolean;                                   // distinct non-null == non-null count
  topValues: { value: string | null; count: number }[]; // up to 20
  min?: string | number; max?: string | number;
};

// ───────────────────────────── Workspace document ─────────────────────────────
// Everything the agent builds lives in ONE document per project (draft + published versions).

export type WorkspaceDoc = {
  objectTypes: ObjectTypeDef[];
  linkTypes: LinkTypeDef[];
  actionTypes: ActionTypeDef[];
  apps: AppDef[];
  automations: AutomationDef[];
};

export type ObjectTypeDef = {
  apiName: string;                 // PascalCase, unique
  displayName: string;
  pluralDisplayName: string;
  description: string;             // required, plain language, 1–3 sentences
  aliases: string[];               // synonyms users may say ("issue", "case")
  icon?: string;                   // name from the UI icon set
  datasetId: string;               // backing dataset (current version is used)
  primaryKey: string;              // property apiName; must be unique + non-null in the data
  titleProperty: string;           // property apiName shown as the object's name
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
  allowedValues?: string[];        // optional enum for strings (drives filters and validation)
};

export type LinkTypeDef = {
  apiName: string;                 // camelCase, unique per "from" type, e.g. "assignedTo"
  from: string;                    // object type apiName (the side holding the foreign key)
  to: string;
  cardinality: 'many-to-one' | 'one-to-one';
  fromProperty: string;            // property on "from" holding the key
  toProperty: string;              // property on "to" it matches (its primary key or a unique property)
  displayName: string;             // "Assigned to"
  reverseApiName: string;          // "assignedTickets"
  reverseDisplayName: string;      // "Assigned tickets"
  description: string;
};

// ── Actions ──

export type ActionTypeDef = {
  apiName: string;                 // PascalCase verb+noun
  displayName: string;
  description: string;             // for people
  agentDescription: string;        // for agents: when to use it, what it changes, preconditions
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
  | { kind: 'paramProperty'; param: string; property: string } // property of an object parameter
  | { kind: 'now' }
  | { kind: 'currentUser' };                                   // display name of the user running it

export type ActionRule =
  | { kind: 'modifyObject'; object: string /* object param id */; set: Record<string /* property */, ValueExpr> }
  | { kind: 'createObject'; objectType: string; primaryKey: ValueExpr; set: Record<string, ValueExpr> }
  | { kind: 'deleteObject'; object: string };

export type Criterion = {
  left: ValueExpr;
  op: 'eq' | 'neq' | 'in' | 'notIn' | 'isNull' | 'notNull' | 'gt' | 'gte' | 'lt' | 'lte';
  right?: ValueExpr | { kind: 'list'; values: (string | number)[] };
  failureMessage: string;          // plain language: "Only open tickets can be resolved."
};

// ── Object sets (shared query language: objects API, apps, automations, agent) ──

export type ObjectSet =
  | { kind: 'all'; objectType: string }
  | { kind: 'filter'; of: ObjectSet; where: Filter }
  | { kind: 'linked'; of: ObjectSet; link: string }            // follow a link (or reverse link) apiName
  | { kind: 'refs'; refs: ObjectRef[] };

export type Filter =
  | { kind: 'and' | 'or'; filters: Filter[] }
  | { kind: 'not'; filter: Filter }
  | { kind: 'cmp'; property: string; op: Criterion['op']; value?: string | number | boolean | (string | number)[] }
  | { kind: 'search'; text: string };                          // case-insensitive contains on string properties

// ── Apps (rendered by one generic renderer) ──

export type AppDef = {
  id: string;                      // kebab-case, unique
  name: string;
  description: string;
  pages: AppPage[];                // slice: one page is enough
};

export type AppPage = { id: string; title: string; blocks: AppBlock[] };

export type AppBlock =
  | { kind: 'metric'; version: 1; label: string; set: ObjectSet; aggregate: Aggregate }
  | { kind: 'objectList'; version: 1; id: string; title: string; set: ObjectSet;
      columns: string[]; sort: { property: string; direction: 'asc' | 'desc'; order?: string[] }[];
      filters: { property: string; control: 'select' | 'multiSelect' | 'search' }[];
      pageSize: number }
  | { kind: 'objectDetail'; version: 1; source: string /* objectList id: shows the selected row */;
      properties: string[]; links: string[]; actions: string[] /* action apiNames; first object param = selected */ }
  | { kind: 'chart'; version: 1; title: string; set: ObjectSet; groupBy: string; aggregate: Aggregate; chart: 'bar' | 'pie' }
  | { kind: 'markdown'; version: 1; text: string };

export type Aggregate = { fn: 'count' } | { fn: 'sum' | 'avg' | 'min' | 'max'; property: string };

// ── Automations ──

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

export type EntityKind = 'objectType' | 'property' | 'linkType' | 'actionType' | 'app' | 'automation';

export type DraftOp =
  | { op: 'upsertObjectType'; value: ObjectTypeDef }
  | { op: 'upsertProperty'; objectType: string; value: PropertyDef }
  | { op: 'upsertLinkType'; value: LinkTypeDef }
  | { op: 'upsertActionType'; value: ActionTypeDef }
  | { op: 'upsertApp'; value: AppDef }
  | { op: 'upsertAutomation'; value: AutomationDef }
  | { op: 'remove'; kind: EntityKind; apiName: string; objectType?: string }
  | { op: 'setMetadata';
      target: { kind: 'objectType' | 'property' | 'linkType' | 'actionType'; apiName: string; objectType?: string };
      field: 'description' | 'displayName' | 'aliases'; value: string | string[] };

// ───────────────────────────── Objects API ─────────────────────────────

export type ObjectRow = { ref: ObjectRef; title: string; properties: Record<string, unknown> };
export type QueryObjectsRequest = { set: ObjectSet; select?: string[]; orderBy?: { property: string; direction: 'asc' | 'desc' }[];
  pageSize?: number; pageToken?: string };
export type QueryObjectsResponse = { rows: ObjectRow[]; total: number; nextPageToken?: string };
export type AggregateRequest = { set: ObjectSet; groupBy?: string[]; aggregate: Aggregate[] };
export type AggregateResponse = { groups: { keys: Record<string, unknown>; values: number[] }[] };
export type SqlResponse = { columns: { name: string; type: string }[]; rows: unknown[][]; truncated: boolean; ms: number };

// ───────────────────────────── Actions API ─────────────────────────────

export type ActionRunRequest = { params: Record<string, unknown /* ObjectRef for object params */>; dryRun?: boolean };
export type ActionRunResponse = {
  runId: string; status: 'applied' | 'valid' | 'rejected' | 'failed';
  errors: FieldError[];
  edits: { ref: ObjectRef; op: 'modify' | 'create' | 'delete'; before: Record<string, unknown>; after: Record<string, unknown> }[];
  message: string;                 // rendered successMessage or the first failure message
};

// ───────────────────────────── Agent (SSE events to the browser) ─────────────────────────────

export type AgentEvent =
  | { type: 'status'; status: 'running' | 'idle' | 'awaiting_approval' | 'awaiting_answer' | 'error'; mode: string }
  | { type: 'item'; item: AgentItemView }
  | { type: 'delta'; seq: number; text: string }               // streamed assistant text
  | { type: 'tokens'; used: number; budget: number };

export type AgentItemView =
  | { seq: number; kind: 'user_message' | 'assistant_message'; text: string }
  | { seq: number; kind: 'tool_call'; tool: string; title: string; why: string; args: unknown; risk: ToolRisk }
  | { seq: number; kind: 'tool_result'; tool: string; ok: boolean; summary: string; details?: unknown }
  | { seq: number; kind: 'approval_request'; approvalId: string; tool: string; summary: string; args: unknown;
      editableFields?: string[] }
  | { seq: number; kind: 'approval_decision'; approvalId: string; decision: 'allowed' | 'rejected'; note?: string }
  | { seq: number; kind: 'question'; questionId: string; questions: ClarifyingQuestion[] }
  | { seq: number; kind: 'answer'; questionId: string; answers: Record<string, string> }
  | { seq: number; kind: 'mode_change'; from: string; to: string }
  | { seq: number; kind: 'note'; text: string };

export type ToolRisk = 'meta' | 'read' | 'draft' | 'gated';
export type ClarifyingQuestion = { id: string; text: string; choices?: string[]; allowFreeText: boolean };

// Rich blocks the agent can put in its final messages (rendered by the chat UI)
export type ChatBlock =
  | { kind: 'plan'; steps: string[] }
  | { kind: 'proposal'; rows: { item: string; whatItDoes: string }[]; caveats: string[] }
  | { kind: 'verification'; checks: { label: string; ok: boolean; detail: string }[] }
  | { kind: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | { kind: 'barChart'; x: string; y: string; data: Record<string, string | number>[] }
  | { kind: 'objectLink'; ref: ObjectRef; label: string }
  | { kind: 'appLink'; appId: string; label: string };
