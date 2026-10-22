import { createObjectsService } from './modules/objects/service.js';
import { createPipelinesService } from './modules/pipelines/service.js';
import { createResourcesService } from './modules/resources/service.js';
import type { AppDeps } from './services.js';

// Part A services (owner: Alexandre). Add datasets, jobs, workspace, pipelines, objects, logic, actions here.
export function buildAlexandreServices(deps: AppDeps) {
  return {
    resources: createResourcesService(deps.db),
    pipelines: createPipelinesService({ db: deps.db, config: deps.config }),
    objects: createObjectsService(deps.db),
  };
}
