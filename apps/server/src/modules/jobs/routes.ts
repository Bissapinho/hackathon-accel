import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { JobsService } from './service.js';

const jobsQuerySchema = z.object({ status: z.enum(['queued', 'running', 'done', 'failed']).optional() });

export function registerJobRoutes(app: FastifyInstance, jobs: JobsService): void {
  app.get('/api/projects/:pid/jobs', async (req) => {
    const user = requireUser(req);
    const { pid } = projectParamsSchema.parse(req.params);
    const { status } = jobsQuerySchema.parse(req.query);
    return jobs.listJobs(pid, user.id, status);
  });
}
