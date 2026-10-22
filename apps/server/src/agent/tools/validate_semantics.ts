import { z } from 'zod';
import { compactValidation, runSemTool, validationSummary } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

export const validateSemantics = defineTool({
  name: 'validate_semantics',
  modes: ['semantics'],
  risk: 'bankDraft',
  input: z.object({ rationale: rationaleSchema }),
  run: (_input, ctx) =>
    runSemTool(ctx, 'read', async () => {
      const store = ctx.services.semantics;
      const [validation, draft] = await Promise.all([store.validateDraft(ctx.projectId), store.load(ctx.projectId, 'draft')]);
      const revision = draft?.info.revision ?? 0;
      return {
        summary: `Draft revision ${revision}: ${validationSummary(validation)}`,
        result: { revision, validation: compactValidation(validation) },
      };
    }),
});
