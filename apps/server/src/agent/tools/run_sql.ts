import { sqlRequestSchema } from '../../modules/sql/schemas.js';
import { clip, plural, runSemTool } from './result.semantics.js';
import { defineTool, rationaleSchema } from './types.js';

// Rows sent back to the model are cut to this many JSON characters (05-agent §7: results above 6 000
// characters are truncated by the loop anyway; cutting here keeps whole rows and says so).
export const RUN_SQL_MAX_CHARS = 5_000;
const CELL_MAX = 200;

const cell = (v: unknown): unknown => (typeof v === 'string' ? clip(v, CELL_MAX) : v);

export const runSql = defineTool({
  name: 'run_sql',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: sqlRequestSchema.extend({ rationale: rationaleSchema }),
  run: ({ sql }, ctx) =>
    runSemTool(ctx, 'read', async () => {
      const res = await ctx.services.sql.run(ctx.projectId, { sql });
      const rows: unknown[][] = [];
      let used = JSON.stringify(res.columns).length;
      for (const row of res.rows) {
        const r = row.map(cell);
        const size = JSON.stringify(r).length + 1;
        if (used + size > RUN_SQL_MAX_CHARS) break;
        rows.push(r);
        used += size;
      }
      const cut = rows.length < res.rows.length;
      const more = res.truncated ? `more than ${res.rows.length}` : String(res.rows.length);
      const summary =
        `${more} ${res.rows.length === 1 && !res.truncated ? 'row' : 'rows'}` +
        (cut ? `, showing ${rows.length}` : '') +
        ` (${plural(res.columns.length, 'column')}, ${res.ms} ms).`;
      return {
        summary,
        result: {
          columns: res.columns,
          rows,
          rowCount: res.rows.length,
          truncated: res.truncated || cut,
          ms: res.ms,
          ...(res.truncated || cut ? { hint: 'Aggregate or filter in SQL to see everything that matters in fewer rows.' } : {}),
        },
      };
    }),
});
