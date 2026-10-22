import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import {
  browseInputSchema, draftOpsSchema, publishInputSchema, recordsQuerySchema, resolveInputSchema, toSemOps,
  trajectoriesQuerySchema, validateInputSchema, versionQuerySchema, workloadSchema,
} from './schemas.js';
import type { SemanticStore } from './store.js';

// Semantics routes (04-api §1 "Semantics (stage 2)", task T-09). Reads: any project member (viewer);
// writes (workload, draft ops, publish): editor or owner. Store errors are ApiErrors already
// (VERSION_CONFLICT 409, SEM_OPS_REJECTED / SEM_OPEN_DECISION / SEM_VALIDATION_FAILED / SQL_REJECTED 400,
// NOT_FOUND 404 for an unknown version).
export function registerSemanticsRoutes(app: FastifyInstance, deps: { semantics: SemanticStore; resources: ResourcesService }): void {
  const { semantics, resources } = deps;
  const base = '/api/projects/:pid/semantics';

  // Overview: SemVersionInfo = {version, status, counts, summary, limitations} + revision (draft), questionLinks, publishedBy/At.
  app.get(base, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    const { version } = versionQuerySchema.parse(req.query);
    return semantics.overview(pid, version);
  });

  app.get(`${base}/records`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    const { version, kind, q, limit } = recordsQuerySchema.parse(req.query);
    return semantics.listRecords(pid, version, { kind, q, limit });
  });

  app.post(`${base}/browse`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return semantics.browse(pid, browseInputSchema.parse(req.body));
  });

  app.post(`${base}/resolve`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return semantics.resolve(pid, resolveInputSchema.parse(req.body));
  });

  app.get(`${base}/workload`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return semantics.getWorkload(pid);
  });

  app.put(`${base}/workload`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'write');
    return semantics.setWorkload(pid, workloadSchema.parse(req.body));
  });

  // {expectedRevision, ops} → {revision, validation}. resolveConstraint records the current user as `by`.
  app.patch(`${base}/draft`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    const { expectedRevision, ops } = draftOpsSchema.parse(req.body);
    return semantics.applyDraftOps(pid, { expectedRevision, ops: toSemOps(ops) }, { userId: user.id });
  });

  // Dry run, writes nothing: any member may check the draft.
  app.post(`${base}/draft/validate`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    const { questionLinks } = validateInputSchema.parse(req.body ?? {});
    return semantics.validateDraft(pid, questionLinks);
  });

  // {expectedRevision, summary, limitations, questionLinks?} → {version, validation}. Without questionLinks,
  // the draft's current links are kept.
  app.post(`${base}/publish`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    const input = publishInputSchema.parse(req.body);
    const questionLinks = input.questionLinks ?? (await semantics.overview(pid, 'draft')).questionLinks;
    return semantics.publish(pid, { ...input, questionLinks }, { userId: user.id });
  });

  app.get(`${base}/versions`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return semantics.listVersions(pid);
  });

  app.get(`${base}/trajectories`, async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    const { limit } = trajectoriesQuerySchema.parse(req.query);
    return semantics.listTrajectories(pid, { limit });
  });
}
