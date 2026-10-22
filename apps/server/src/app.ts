import multipart from '@fastify/multipart';
import type { Health } from '@mini/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { buildToolRegistry } from './agent/registry.js';
import type { AnyToolDef } from './agent/tools/types.js';
import { installAuth } from './auth.js';
import { installErrorHandler } from './errors.js';
import { registerResourceRoutes } from './modules/resources/routes.js';
import { registerAlexandre } from './register.alexandre.js';
import { registerAlfred } from './register.alfred.js';
import { buildServices, type AppDeps, type Services } from './services.js';

export type AppContext = AppDeps & { services: Services; tools: Map<string, AnyToolDef> };

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const services = buildServices(deps);
  const ctx: AppContext = { ...deps, services, tools: buildToolRegistry() };

  const app = Fastify({ logger: opts.logger ?? false });
  installErrorHandler(app);
  await installAuth(app, { cookieSecret: deps.config.COOKIE_SECRET, resources: services.resources });
  await app.register(multipart, { limits: { fileSize: deps.config.UPLOAD_MAX_MB * 1024 * 1024 } });

  app.get('/api/health', async () => {
    let db: Health['db'] = 'ok';
    try {
      await sql`SELECT 1`.execute(deps.db);
    } catch {
      db = 'down';
    }
    const health: Health = { ok: db === 'ok', db };
    return health;
  });

  registerResourceRoutes(app, services.resources);
  await registerAlexandre(app, ctx);
  await registerAlfred(app, ctx);

  return { app, ctx };
}
