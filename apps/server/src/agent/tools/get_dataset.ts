import { z } from 'zod';
import { toolResult } from './tool-result.js';
import { defineTool, rationaleSchema } from './types.js';

const PARSE_ERRORS_SHOWN = 10;

export const getDataset = defineTool({
  name: 'get_dataset',
  modes: ['explore', 'semantics', 'build'],
  risk: 'read',
  input: z.object({
    rationale: rationaleSchema,
    datasetId: z.string().min(1).describe('Dataset id or exact name'),
    version: z.number().int().positive().optional().describe('Defaults to the current version'),
  }),
  run: (input, ctx) =>
    toolResult(async () => {
      const ds = await ctx.services.datasets.resolveDataset(ctx.projectId, ctx.user.id, input.datasetId);
      const v = await ctx.services.datasets.getVersion(ds, input.version);
      const sqlTable = await ctx.services.datasets.sqlTable(ds, input.version);
      return {
        summary: `${ds.name} v${v.version}: ${v.rowCount} rows, ${v.columns.length} columns, ${v.parseErrors.length} parse errors. SQL table: ${sqlTable ?? '(removed)'} (columns by sqlName)`,
        result: {
          id: ds.id,
          name: ds.name,
          simulated: ds.simulated,
          version: v.version,
          sqlTable,
          transactionType: v.transactionType,
          rowCount: v.rowCount,
          profileStatus: v.profileStatus,
          columns: v.columns.map((c) => ({ name: c.name, sqlName: c.sqlName, type: c.type, nullable: c.nullable, sample: c.sample })),
          parseErrors: {
            total: v.parseErrors.length,
            truncated: v.parseErrors.length > PARSE_ERRORS_SHOWN,
            items: v.parseErrors.slice(0, PARSE_ERRORS_SHOWN),
          },
        },
      };
    }),
});
