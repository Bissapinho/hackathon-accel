import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerObjectRoutes } from './modules/objects/routes.js';

// Part A routes (owner: Alexandre): datasets, jobs, workspace, pipelines, objects, logic, actions.
export async function registerAlexandre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  registerObjectRoutes(app, ctx.services);
}
