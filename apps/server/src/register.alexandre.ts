import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerLogicRoutes } from './modules/logic/routes.js';
import { registerObjectRoutes } from './modules/objects/routes.js';
import { registerPipelineRoutes } from './modules/pipelines/routes.js';

// Part A routes (owner: Alexandre): datasets, jobs, workspace, pipelines, objects, logic, actions.
export async function registerAlexandre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  registerPipelineRoutes(app, ctx.services);
  registerLogicRoutes(app, ctx.services);
  registerObjectRoutes(app, ctx.services);
}
