import type { AppDef, FieldError, WorkspaceDoc } from '@mini/shared';
import { notFound } from '../../errors.js';
import type { WorkspaceService } from '../workspace/service.js';
import { validateStructure } from '../workspace/validate.js';

export type AppSummary = { id: string; name: string; description: string; pages: number };

// Pure: validate one AppDef against the object types, links, logic and actions of `doc`.
// Everything the blocks reference (types, properties, links, rules, object lists, actions) is checked by
// the workspace validator; only the errors under the app are returned. Nothing is stored.
export function validateAppDef(app: AppDef, doc: WorkspaceDoc): { errors: FieldError[]; warnings: FieldError[] } {
  const others = doc.apps.filter((a) => a.id !== app.id);
  const { errors, warnings } = validateStructure({ ...doc, apps: [app, ...others] });
  const mine = (e: FieldError) => e.path.startsWith('apps[0]');
  const rewrite = (e: FieldError): FieldError => ({ ...e, path: e.path.replace(/^apps\[0\]/, 'app') });
  return { errors: errors.filter(mine).map(rewrite), warnings: warnings.filter(mine).map(rewrite) };
}

export function createAppsService(deps: { workspace: WorkspaceService }) {
  const { workspace } = deps;

  // Apps of the latest published workspace; the front renders them, so only published ones are served.
  async function list(projectId: string): Promise<AppSummary[]> {
    const latest = await workspace.latestPublished(projectId);
    return (latest?.doc.apps ?? []).map((a) => ({ id: a.id, name: a.name, description: a.description, pages: a.pages.length }));
  }

  async function get(projectId: string, appId: string): Promise<AppDef> {
    const latest = await workspace.latestPublished(projectId);
    if (!latest) throw notFound(`App "${appId}"`, 'nothing has been published in this project yet', 'Publish a workspace that contains the app.');
    const app = latest.doc.apps.find((a) => a.id === appId);
    if (!app) {
      const known = latest.doc.apps.map((a) => a.id);
      throw notFound(
        `App "${appId}"`,
        `the published workspace (version ${latest.version}) has no app with that id`,
        known.length ? `Published apps: ${known.join(', ')}.` : 'No app is published yet.',
      );
    }
    return app;
  }

  // Dry-run: checks an AppDef against the draft (what the agent would publish), never stores it.
  async function validateAgainstDraft(projectId: string, app: AppDef) {
    const draft = await workspace.getDraft(projectId);
    return validateAppDef(app, draft.doc);
  }

  return { list, get, validateAgainstDraft };
}

export type AppsService = ReturnType<typeof createAppsService>;
