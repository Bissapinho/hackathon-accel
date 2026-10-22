import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, requireUser, setSessionCookie } from '../../auth.js';
import { notFound } from '../../errors.js';
import { loginBodySchema, projectParamsSchema, type Me } from './schemas.js';
import type { ResourcesService } from './service.js';

export function registerResourceRoutes(app: FastifyInstance, resources: ResourcesService): void {
  // Login picker for the front and the CLI: the seeded users (no passwords in the slice).
  app.get('/api/users', async () => resources.listUsers());

  app.post('/api/login', async (req, reply) => {
    const { email } = loginBodySchema.parse(req.body);
    const user = await resources.getUserByEmail(email);
    if (!user) throw notFound(`The user ${email}`, 'no seeded user has this email', 'Run pnpm db:seed, then use GET /api/users.');
    setSessionCookie(reply, user.id);
    const me: Me = { user, projects: await resources.listProjectsForUser(user.id) };
    return me;
  });

  app.post('/api/logout', async (_req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/me', async (req) => {
    const user = requireUser(req);
    const me: Me = { user, projects: await resources.listProjectsForUser(user.id) };
    return me;
  });

  app.get('/api/projects/:pid', async (req) => {
    const user = requireUser(req);
    const { pid } = projectParamsSchema.parse(req.params);
    return resources.getProject(pid, user.id);
  });
}
