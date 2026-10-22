import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { appDefSchema, appParamsSchema } from './schemas.js';
import type { AppsService } from './service.js';

// 04-api: GET /apps/:appId (latest published AppDef). The list and the validate dry-run are small extras for the front and the agent.
export function registerAppRoutes(app: FastifyInstance, deps: { apps: AppsService; resources: ResourcesService }): void {
  app.get('/api/projects/:pid/apps', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.apps.list(pid);
  });

  app.get('/api/projects/:pid/apps/:appId', async (req) => {
    const { pid, appId } = appParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.apps.get(pid, appId);
  });

  app.post('/api/projects/:pid/apps/validate', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'write');
    return deps.apps.validateAgainstDraft(pid, appDefSchema.parse(req.body));
  });
}
