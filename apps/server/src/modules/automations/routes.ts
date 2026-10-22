import type { FastifyInstance } from 'fastify';
import { requireProject, requireUser } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { automationParamsSchema, eventsQuerySchema, notificationParamsSchema, notificationsQuerySchema } from './schemas.js';
import type { AutomationsService } from './service.js';

export function registerAutomationRoutes(
  app: FastifyInstance,
  deps: { automations: AutomationsService; resources: ResourcesService },
): void {
  const { automations, resources } = deps;

  app.get('/api/projects/:pid/automations', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return automations.list(pid);
  });

  app.post('/api/projects/:pid/automations/:id/enable', async (req) => {
    const { pid, id } = automationParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    return automations.enable(pid, id, user);
  });

  app.post('/api/projects/:pid/automations/:id/disable', async (req) => {
    const { pid, id } = automationParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'write');
    return automations.disable(pid, id);
  });

  app.get('/api/projects/:pid/automations/:id/events', async (req) => {
    const { pid, id } = automationParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return automations.events(pid, id, eventsQuerySchema.parse(req.query).limit);
  });

  app.get('/api/notifications', async (req) => {
    const user = requireUser(req);
    const q = notificationsQuerySchema.parse(req.query);
    return automations.listNotifications(user.id, { unread: q.unread, limit: q.limit });
  });

  app.post('/api/notifications/:id/read', async (req) => {
    const user = requireUser(req);
    const { id } = notificationParamsSchema.parse(req.params);
    return automations.markRead(user.id, id);
  });
}
