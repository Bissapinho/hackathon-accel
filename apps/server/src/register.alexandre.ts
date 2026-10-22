import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerActionRoutes } from './modules/actions/routes.js';
import { registerDatasetRoutes } from './modules/datasets/routes.js';
import { registerJobRoutes } from './modules/jobs/routes.js';
import { registerLogicRoutes } from './modules/logic/routes.js';
import { registerObjectRoutes } from './modules/objects/routes.js';
import { registerPipelineRoutes } from './modules/pipelines/routes.js';
import { registerWorkspaceRoutes } from './modules/workspace/routes.js';

// Part A routes (owner: Alexandre): datasets, jobs, workspace, pipelines, objects, logic, actions.
export async function registerAlexandre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { datasets, jobs, resources } = ctx.services;
  registerDatasetRoutes(app, { datasets, resources, dataDir: ctx.config.DATA_DIR });
  registerJobRoutes(app, jobs);
  registerWorkspaceRoutes(app, { workspace: ctx.services.workspace, resources });
  registerPipelineRoutes(app, ctx.services);
  registerLogicRoutes(app, ctx.services);
  registerObjectRoutes(app, ctx.services);
  registerActionRoutes(app, ctx.services);

  // Background jobs: resume what a stopped server left, then run whatever is queued.
  app.addHook('onReady', async () => {
    await jobs.recover();
    jobs.kick();
  });
  app.addHook('onClose', async () => {
    await jobs.stop();
  });
}
