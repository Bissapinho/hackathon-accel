import { z } from 'zod';
import { defineTool, rationaleSchema } from './types.js';

// Owner: Alfred (09 §5). Switches the session mode. The loop applies the change (session.mode + a
// mode_change item) when this returns ok; the build lock lives here (05-agent §2, 09 §4.5).

export const changeModeInput = z.object({
  mode: z.enum(['explore', 'semantics', 'build']),
  reason: z.string().min(1).max(300),
  rationale: rationaleSchema,
});

export const changeModeTool = defineTool({
  name: 'change_mode',
  modes: ['router', 'explore', 'semantics', 'build'],
  risk: 'meta',
  input: changeModeInput,
  async run({ mode, reason }, ctx) {
    if (mode === 'build') {
      const version = await ctx.semantics.activeVersion(ctx.projectId);
      if (!version) {
        return {
          ok: false,
          code: 'NO_SEMANTIC_VERSION',
          message: 'Build mode is locked until the meaning of the data is published as a semantic version.',
          hint: 'Stay in semantics mode: finish and validate the bank, then call publish_semantics.',
        };
      }
    }
    if (mode === ctx.mode) {
      return { ok: true, summary: `Already in ${mode} mode.`, result: { from: ctx.mode, to: mode, reason } };
    }
    return { ok: true, summary: `Switched from ${ctx.mode} to ${mode} mode.`, result: { from: ctx.mode, to: mode, reason } };
  },
});
