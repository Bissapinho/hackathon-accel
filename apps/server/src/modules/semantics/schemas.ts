import type { SemKind, SemLifecycle, SemOp, Workload } from '@mini/shared';
import { z } from 'zod';
import {
  CONSTRAINT_TYPES, MAX_BROWSE_ITEMS, MAX_RESOLVE_MENTIONS, RELATION_TYPES, SEVERITIES, TERM_STATUSES, TERM_TYPES,
} from './engine/vocab.js';

// zod schemas of the semantics routes (04-api §1 "Semantics (stage 2)", §2 SemOp), reused by the
// agent's semantics tools (browse_semantics, resolve_semantics, edit_semantics, validate_semantics,
// publish_semantics, workload). Record bodies are only checked for an `id` here: their fields,
// vocabularies and references are checked by the engine, which reports the SEM_* codes of 04-api §5
// (S1) instead of a generic VALIDATION_FAILED.

/** 'active' (default), 'draft' or a published version 'v0', 'v1'… */
export const versionRefSchema = z
  .string()
  .trim()
  .regex(/^(active|draft|v\d+)$/, 'Use "active", "draft" or a published version such as "v0".')
  .describe("'active' (the published meaning), 'draft' (work in progress) or a version name such as 'v0'");

// Same lists as engine/vocab.ts (SEM_KINDS, LIFECYCLES), as tuples for z.enum.
export const semKindSchema = z.enum(['term', 'mapping', 'relation', 'constraint', 'evidence']) satisfies z.ZodType<SemKind>;
export const lifecycleSchema = z.enum(['active', 'superseded', 'proposed']) satisfies z.ZodType<SemLifecycle>;

export const versionQuerySchema = z.object({ version: versionRefSchema.default('active') });

export const recordsQuerySchema = z.object({
  version: versionRefSchema.default('active'),
  kind: semKindSchema.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const browseInputSchema = z.object({
  query: z.string().trim().min(1, 'Say what to look for.').max(500),
  kind: z.enum(['term', 'mapping', 'relation', 'constraint', 'all']).optional(),
  limit: z.number().int().min(1).max(MAX_BROWSE_ITEMS).optional(),
  version: versionRefSchema.optional(),
});

export const resolveInputSchema = z.object({
  mentions: z.array(z.string().trim().min(1).max(200)).min(1, 'Give at least one mention.').max(MAX_RESOLVE_MENTIONS),
  context: z.string().max(4000).default(''),
  version: versionRefSchema.optional(),
});

export const workloadQuestionSchema = z.object({
  id: z.string().trim().min(1).max(64).describe('Short stable id, e.g. "Q01"'),
  text: z.string().trim().min(1).max(1000).describe("The question in the user's words"),
  useCase: z.string().max(1000).optional(),
  source: z.enum(['proposed', 'user']).describe("'proposed' by the agent, or written by the 'user'"),
  picked: z.boolean().describe('Ticked by the user'),
});

/** The workload body without the unique-id check, for tools that extend it (add `.superRefine(uniqueQuestionIds)`). */
export const workloadObjectSchema = z.object({
  goal: z.string().max(4000).describe("The user's goal in one sentence"),
  questions: z.array(workloadQuestionSchema).max(100),
});

export function uniqueQuestionIds(w: { questions: { id: string }[] }, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  w.questions.forEach((q, i) => {
    if (seen.has(q.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', i, 'id'], message: `Question id "${q.id}" is used twice.` });
    seen.add(q.id);
  });
}

export const workloadSchema = workloadObjectSchema.superRefine(uniqueQuestionIds) satisfies z.ZodType<Workload>;

const recordBodySchema = z.object({ id: z.string().trim().min(1, 'The record needs an id.').max(128) }).passthrough();

export const semOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('upsertRecord'),
    record: z.object({ kind: semKindSchema, body: recordBodySchema, lifecycle: lifecycleSchema.optional() }),
  }),
  z.object({ op: z.literal('setLifecycle'), recordId: z.string().min(1), lifecycle: lifecycleSchema }),
  z.object({ op: z.literal('resolveConstraint'), recordId: z.string().min(1), choice: z.string().trim().min(1).max(500), note: z.string().max(2000).optional() }),
  z.object({ op: z.literal('remove'), recordId: z.string().min(1) }),
]);

export const draftOpsSchema = z.object({
  expectedRevision: z.number().int().min(0),
  ops: z.array(semOpSchema).min(1, 'Send at least one change.').max(200),
});

export const validateInputSchema = z.object({
  questionLinks: z.record(z.array(z.string())).optional(),
});

export const publishInputSchema = z.object({
  expectedRevision: z.number().int().min(0).describe('The draft revision you last read'),
  summary: z.string().max(2000).describe('What this version means for the user, in plain words'),
  limitations: z.array(z.string().max(1000)).max(50).default([]).describe('Known gaps: missing months, simulated data, uncovered questions'),
  /** Question id → record ids. Omitted: the draft's current links. */
  questionLinks: z.record(z.array(z.string())).optional().describe("Question id → ids of the records that serve it; omitted: the draft's current links"),
});

export const trajectoriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type BrowseInput = z.infer<typeof browseInputSchema>;
export type ResolveInput = z.infer<typeof resolveInputSchema>;
export type DraftOpsInput = z.infer<typeof draftOpsSchema>;
export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * The parsed ops as the store's `SemOp[]`. Bodies are only shape-checked (id + any fields): the engine
 * checks the rest and reports SEM_* codes, so the cast is deliberate.
 */
export function toSemOps(ops: DraftOpsInput['ops']): SemOp[] {
  return ops as unknown as SemOp[];
}

// ---------- the agent's view of draft operations (edit_semantics) ----------
// Same operations as semOpSchema, but with typed record bodies so Claude sees each record's fields.
// Closed vocabularies (term type and status, relation_type, constraint_type, severity) stay plain strings,
// described with their allowed values: the engine reports a wrong value as a SEM_BAD_VOCABULARY field
// error (S1) instead of a generic argument error. Evidence `result` / `timestamp` and constraint
// `resolution` are written by the server, so they are not inputs.

const oneOf = (values: readonly string[]) => `One of: ${values.join(', ')}`;
const recordId = (prefix: string) => z.string().trim().min(1).max(80).describe(`Record id, e.g. "${prefix}…"`);
const ids = z.array(z.string().min(1)).max(30);
const text = (max: number) => z.string().max(max);

const agentRecordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('term'),
    lifecycle: lifecycleSchema.optional(),
    body: z.object({
      id: recordId('T_'),
      name: z.string().max(120),
      type: z.string().describe(oneOf(TERM_TYPES)),
      definition: text(1000).describe('In words; "to be defined" while status is card'),
      scope: text(300),
      aliases: z.array(z.string().max(80)).max(20).default([]),
      evidence: ids.default([]).describe('Evidence ids'),
      status: z.string().describe(oneOf(TERM_STATUSES)),
    }),
  }),
  z.object({
    kind: z.literal('mapping'),
    lifecycle: lifecycleSchema.optional(),
    body: z.object({
      id: recordId('M_'),
      term_id: z.string(),
      database_source: z.string().describe('Dataset id'),
      table: z.string().describe('Dataset name'),
      column: z.string().describe('Column sqlName'),
      semantic_filter: text(500).optional().describe('In words, not SQL'),
      aggregation_semantics: text(300).optional().describe('In words, e.g. "sum of delivered quantities"'),
      grain: text(200).optional().describe('e.g. "one row per order line"'),
      validation: text(300).optional(),
      evidence: ids.default([]),
    }),
  }),
  z.object({
    kind: z.literal('relation'),
    lifecycle: lifecycleSchema.optional(),
    body: z.object({
      id: recordId('R_'),
      source: z.string().describe('Term id'),
      relation_type: z.string().describe(oneOf(RELATION_TYPES)),
      target: z.string().describe('Term id'),
      connection_condition: text(500).optional().describe('In words'),
      description: text(500),
      keys: z.array(z.object({ fromColumn: z.string(), toColumn: z.string() })).max(5).optional()
        .describe('Join columns; back them with an Evidence join query'),
      evidence: ids.default([]),
    }),
  }),
  z.object({
    kind: z.literal('constraint'),
    lifecycle: lifecycleSchema.optional(),
    body: z.object({
      id: recordId('C_'),
      target: z.string().describe('Term or mapping id'),
      constraint_type: z.string().describe(oneOf(CONSTRAINT_TYPES)),
      trigger_keywords: z.array(z.string().max(80)).max(20).describe('Words in a question that should surface this rule'),
      severity: z.string().describe(oneOf(SEVERITIES)),
      scope: text(300).optional(),
      confidence: z.number().describe('0 to 1'),
      description: text(1000),
      options: z.array(z.string().max(120)).max(6).optional().describe('Readings the user must choose from (an open decision)'),
      evidence: ids.default([]),
    }),
  }),
  z.object({
    kind: z.literal('evidence'),
    lifecycle: lifecycleSchema.optional(),
    body: z.object({
      id: recordId('E_'),
      source: z.string().describe('The dataset or pipeline output observed'),
      query: z.string().max(5000).optional().describe('Read-only SQL; the server runs it and stores the result'),
      validation_method: text(500).describe('What the query shows and how it was checked'),
    }),
  }),
]);

export const agentSemOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsertRecord'), record: agentRecordSchema }),
  z.object({ op: z.literal('setLifecycle'), recordId: z.string().min(1), lifecycle: lifecycleSchema }),
  z.object({
    op: z.literal('resolveConstraint'),
    recordId: z.string().min(1),
    choice: z.string().trim().min(1).max(500).describe("One of the constraint's options, as the user chose it"),
    note: z.string().max(2000).optional(),
  }),
  z.object({ op: z.literal('remove'), recordId: z.string().min(1) }),
]);

export const MAX_AGENT_SEM_OPS = 60;

export const agentDraftOpsSchema = z.object({
  expectedRevision: z.number().int().min(0).describe('The draft revision you last read (bank_overview, or the last edit_semantics result)'),
  ops: z.array(agentSemOpSchema).min(1).max(MAX_AGENT_SEM_OPS),
});
