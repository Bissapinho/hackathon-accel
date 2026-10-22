import { createDatasetsService } from './modules/datasets/service.js';
import { createJobsService } from './modules/jobs/service.js';
import { createResourcesService } from './modules/resources/service.js';
import type { AppDeps } from './services.js';

// Part A services (owner: Alexandre). Add datasets, jobs, workspace, pipelines, objects, logic, actions here.
export function buildAlexandreServices(deps: AppDeps) {
  const resources = createResourcesService(deps.db);
  const jobs = createJobsService({ db: deps.db, resources });
  const datasets = createDatasetsService({
    db: deps.db,
    pool: deps.pool,
    config: deps.config,
    resources,
    onProfileDone: deps.onProfileDone,
    kickJobs: () => jobs.kick(),
  });
  jobs.setHandler('profile', (versionId, progress) => datasets.runProfileJob(versionId, progress));
  return { resources, jobs, datasets };
}
