import { z } from 'zod';
import { notFound } from '../../errors.js';
import { constraints, isOpenDecision, terms } from '../../modules/semantics/engine/index.js';
import { plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// Lists are cut to keep the result small (05-agent §7); totals are always given.
const MAX_CARDS = 12;
const MAX_DECISIONS = 10;

// TODO(T-09): move to modules/semantics/schemas.ts (shared with the semantics routes).
export const semVersionRefSchema = z
  .string()
  .min(1)
  .describe("'active' (the published meaning), 'draft' (work in progress) or a version name such as 'v0'");

export const bankOverview = defineTool({
  name: 'bank_overview',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    version: semVersionRefSchema.optional().describe("Version to describe; default: 'draft' in semantics mode, 'active' otherwise"),
  }),
  run: ({ version }, ctx) =>
    runSemTool(ctx, 'read', async () => {
      const store = ctx.services.semantics;
      const ref = version ?? (ctx.mode === 'semantics' ? 'draft' : 'active');
      const [active, draft, workload] = await Promise.all([
        store.activeVersion(ctx.projectId),
        store.load(ctx.projectId, 'draft'),
        store.getWorkload(ctx.projectId),
      ]);
      const loaded = ref === 'draft' ? draft : await store.load(ctx.projectId, ref);
      if (!loaded) throw notFound(`Semantic version "${ref}"`, 'it does not exist in this project', "Use 'active', 'draft' or a published version such as 'v0'.");

      const { info, bank } = loaded;
      const cards = terms(bank, true).filter((t) => t.status === 'card');
      const open = constraints(bank, true).filter(isOpenDecision);
      const decided = constraints(bank, true).filter((c) => c.resolution).length;
      const links = info.questionLinks;
      const questions = workload.questions.map((q) => ({ id: q.id, text: q.text, picked: q.picked, covered: (links[q.id]?.length ?? 0) > 0 }));
      const uncovered = questions.filter((q) => q.picked && !q.covered).map((q) => q.id);
      const draftRevision = draft?.info.revision ?? 0;

      const label = ref === 'draft' ? `Draft (revision ${draftRevision})`
        : info.version === 'uninitialized' ? 'Nothing published yet' : `Version ${info.version}`;
      const c = info.counts;
      const summary = [
        `${label}: ` +
          `${c.enriched} of ${plural(c.terms, 'term')} defined, ${plural(c.relations, 'relation')}, ${plural(c.constraints, 'rule')}, ${c.evidence} evidence.`,
        `${plural(open.length, 'open decision')}; ${plural(cards.length, 'card')} still to enrich.`,
        workload.questions.length
          ? `${questions.filter((q) => q.picked).length} picked questions, ${uncovered.length} not covered yet.`
          : 'No goal or seed questions saved yet.',
        active ? `Active version: ${active}.` : 'No version published yet.',
      ].join(' ');

      return {
        summary,
        result: {
          version: info.version,
          status: info.status,
          activeVersion: active,
          draft: { revision: draftRevision, hasChanges: draftRevision > 0 },
          counts: c,
          ...(info.summary ? { versionSummary: info.summary } : {}),
          ...(info.limitations.length ? { limitations: info.limitations } : {}),
          cardsToEnrich: {
            total: cards.length,
            items: cards.slice(0, MAX_CARDS).map((t) => ({ id: t.id, name: t.name })),
            truncated: cards.length > MAX_CARDS,
          },
          openDecisions: {
            total: open.length,
            items: open.slice(0, MAX_DECISIONS).map((d) => ({ id: d.id, description: d.description, options: d.options ?? [] })),
            truncated: open.length > MAX_DECISIONS,
          },
          decided,
          proposedRecords: [...bank.records.values()].filter((r) => r.lifecycle === 'proposed').length,
          goal: workload.goal,
          questions,
          uncoveredQuestions: uncovered,
        },
      };
    }),
});
