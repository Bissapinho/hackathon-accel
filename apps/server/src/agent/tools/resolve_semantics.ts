import type { ResolveResult } from '@mini/shared';
import { z } from 'zod';
import { MAX_RESOLVE_MENTIONS } from '../../modules/semantics/engine/index.js';
import { semVersionRefSchema } from './bank_overview.js';
import { clip, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// Evidence results are up to 2 KB each; a resolve over 5 mentions would exceed the 6 000-character
// tool result budget (05-agent §7), so each one is cut here.
const EVIDENCE_RESULT_MAX = 400;

function compact(res: ResolveResult): ResolveResult {
  return {
    ...res,
    mentions: res.mentions.map((m) => ({
      ...m,
      evidence: m.evidence.map((e) => ({ ...e, ...(e.result ? { result: clip(e.result, EVIDENCE_RESULT_MAX) } : {}) })),
    })),
  };
}

export const resolveSemantics = defineTool({
  name: 'resolve_semantics',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    mentions: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(MAX_RESOLVE_MENTIONS)
      .describe(`1 to ${MAX_RESOLVE_MENTIONS} words or phrases from the question, e.g. ["taux de retour", "magasin"]`),
    context: z.string().max(500).describe('The user\'s question, used to choose between close matches'),
    version: semVersionRefSchema.optional().describe("Default 'active'"),
  }),
  run: ({ mentions, context, version }, ctx) =>
    runSemTool(ctx, 'read', async () => {
      const ref = version ?? 'active';
      const res = compact(await ctx.services.semantics.resolve(ctx.projectId, { mentions, context, version: ref }));
      const parts = res.mentions.map((m) => {
        if (m.term) {
          const decided = m.constraints.filter((c) => c.resolution).length;
          const open = m.constraints.filter((c) => c.severity === 'block' && c.options?.length && !c.resolution).length;
          const rules = m.constraints.length ? `, ${m.constraints.length} rule${m.constraints.length === 1 ? '' : 's'}${decided ? ` (${decided} decided)` : ''}${open ? ` (${open} still open)` : ''}` : '';
          return `"${m.mention}" → ${m.term.name}: ${m.mappings.length} mapping${m.mappings.length === 1 ? '' : 's'}${rules}`;
        }
        if (m.ambiguous) return `"${m.mention}" is ambiguous: ${m.ambiguous.candidates.map((c) => c.name).join(' / ')}`;
        return `"${m.mention}" not found`;
      });
      const summary = res.version === 'uninitialized'
        ? 'No published meaning yet: nothing can be resolved. Publish the semantic bank first, or use version: \'draft\'.'
        : `${res.version}: ${parts.join('; ')}.`;
      return { summary, result: res };
    }),
});
