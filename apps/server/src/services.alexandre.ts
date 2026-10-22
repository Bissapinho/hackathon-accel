import { createActionsService } from './modules/actions/service.js';
import { createAutomationsService } from './modules/automations/service.js';
import { createDatasetsService } from './modules/datasets/service.js';
import { createJobsService } from './modules/jobs/service.js';
import { createLogicService } from './modules/logic/service.js';
import { createObjectsService } from './modules/objects/service.js';
import { createPipelinesService } from './modules/pipelines/service.js';
import { createResourcesService } from './modules/resources/service.js';
import { createPublishService } from './modules/workspace/publish.js';
import { createWorkspaceService } from './modules/workspace/service.js';
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
  // Data checks of workspace validation (T-13) run through the pipelines service, which reads the draft
  // through the workspace service: the checker is bound late to break that cycle.
  const workspace = createWorkspaceService({
    db: deps.db,
    semantics: deps.semantics,
    dataChecker: { check: (doc, ctx) => pipelines.checkWorkspaceData(doc, ctx) },
  });
  const pipelines = createPipelinesService({ db: deps.db, config: deps.config, workspace });
  jobs.setHandler('profile', (versionId, progress) => datasets.runProfileJob(versionId, progress));
  const objects = createObjectsService(deps.db);
  const actions = createActionsService(deps.db, workspace);
  const publish = createPublishService({ db: deps.db, config: deps.config, workspace, pipelines, semantics: deps.semantics });
  // Automations (T-32) are evaluated after every publish and every applied action run. Runs the automations
  // themselves start are handled inside the evaluation, so they don't re-enter here.
  const automations = createAutomationsService({ db: deps.db, objects, actions, resources });
  publish.onPublished((projectId) => automations.evaluate(projectId, 'publish').then(() => undefined));
  actions.onApplied((run) => (run.via === 'automation' ? Promise.resolve() : automations.evaluate(run.projectId, 'action_run').then(() => undefined)));
  return {
    resources,
    jobs,
    datasets,
    pipelines,
    logic: createLogicService({ db: deps.db, config: deps.config, workspace }),
    objects,
    actions,
    automations,
    workspace,
    publish,
  };
}
