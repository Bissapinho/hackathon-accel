import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { requireProject, requireUser } from '../../auth.js';
import { ApiError } from '../../errors.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import {
  datasetParamsSchema,
  previewQuerySchema,
  profileQuerySchema,
  uploadFieldsSchema,
} from './schemas.js';
import type { DatasetsService } from './service.js';

const ACCEPTED = /\.csv(\.gz)?$/i;

export function registerDatasetRoutes(
  app: FastifyInstance,
  deps: { datasets: DatasetsService; resources: ResourcesService; dataDir: string },
): void {
  const { datasets, resources } = deps;

  app.get('/api/projects/:pid/datasets', async (req) => {
    const user = requireUser(req);
    const { pid } = projectParamsSchema.parse(req.params);
    return datasets.listDatasets(pid, user.id);
  });

  // multipart {file, name?, transactionType?, datasetId?, simulated?} → DatasetVersion (04-api §1).
  app.post('/api/projects/:pid/datasets', async (req, reply) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    if (!req.isMultipart()) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Send the file as multipart/form-data in a field named "file".');
    }

    const fields: Record<string, string> = {};
    let stored: { filePath: string; originalName: string } | undefined;
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (stored || part.fieldname !== 'file') {
            part.file.resume();
            continue;
          }
          if (!ACCEPTED.test(part.filename)) {
            part.file.resume();
            throw new ApiError(400, 'BAD_FILE', `"${part.filename}" is not a .csv or .csv.gz file.`, {
              hint: 'Export the table as CSV (optionally gzipped) and upload it again.',
            });
          }
          const dir = path.resolve(deps.dataDir, pid);
          await mkdir(dir, { recursive: true });
          const filePath = path.join(dir, `${randomUUID()}-${path.basename(part.filename).replace(/[^\w.-]/g, '_')}`);
          stored = { filePath, originalName: part.filename };
          await pipeline(part.file, createWriteStream(filePath));
          if (part.file.truncated) {
            throw new ApiError(413, 'FILE_TOO_LARGE', 'This file is larger than the upload limit.', {
              hint: 'Gzip it, or ask an admin to raise UPLOAD_MAX_MB.',
            });
          }
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      if (!stored) throw new ApiError(400, 'VALIDATION_FAILED', 'No file was sent.', { hint: 'Put the file in a field named "file".' });

      const body = uploadFieldsSchema.parse(fields);
      const version = await datasets.ingest({
        projectId: pid,
        userId: user.id,
        filePath: stored.filePath,
        originalName: stored.originalName,
        ...body,
      });
      reply.status(201);
      return version;
    } catch (err) {
      // The raw file is kept for audit only when it was loaded.
      if (stored) await rm(stored.filePath, { force: true });
      throw err;
    }
  });

  app.get('/api/datasets/:id/versions', async (req) => {
    const user = requireUser(req);
    const { id } = datasetParamsSchema.parse(req.params);
    return datasets.listVersions(id, user.id);
  });

  app.get('/api/datasets/:id/preview', async (req) => {
    const user = requireUser(req);
    const { id } = datasetParamsSchema.parse(req.params);
    const q = previewQuerySchema.parse(req.query);
    const ds = await datasets.requireDataset(id, user.id, 'read');
    return datasets.preview(ds, q);
  });

  app.get('/api/datasets/:id/profile', async (req) => {
    const user = requireUser(req);
    const { id } = datasetParamsSchema.parse(req.params);
    const q = profileQuerySchema.parse(req.query);
    const ds = await datasets.requireDataset(id, user.id, 'read');
    return datasets.profile(ds, q);
  });
}
