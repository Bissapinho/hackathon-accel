import type { SemOp } from '@mini/shared';
import { agentDraftOpsSchema } from '../../modules/semantics/schemas.js';
import { compactValidation, plural, runSemTool, validationSummary } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

export const editSemantics = defineTool({
  name: 'edit_semantics',
  modes: ['semantics'],
  risk: 'bankDraft',
  input: agentDraftOpsSchema.extend({ rationale: rationaleSchema }),
  run: ({ expectedRevision, ops }, ctx) =>
    runSemTool(ctx, 'write', async () => {
      // Vocabulary fields are checked by the bank's validation (see agentSemOpSchema), hence the cast.
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
