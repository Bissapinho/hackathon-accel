import type { ActionRunResponse } from '@mini/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { actionLogQuerySchema, actionRunParamsSchema, actionRunRequestSchema } from './schemas.js';
import type { ActionsService } from './service.js';

// A refused run is 422 and a crashed one 500; both bodies are the ActionRunResponse plus an ApiError code,
// so clients can read either shape.
function sendRun(reply: FastifyReply, res: ActionRunResponse) {
  if (res.status === 'rejected') return reply.status(422).send({ code: 'ACTION_REJECTED', ...res });
  if (res.status === 'failed') return reply.status(500).send({ code: 'ACTION_FAILED', ...res });
  return reply.send(res);
}

export function registerActionRoutes(
  app: FastifyInstance,
  services: { actions: ActionsService; resources: ResourcesService },
): void {
  app.post('/api/projects/:pid/actions/:apiName/run', async (req, reply) => {
    const { pid, apiName } = actionRunParamsSchema.parse(req.params);
    const user = await requireProject(req, services.resources, pid, 'write');
    const request = actionRunRequestSchema.parse(req.body ?? {});
    const res = await services.actions.runAction({ projectId: pid, user, apiName, request, via: 'ui' });
    return sendRun(reply, res);
  });

  app.post('/api/projects/:pid/workspace/draft/actions/:apiName/test', async (req, reply) => {
    const { pid, apiName } = actionRunParamsSchema.parse(req.params);
    const user = await requireProject(req, services.resources, pid, 'write');
    const request = actionRunRequestSchema.parse(req.body ?? {});
    const res = await services.actions.testDraftAction({ projectId: pid, user, apiName, request, via: 'ui' });
    return sendRun(reply, res);
  });

  app.get('/api/projects/:pid/actions/log', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, services.resources, pid, 'read');
    const q = actionLogQuerySchema.parse(req.query);
    const object = q.objectType && q.primaryKey ? { objectType: q.objectType, primaryKey: q.primaryKey } : undefined;
    return services.actions.listActionLog(pid, { limit: q.limit, action: q.action, object });
  });
}
