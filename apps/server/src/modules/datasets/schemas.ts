import type { ColumnInfo, Dataset, ProfileStatus } from '@mini/shared';
import { z } from 'zod';

export const datasetParamsSchema = z.object({ id: z.string().uuid() });

// Multipart text fields of POST /api/projects/:pid/datasets (the file is the `file` part).
export const uploadFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  transactionType: z.enum(['SNAPSHOT', 'APPEND']).optional(),
  datasetId: z.string().uuid().optional(),
  simulated: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const versionQuerySchema = z.object({ version: z.coerce.number().int().positive().optional() });

export const previewQuerySchema = versionQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const profileQuerySchema = versionQuerySchema.extend({ column: z.string().min(1).optional() });

export const matchAgainstSchema = z.object({
  datasetId: z.string().min(1),
  keys: z.array(z.object({ fromColumn: z.string().min(1), toColumn: z.string().min(1) })).min(1),
});

export type IngestInput = {
  projectId: string;
  userId: string;
  filePath: string; // the stored upload (under DATA_DIR) or a local file (seed script)
  originalName: string; // file name as uploaded: the default dataset name
  name?: string;
  transactionType?: 'SNAPSHOT' | 'APPEND';
  datasetId?: string;
  simulated?: boolean;
  onProgress?: (rowsLoaded: number) => void;
};

// GET /api/projects/:pid/datasets: Dataset + a summary of its current version.
export type DatasetSummary = Dataset & {
  current: {
    version: number;
    rowCount: number;
    columnCount: number;
    profileStatus: ProfileStatus;
    createdAt: string;
    createdBy: string;
  } | null;
};

// GET /api/datasets/:id/preview: rows are arrays in the order of `columns`.
export type PreviewResult = { columns: ColumnInfo[]; rows: unknown[][]; total: number };
