import type {
  ActionParam,
  ActionRule,
  ActionTypeDef,
  AppBlock,
  AppDef,
  AutomationDef,
  AutomationEffect,
  BaseType,
  Criterion,
  DraftOp,
  EntityKind,
  Filter,
  LinkTypeDef,
  LogicDef,
  LogicExpr,
  ObjectRefExpr,
  ObjectSet,
  ObjectTypeDef,
  PipelineCheck,
  PipelineDef,
  PipelineNode,
  PropertyDef,
  ValueExpr,
  WorkspaceDoc,
} from '@mini/shared';
import { z } from 'zod';

// zod schemas of the workspace document (04-api §3–§4), mirroring packages/shared exactly (checked at the
// bottom of this file). Objects are strict: an unknown field (e.g. a legacy `datasetId`) is an error, and an
// unknown `kind` fails with the list of supported kinds (CLAUDE.md rule 10).

const name = z.string().min(1);

export const baseTypeSchema = z.enum(['string', 'integer', 'double', 'boolean', 'date', 'timestamp']);
const scalar = z.union([z.string(), z.number(), z.boolean()]);

// ── Filters, expressions, object sets ──

export const compareOpSchema = z.enum(['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull', 'gt', 'gte', 'lt', 'lte', 'startsWith']);

export const filterSchema: z.ZodType<Filter> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['and', 'or']), filters: z.array(filterSchema) }).strict(),
    z.object({ kind: z.literal('not'), filter: filterSchema }).strict(),
    z
      .object({
        kind: z.literal('cmp'),
        property: name,
        op: compareOpSchema,
        value: z.union([scalar, z.array(z.union([z.string(), z.number()]))]).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('cmpProps'),
        left: name,
        op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
        right: name,
      })
      .strict(),
    z.object({ kind: z.literal('rule'), rule: name }).strict(),
    z.object({ kind: z.literal('search'), text: z.string() }).strict(),
  ]),
);

const pair = (s: z.ZodType<LogicExpr>) => z.tuple([s, s]);

export const logicExprSchema: z.ZodType<LogicExpr> = z.lazy(() =>
  z.union([
    z.object({ property: name }).strict(),
    z.object({ literal: z.union([scalar, z.null()]) }).strict(),
    z.object({ now: z.literal(true) }).strict(),
    z.object({ today: z.literal(true) }).strict(),
    z.object({ add: pair(logicExprSchema) }).strict(),
    z.object({ sub: pair(logicExprSchema) }).strict(),
    z.object({ mul: pair(logicExprSchema) }).strict(),
    z.object({ div: pair(logicExprSchema) }).strict(),
    z.object({ coalesce: z.array(logicExprSchema).min(1) }).strict(),
    z
      .object({
        case: z.array(z.object({ when: filterSchema, then: logicExprSchema }).strict()).min(1),
        else: logicExprSchema.optional(),
      })
      .strict(),
    z
      .object({
        aggregate: z
          .object({
            link: name,
            fn: z.enum(['count', 'sum', 'avg', 'min', 'max']),
            property: name.optional(),
            where: filterSchema.optional(),
          })
          .strict(),
      })
      .strict(),
  ]),
);

export const objectSetSchema: z.ZodType<ObjectSet> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all'), objectType: name }).strict(),
    z.object({ kind: z.literal('filter'), of: objectSetSchema, where: filterSchema }).strict(),
    z.object({ kind: z.literal('linked'), of: objectSetSchema, link: name }).strict(),
    z
      .object({
        kind: z.literal('refs'),
        refs: z.array(z.object({ objectType: name, primaryKey: z.string() }).strict()),
      })
      .strict(),
  ]),
);

export const valueExprSchema: z.ZodType<ValueExpr> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.union([scalar, z.null()]) }).strict(),
  z.object({ kind: z.literal('param'), param: name }).strict(),
  z.object({ kind: z.literal('paramProperty'), param: name, property: name }).strict(),
  z.object({ kind: z.literal('now') }).strict(),
  z.object({ kind: z.literal('currentUser') }).strict(),
]);

export const objectRefExprSchema: z.ZodType<ObjectRefExpr> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('param'), param: name }).strict(),
  z.object({ kind: z.literal('lookup'), objectType: name, keys: z.record(valueExprSchema) }).strict(),
]);

// ── Pipelines ──

export const pipelineNodeSchema: z.ZodType<PipelineNode> = z.discriminatedUnion('kind', [
  z.object({ id: name, kind: z.literal('source'), datasetId: name }).strict(),
  z.object({ id: name, kind: z.literal('filter'), input: name, where: filterSchema }).strict(),
  z.object({ id: name, kind: z.literal('select'), input: name, columns: z.array(name).min(1) }).strict(),
  z.object({ id: name, kind: z.literal('rename'), input: name, map: z.record(name) }).strict(),
  z.object({ id: name, kind: z.literal('cast'), input: name, column: name, to: baseTypeSchema }).strict(),
  z.object({ id: name, kind: z.literal('derive'), input: name, as: name, expr: logicExprSchema }).strict(),
  z
    .object({
      id: name,
      kind: z.literal('join'),
      left: name,
      right: name,
      how: z.enum(['inner', 'left']),
      on: z.array(z.object({ left: name, right: name }).strict()).min(1),
      rightPrefix: z.string().optional(),
    })
    .strict(),
  z.object({ id: name, kind: z.literal('union'), inputs: z.array(name).min(2) }).strict(),
  z
    .object({
      id: name,
      kind: z.literal('aggregate'),
      input: name,
      groupBy: z.array(name),
      measures: z.array(
        z
          .object({
            as: name,
            fn: z.enum(['count', 'countDistinct', 'sum', 'avg', 'min', 'max']),
            column: name.optional(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      id: name,
      kind: z.literal('deduplicate'),
      input: name,
      keys: z.array(name).min(1),
      keep: z.enum(['first', 'last']),
      orderBy: z.array(z.object({ column: name, direction: z.enum(['asc', 'desc']) }).strict()).optional(),
    })
    .strict(),
]);

export const pipelineCheckSchema: z.ZodType<PipelineCheck> = z
  .object({
    output: name,
    kind: z.enum(['unique', 'notNull', 'rowCount']),
    columns: z.array(name).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

export const pipelineDefSchema: z.ZodType<PipelineDef> = z
  .object({
    apiName: name,
    description: z.string(),
    terms: z.array(name).optional(),
    nodes: z.array(pipelineNodeSchema).min(1),
    outputs: z.array(z.object({ apiName: name, node: name }).strict()).min(1),
    checks: z.array(pipelineCheckSchema),
  })
  .strict();

// ── Ontology ──

export const propertyDefSchema: z.ZodType<PropertyDef> = z
  .object({
    apiName: name,
    column: name.optional(),
    type: baseTypeSchema,
    displayName: z.string(),
    description: z.string(),
    aliases: z.array(z.string()),
    editable: z.boolean(),
    allowedValues: z.array(z.string()).optional(),
    term: name.optional(),
  })
  .strict();

export const objectTypeDefSchema: z.ZodType<ObjectTypeDef> = z
  .object({
    apiName: name,
    displayName: z.string(),
    pluralDisplayName: z.string(),
    description: z.string(),
    aliases: z.array(z.string()),
    icon: z.string().optional(),
    term: name.optional(),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('dataset'), datasetId: name }).strict(),
      z.object({ kind: z.literal('pipeline'), pipeline: name, output: name }).strict(),
    ]),
    primaryKey: name,
    titleProperty: name,
    properties: z.array(propertyDefSchema),
    status: z.enum(['experimental', 'active', 'deprecated']),
  })
  .strict();

export const linkTypeDefSchema: z.ZodType<LinkTypeDef> = z
  .object({
    apiName: name,
    from: name,
    to: name,
    cardinality: z.enum(['many-to-one', 'one-to-one']),
    keys: z.array(z.object({ fromProperty: name, toProperty: name }).strict()).min(1),
    relation: name.optional(),
    displayName: z.string(),
    reverseApiName: name,
    reverseDisplayName: z.string(),
    description: z.string(),
  })
  .strict();

const logicBase = {
  apiName: name,
  objectType: name,
  displayName: z.string(),
  description: z.string(),
  constraints: z.array(name).optional(),
};

export const logicDefSchema: z.ZodType<LogicDef> = z.discriminatedUnion('kind', [
  z.object({ ...logicBase, kind: z.literal('derived'), type: baseTypeSchema, expr: logicExprSchema }).strict(),
  z.object({ ...logicBase, kind: z.literal('rule'), condition: filterSchema }).strict(),
]);

// ── Actions ──

const paramBase = { id: name, displayName: z.string(), description: z.string(), required: z.boolean() };

export const actionParamSchema: z.ZodType<ActionParam> = z.discriminatedUnion('kind', [
  z.object({ ...paramBase, kind: z.literal('object'), objectType: name }).strict(),
  z
    .object({
      ...paramBase,
      kind: z.literal('value'),
      type: baseTypeSchema,
      allowedValues: z.array(z.string()).optional(),
      default: valueExprSchema.optional(),
    })
    .strict(),
]);

export const actionRuleSchema: z.ZodType<ActionRule> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('modifyObject'), object: name, set: z.record(valueExprSchema) }).strict(),
  z
    .object({ kind: z.literal('createObject'), objectType: name, primaryKey: valueExprSchema, set: z.record(valueExprSchema) })
    .strict(),
  z.object({ kind: z.literal('deleteObject'), object: name }).strict(),
]);

export const criterionSchema: z.ZodType<Criterion> = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('compare'),
      left: valueExprSchema,
      op: z.enum(['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull', 'gt', 'gte', 'lt', 'lte']),
      right: z
        .union([
          valueExprSchema,
          z.object({ kind: z.literal('list'), values: z.array(z.union([z.string(), z.number()])) }).strict(),
        ])
        .optional(),
      failureMessage: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rule'),
      objectType: name,
      rule: name,
      object: objectRefExprSchema,
      expect: z.boolean(),
      afterEdits: z.boolean(),
      failureMessage: z.string(),
    })
    .strict(),
]);

export const actionTypeDefSchema: z.ZodType<ActionTypeDef> = z
  .object({
    apiName: name,
    displayName: z.string(),
    description: z.string(),
    agentDescription: z.string(),
    constraints: z.array(name).optional(),
    parameters: z.array(actionParamSchema),
    rules: z.array(actionRuleSchema).min(1),
    submissionCriteria: z.array(criterionSchema),
    successMessage: z.string(),
  })
  .strict();

// ── Apps and automations (stretch) ──

export const aggregateSchema = z.discriminatedUnion('fn', [
  z.object({ fn: z.literal('count') }).strict(),
  z.object({ fn: z.enum(['sum', 'avg', 'min', 'max']), property: name }).strict(),
]);

export const appBlockSchema: z.ZodType<AppBlock> = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('metric'), version: z.literal(1), label: z.string(), set: objectSetSchema, aggregate: aggregateSchema })
    .strict(),
  z
    .object({
      kind: z.literal('objectList'),
      version: z.literal(1),
      id: name,
      title: z.string(),
      set: objectSetSchema,
      columns: z.array(name),
      sort: z.array(
        z.object({ property: name, direction: z.enum(['asc', 'desc']), order: z.array(z.string()).optional() }).strict(),
      ),
      filters: z.array(z.object({ property: name, control: z.enum(['select', 'multiSelect', 'search']) }).strict()),
      pageSize: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('objectDetail'),
      version: z.literal(1),
      source: name,
      properties: z.array(name),
      links: z.array(name),
      actions: z.array(name),
    })
    .strict(),
  z
    .object({
      kind: z.literal('chart'),
      version: z.literal(1),
      title: z.string(),
      set: objectSetSchema,
      groupBy: name,
      aggregate: aggregateSchema,
      chart: z.enum(['bar', 'pie']),
    })
    .strict(),
  z.object({ kind: z.literal('markdown'), version: z.literal(1), text: z.string() }).strict(),
]);

export const appDefSchema: z.ZodType<AppDef> = z
  .object({
    id: name,
    name: z.string(),
    description: z.string(),
    pages: z.array(z.object({ id: name, title: z.string(), blocks: z.array(appBlockSchema) }).strict()),
  })
  .strict();

export const automationEffectSchema: z.ZodType<AutomationEffect> = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('notify'),
      recipients: z.array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('user'), userId: name }).strict(),
          z.object({ kind: z.literal('currentUser') }).strict(),
        ]),
      ),
      title: z.string(),
      body: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('runAction'),
      action: name,
      params: z.record(z.union([valueExprSchema, z.object({ kind: z.literal('triggerObject') }).strict()])),
    })
    .strict(),
]);

export const automationDefSchema: z.ZodType<AutomationDef> = z
  .object({
    id: name,
    name: z.string(),
    description: z.string(),
    condition: z.object({ kind: z.literal('objectsEnterSet'), set: objectSetSchema }).strict(),
    effects: z.array(automationEffectSchema).min(1),
  })
  .strict();

// ── The document and its operations ──

export const workspaceDocSchema: z.ZodType<WorkspaceDoc> = z
  .object({
    semanticVersion: z.string(),
    pipelines: z.array(pipelineDefSchema),
    objectTypes: z.array(objectTypeDefSchema),
    linkTypes: z.array(linkTypeDefSchema),
    logic: z.array(logicDefSchema),
    actionTypes: z.array(actionTypeDefSchema),
    apps: z.array(appDefSchema),
    automations: z.array(automationDefSchema),
  })
  .strict();

export const entityKindSchema: z.ZodType<EntityKind> = z.enum([
  'pipeline',
  'objectType',
  'property',
  'linkType',
  'logic',
  'actionType',
  'app',
  'automation',
]);

export const draftOpSchema: z.ZodType<DraftOp> = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsertPipeline'), value: pipelineDefSchema }).strict(),
  z.object({ op: z.literal('upsertObjectType'), value: objectTypeDefSchema }).strict(),
  z.object({ op: z.literal('upsertProperty'), objectType: name, value: propertyDefSchema }).strict(),
  z.object({ op: z.literal('upsertLinkType'), value: linkTypeDefSchema }).strict(),
  z.object({ op: z.literal('upsertLogic'), value: logicDefSchema }).strict(),
  z.object({ op: z.literal('upsertActionType'), value: actionTypeDefSchema }).strict(),
  z.object({ op: z.literal('upsertApp'), value: appDefSchema }).strict(),
  z.object({ op: z.literal('upsertAutomation'), value: automationDefSchema }).strict(),
  z.object({ op: z.literal('remove'), kind: entityKindSchema, apiName: name, objectType: name.optional() }).strict(),
  z
    .object({
      op: z.literal('setMetadata'),
      target: z
        .object({
          kind: z.enum(['objectType', 'property', 'linkType', 'logic', 'actionType']),
          apiName: name,
          objectType: name.optional(),
        })
        .strict(),
      field: z.enum(['description', 'displayName', 'aliases']),
      value: z.union([z.string(), z.array(z.string())]),
    })
    .strict(),
  z.object({ op: z.literal('setSemanticVersion'), version: name }).strict(),
]);

// ── Route inputs ──

export const patchDraftBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  ops: z.array(draftOpSchema).min(1).max(200),
});

export const workspaceQuerySchema = z.object({
  version: z.union([z.enum(['latest', 'draft']), z.coerce.number().int().positive()]).default('latest'),
});

// ── Compile-time check: the schemas produce exactly the shared types ──

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _SchemasMatchShared = [
  Assert<Same<z.infer<typeof workspaceDocSchema>, WorkspaceDoc>>,
  Assert<Same<z.infer<typeof draftOpSchema>, DraftOp>>,
  Assert<Same<z.infer<typeof baseTypeSchema>, BaseType>>,
];
