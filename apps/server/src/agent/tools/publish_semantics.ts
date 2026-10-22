import type { z } from 'zod';
import { constraints, isOpenDecision, nextVersionName } from '../../modules/semantics/engine/index.js';
import type { SemanticStore } from '../../modules/semantics/index.js';
import { publishInputSchema } from '../../modules/semantics/schemas.js';
import { clip, compactValidation, plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

type PublishInput = z.infer<typeof publishInputSchema>;
const MAX_DECISIONS_LISTED = 5;

/** The approval card text (05-agent §5): what will be published, in plain words. */
export async function publishApprovalText(store: SemanticStore, projectId: string, input: PublishInput): Promise<string> {
  const [draft, versions, workload] = await Promise.all([
    store.load(projectId, 'draft'),
    store.listVersions(projectId),
    store.getWorkload(projectId),
  ]);
  const { counts } = draft!.info;
  const bank = draft!.bank;
  const next = nextVersionName(versions.map((v) => v.version));
  const lines = [
    `Adopt ${plural(counts.enriched, 'definition')}, ${plural(counts.relations, 'relation')} and ${plural(counts.constraints, 'rule')} ` +
      `as the official meaning of your data (version ${next}).`,
    `In short: ${input.summary}`,
  ];
  const active = constraints(bank, true);
  const decided = active.filter((c) => c.resolution);
  if (decided.length) {
    lines.push('Your decisions:');
    for (const c of decided.slice(0, MAX_DECISIONS_LISTED)) lines.push(`- ${clip(c.description, 120)} → ${c.resolution!.choice}`);
    if (decided.length > MAX_DECISIONS_LISTED) lines.push(`- and ${decided.length - MAX_DECISIONS_LISTED} more`);
  }
  const open = active.filter(isOpenDecision);
  if (open.length) {
    lines.push(`Still waiting for your choice (publishing will be refused until then): ${open.map((c) => clip(c.description, 80)).join('; ')}.`);
  }
  const picked = workload.questions.filter((q) => q.picked);
  if (picked.length) {
    const links = input.questionLinks ?? draft!.info.questionLinks;
    const covered = picked.filter((q) => (links[q.id]?.length ?? 0) > 0).length;
    lines.push(`Answers ${covered} of your ${plural(picked.length, 'question')}.`);
  }
  if (input.limitations.length) {
    lines.push('Known limitations:');
    for (const l of input.limitations) lines.push(`- ${l}`);
  }
  return lines.join('\n');
}

export const publishSemantics = defineTool({
  name: 'publish_semantics',
  modes: ['semantics'],
  risk: 'gated',
  input: publishInputSchema.extend({ rationale: rationaleSchema }),
  async summarize({ rationale: _r, ...input }, ctx) {
    try {
      return await publishApprovalText(ctx.services.semantics, ctx.projectId, input);
    } catch {
      return `Adopt the bank draft as the official meaning of your data. In short: ${input.summary}`;
    }
  },
  run: ({ rationale: _r, ...input }, ctx) =>
    runSemTool(ctx, 'write', async () => {
      const store = ctx.services.semantics;
      // Without questionLinks the draft's current links are kept (same as the publish route).
      const questionLinks = input.questionLinks ?? (await store.overview(ctx.projectId, 'draft')).questionLinks;
      const { version, validation } = await store.publish(ctx.projectId, { ...input, questionLinks }, { userId: ctx.user.id });
      const loaded = await ctx.services.semantics.load(ctx.projectId, version);
      const c = loaded!.info.counts;
      return {
        summary:
          `Published version ${version}: ${plural(c.enriched, 'definition')}, ${plural(c.relations, 'relation')} and ` +
          `${plural(c.constraints, 'rule')} are now the official meaning of the data` +
          (validation.warnings.length ? ` (${plural(validation.warnings.length, 'warning')}).` : '.'),
        result: { version, counts: c, validation: compactValidation(validation) },
      };
    }),
});
