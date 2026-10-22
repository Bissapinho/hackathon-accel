import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { Services } from '../../services.js';
import { buildsQuerySchema, previewOptionsSchema, previewParamsSchema } from './schemas.js';

export function registerPipelineRoutes(app: FastifyInstance, services: Services): void {
  // 04-api §1 Workspace: run a draft pipeline up to `node` (default: its first output) with a row limit.
  app.post('/api/projects/:pid/workspace/draft/pipelines/:apiName/preview', async (req) => {
    const { pid, apiName } = previewParamsSchema.parse(req.params);
    await requireProject(req, services.resources, pid, 'read');
    const opts = previewOptionsSchema.parse(req.body ?? {});
    return services.pipelines.previewDraftPipeline(pid, apiName, opts);
  });

  app.get('/api/projects/:pid/pipelines/builds', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, services.resources, pid, 'read');
    const { limit } = buildsQuerySchema.parse(req.query);
    return services.pipelines.listBuilds(pid, limit);
  });
}
