import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { patchDraftBodySchema, workspaceQuerySchema } from './schemas.js';
import type { WorkspaceService } from './service.js';

// Workspace routes of 04-api §1 (draft, validate, diff, discard, history). Publish and previews: T-12 / T-14.
export function registerWorkspaceRoutes(app: FastifyInstance, deps: { workspace: WorkspaceService; resources: ResourcesService }): void {
  const { workspace, resources } = deps;

  app.get('/api/projects/:pid/workspace', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    const { version } = workspaceQuerySchema.parse(req.query);
    if (version === 'draft') return { draft: await workspace.getDraft(pid) };
    const published = await workspace.getPublished(pid, version);
    return { version: published.version, doc: published.doc };
  });

  app.patch('/api/projects/:pid/workspace/draft', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    const { expectedRevision, ops } = patchDraftBodySchema.parse(req.body);
    return workspace.patchDraft(pid, user.id, expectedRevision, ops);
  });

  app.post('/api/projects/:pid/workspace/draft/validate', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'write');
    return workspace.validateDraft(pid);
  });

  app.get('/api/projects/:pid/workspace/draft/diff', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return workspace.diffDraft(pid);
  });

  app.post('/api/projects/:pid/workspace/draft/discard', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    return workspace.discardDraft(pid, user.id);
  });

  app.get('/api/projects/:pid/workspace/history', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, resources, pid, 'read');
    return workspace.history(pid);
  });
}
