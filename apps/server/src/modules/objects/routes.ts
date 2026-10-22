import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { aggregateRequestSchema, getObjectParamsSchema, queryObjectsRequestSchema } from './schemas.js';
import type { ObjectsService } from './service.js';

export function registerObjectRoutes(app: FastifyInstance, deps: { objects: ObjectsService; resources: ResourcesService }): void {
  app.post('/api/projects/:pid/objects/query', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.objects.query(pid, queryObjectsRequestSchema.parse(req.body));
  });

  app.post('/api/projects/:pid/objects/aggregate', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.objects.aggregate(pid, aggregateRequestSchema.parse(req.body));
  });

  app.get('/api/projects/:pid/objects/:type/:pk', async (req) => {
    const { pid, type, pk } = getObjectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.objects.getObject(pid, type, pk);
  });
}
