import { z } from 'zod';
import { constraints, isOpenDecision, nextVersionName } from '../../modules/semantics/engine/index.js';
import type { SemanticStore } from '../../modules/semantics/index.js';
import { clip, compactValidation, plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// TODO(T-09): move to modules/semantics/schemas.ts (the same body as the publish route).
export const semPublishSchema = z.object({
  expectedRevision: z.number().int().min(0).describe('The draft revision you last read'),
  summary: z.string().trim().min(1).max(500).describe('What this version means for the user, in plain words'),
  limitations: z.array(z.string().trim().min(1).max(300)).max(15).describe('Known gaps: missing months, simulated data, uncovered questions'),
  questionLinks: z.record(z.string(), z.array(z.string()).max(30)).describe('Question id → ids of the records that serve it'),
});

type PublishInput = z.infer<typeof semPublishSchema>;
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
    const covered = picked.filter((q) => (input.questionLinks[q.id]?.length ?? 0) > 0).length;
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
  input: semPublishSchema.extend({ rationale: rationaleSchema }),
  async summarize({ rationale: _r, ...input }, ctx) {
    try {
      return await publishApprovalText(ctx.services.semantics, ctx.projectId, input);
    } catch {
      return `Adopt the bank draft as the official meaning of your data. In short: ${input.summary}`;
    }
  },
  run: ({ rationale: _r, ...input }, ctx) =>
    runSemTool(ctx, 'write', async () => {
      const { version, validation } = await ctx.services.semantics.publish(ctx.projectId, input, { userId: ctx.user.id });
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
