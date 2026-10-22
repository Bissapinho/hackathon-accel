import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerWorkspaceRoutes } from './modules/workspace/routes.js';

// Part A routes (owner: Alexandre): datasets, jobs, workspace, pipelines, objects, logic, actions.
export async function registerAlexandre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  registerWorkspaceRoutes(app, { workspace: ctx.services.workspace, resources: ctx.services.resources });
}
