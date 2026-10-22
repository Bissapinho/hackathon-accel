import { createObjectsService } from './modules/objects/service.js';
import { createResourcesService } from './modules/resources/service.js';
import type { AppDeps } from './services.js';

// Part A services (owner: Alexandre). Add datasets, jobs, workspace, pipelines, objects, logic, actions here.
export function buildAlexandreServices(deps: AppDeps) {
  return {
    resources: createResourcesService(deps.db),
    objects: createObjectsService(deps.db),
  };
}
