import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerSqlRoutes } from './modules/sql/routes.js';

// Part B routes (owner: Alfred): semantics, sql, agent.
export async function registerAlfred(app: FastifyInstance, ctx: AppContext): Promise<void> {
  registerSqlRoutes(app, ctx.services);
}
