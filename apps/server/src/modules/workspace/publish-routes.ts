import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import type { PublishService } from './publish.js';

export const publishBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  message: z.string().min(1).max(500),
});

// POST /workspace/publish (04-api §1): refuses on validation errors, stale revisions or a running publish.
export function registerPublishRoutes(app: FastifyInstance, deps: { publish: PublishService; resources: ResourcesService }): void {
  app.post('/api/projects/:pid/workspace/publish', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, deps.resources, pid, 'write');
    const body = publishBodySchema.parse(req.body);
    return deps.publish.publish({ projectId: pid, userId: user.id, via: 'ui', ...body });
  });
}
