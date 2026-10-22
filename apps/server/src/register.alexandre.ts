import type { FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import { registerDatasetRoutes } from './modules/datasets/routes.js';
import { registerJobRoutes } from './modules/jobs/routes.js';

// Part A routes (owner: Alexandre): datasets, jobs, workspace, pipelines, objects, logic, actions.
export async function registerAlexandre(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { datasets, jobs, resources } = ctx.services;
  registerDatasetRoutes(app, { datasets, resources, dataDir: ctx.config.DATA_DIR });
  registerJobRoutes(app, jobs);

  // Background jobs: resume what a stopped server left, then run whatever is queued.
  app.addHook('onReady', async () => {
    await jobs.recover();
    jobs.kick();
  });
  app.addHook('onClose', async () => {
    await jobs.stop();
  });
}
