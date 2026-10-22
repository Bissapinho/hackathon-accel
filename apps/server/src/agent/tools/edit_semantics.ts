import type { SemOp } from '@mini/shared';
import { z } from 'zod';
import {
  CONSTRAINT_TYPES, LIFECYCLES, RELATION_TYPES, SEVERITIES, TERM_STATUSES, TERM_TYPES,
} from '../../modules/semantics/engine/index.js';
import { compactValidation, plural, runSemTool, validationSummary } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// SemOp of 04-api §2 as zod (TODO(T-09): move to modules/semantics/schemas.ts, shared with the draft route).
// Closed vocabularies (term type and status, relation_type, constraint_type, severity) are plain strings
// here, described with their allowed values: the bank's validation reports a wrong value as a field error
// (SEM_BAD_VOCABULARY, acceptance S1) with the list, instead of a generic argument error.
// Evidence `result` / `timestamp` and constraint `resolution` are written by the server, so they are not inputs.

const oneOf = (values: readonly string[]) => `One of: ${values.join(', ')}`;
const id = (prefix: string) => z.string().trim().min(1).max(80).describe(`Record id, e.g. "${prefix}…"`);
const ids = z.array(z.string().min(1)).max(30);
const text = (max: number) => z.string().max(max);

const termBody = z.object({
  id: id('T_'),
  name: z.string().max(120),
  type: z.string().describe(oneOf(TERM_TYPES)),
  definition: text(1000).describe('In words; "to be defined" while status is card'),
  scope: text(300),
  aliases: z.array(z.string().max(80)).max(20).default([]),
  evidence: ids.default([]).describe('Evidence ids'),
  status: z.string().describe(oneOf(TERM_STATUSES)),
});

const mappingBody = z.object({
  id: id('M_'),
  term_id: z.string(),
  database_source: z.string().describe('Dataset id'),
  table: z.string().describe('Dataset name'),
  column: z.string().describe('Column sqlName'),
  semantic_filter: text(500).optional().describe('In words, not SQL'),
  aggregation_semantics: text(300).optional().describe('In words, e.g. "sum of delivered quantities"'),
  grain: text(200).optional().describe('e.g. "one row per order line"'),
  validation: text(300).optional(),
  evidence: ids.default([]),
});

const relationBody = z.object({
  id: id('R_'),
  source: z.string().describe('Term id'),
  relation_type: z.string().describe(oneOf(RELATION_TYPES)),
  target: z.string().describe('Term id'),
  connection_condition: text(500).optional().describe('In words'),
  description: text(500),
  keys: z.array(z.object({ fromColumn: z.string(), toColumn: z.string() })).max(5).optional()
    .describe('Join columns; back them with an Evidence join query'),
  evidence: ids.default([]),
});

const constraintBody = z.object({
  id: id('C_'),
  target: z.string().describe('Term or mapping id'),
  constraint_type: z.string().describe(oneOf(CONSTRAINT_TYPES)),
  trigger_keywords: z.array(z.string().max(80)).max(20).describe('Words in a question that should surface this rule'),
  severity: z.string().describe(oneOf(SEVERITIES)),
  scope: text(300).optional(),
  confidence: z.number().describe('0 to 1'),
  description: text(1000),
  options: z.array(z.string().max(120)).max(6).optional().describe('Readings the user must choose from (an open decision)'),
  evidence: ids.default([]),
});

const evidenceBody = z.object({
  id: id('E_'),
  source: z.string().describe('The dataset or pipeline output observed'),
  query: z.string().max(5000).optional().describe('Read-only SQL; the server runs it and stores the result'),
  validation_method: text(500).describe('What the query shows and how it was checked'),
});

const lifecycle = z.enum(LIFECYCLES as [string, ...string[]]);

const recordSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('term'), body: termBody, lifecycle: lifecycle.optional() }),
  z.object({ kind: z.literal('mapping'), body: mappingBody, lifecycle: lifecycle.optional() }),
  z.object({ kind: z.literal('relation'), body: relationBody, lifecycle: lifecycle.optional() }),
  z.object({ kind: z.literal('constraint'), body: constraintBody, lifecycle: lifecycle.optional() }),
  z.object({ kind: z.literal('evidence'), body: evidenceBody, lifecycle: lifecycle.optional() }),
]);

export const semOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsertRecord'), record: recordSchema }),
  z.object({ op: z.literal('setLifecycle'), recordId: z.string().min(1), lifecycle }),
  z.object({
    op: z.literal('resolveConstraint'),
    recordId: z.string().min(1),
    choice: z.string().min(1).describe("One of the constraint's options, as the user chose it"),
    note: z.string().max(300).optional(),
  }),
  z.object({ op: z.literal('remove'), recordId: z.string().min(1) }),
]);

export const MAX_SEM_OPS = 60;

export const semDraftEditSchema = z.object({
  expectedRevision: z.number().int().min(0).describe('The draft revision you last read (bank_overview, or the last edit_semantics result)'),
  ops: z.array(semOpSchema).min(1).max(MAX_SEM_OPS),
});

export const editSemantics = defineTool({
  name: 'edit_semantics',
  modes: ['semantics'],
  risk: 'bankDraft',
  input: semDraftEditSchema.extend({ rationale: rationaleSchema }),
  run: ({ expectedRevision, ops }, ctx) =>
    runSemTool(ctx, 'write', async () => {
      // Vocabulary fields are checked by the bank's validation (see above), hence the cast.
      const { revision, validation } = await ctx.services.semantics.applyDraftOps(
        ctx.projectId,
        { expectedRevision, ops: ops as SemOp[] },
        { userId: ctx.user.id },
      );
      return {
        summary: `Applied ${plural(ops.length, 'change')} to the draft (now revision ${revision}). ${validationSummary(validation)}`,
        result: { revision, validation: compactValidation(validation) },
      };
    }),
});
