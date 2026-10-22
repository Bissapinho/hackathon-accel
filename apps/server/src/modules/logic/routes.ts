import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { logicTestRequestSchema } from './schemas.js';
import type { LogicService } from './service.js';

export function registerLogicRoutes(app: FastifyInstance, services: { logic: LogicService; resources: ResourcesService }): void {
  // Evaluates draft logic on published objects (04-api, Workspace routes).
  app.post('/api/projects/:pid/workspace/draft/logic/test', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, services.resources, pid, 'read');
    const body = logicTestRequestSchema.parse(req.body);
    return services.logic.testDraftLogic(pid, body);
  });
}
