import type { SemKind, SemLifecycle, SemOp, Workload } from '@mini/shared';
import { z } from 'zod';
import { MAX_BROWSE_ITEMS, MAX_RESOLVE_MENTIONS } from './engine/vocab.js';

// zod schemas of the semantics routes (04-api §1 "Semantics (stage 2)", §2 SemOp), reused by the
// agent's semantics tools (browse_semantics, resolve_semantics, edit_semantics, validate_semantics,
// publish_semantics, workload). Record bodies are only checked for an `id` here: their fields,
// vocabularies and references are checked by the engine, which reports the SEM_* codes of 04-api §5
// (S1) instead of a generic VALIDATION_FAILED.

/** 'active' (default), 'draft' or a published version 'v0', 'v1'… */
export const versionRefSchema = z
  .string()
  .trim()
  .regex(/^(active|draft|v\d+)$/, 'Use "active", "draft" or a published version such as "v0".');

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
  id: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(1000),
  useCase: z.string().max(1000).optional(),
  source: z.enum(['proposed', 'user']),
  picked: z.boolean(),
});

export const workloadSchema = z
  .object({
    goal: z.string().max(4000),
    questions: z.array(workloadQuestionSchema).max(100),
  })
  .superRefine((w, ctx) => {
    const seen = new Set<string>();
    w.questions.forEach((q, i) => {
      if (seen.has(q.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', i, 'id'], message: `Question id "${q.id}" is used twice.` });
      seen.add(q.id);
    });
  }) satisfies z.ZodType<Workload>;

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
  expectedRevision: z.number().int().min(0),
  summary: z.string().max(2000),
  limitations: z.array(z.string().max(1000)).max(50).default([]),
  /** Question id → record ids. Omitted: the draft's current links. */
  questionLinks: z.record(z.array(z.string())).optional(),
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
