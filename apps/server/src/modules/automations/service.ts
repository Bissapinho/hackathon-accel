import type { AutomationDef, AutomationEffect, ObjectRef, ObjectSet, ValueExpr, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import { ApiError, notFound } from '../../errors.js';
import { renderTemplate } from '../actions/evaluate.js';
import type { ActionsService } from '../actions/service.js';
import type { ObjectsService } from '../objects/service.js';
import type { User } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import type { AutomationEvent, AutomationStateView, AutomationView, EffectOutcome, NotificationView } from './schemas.js';

// Automations (T-32, 04-api §7). An automation fires its effects for the objects that newly enter the set
// of its condition. Evaluated after every publish and every applied action run, one evaluation at a time
// per project. Enabling records the current members without firing. Automations live in the PUBLISHED
// workspace; this service only holds their on/off state, the members and the event log.

type Trigger = AutomationEvent['trigger'];
type StateRow = { automation_id: string; enabled: boolean; enabled_by: string | null; members: string[]; evaluated_at: Date | null };
type EventRow = { id: string; automation_id: string; trigger: Trigger; entered: string[]; effects: EffectOutcome[]; fired_at: Date };

const MEMBER_PAGE = 500; // MAX_PAGE_SIZE of the objects API
const MAX_MEMBERS = 50_000;
const MAX_PASSES = 5; // an automation's action can enter another automation's set; stop chains that never end

const toEvent = (r: EventRow): AutomationEvent => ({
  id: r.id,
  automationId: r.automation_id,
  trigger: r.trigger,
  entered: r.entered,
  effects: r.effects,
  firedAt: r.fired_at.toISOString(),
});

export function createAutomationsService(deps: {
  db: Db;
  objects: Pick<ObjectsService, 'query' | 'getObject'>;
  actions: Pick<ActionsService, 'runAction'>;
  resources: Pick<ResourcesService, 'getUser'>;
}) {
  const { db, objects, actions, resources } = deps;
  const queues = new Map<string, Promise<unknown>>();

  // ── Published definitions ──

  async function publishedDoc(projectId: string): Promise<WorkspaceDoc | null> {
    const res = await sql<{ doc: WorkspaceDoc }>`
      SELECT doc FROM meta.workspace_versions WHERE project_id = ${projectId} ORDER BY version DESC LIMIT 1`.execute(db);
    return res.rows[0]?.doc ?? null;
  }

  async function requireDef(projectId: string, id: string): Promise<AutomationDef> {
    const doc = await publishedDoc(projectId);
    if (!doc) throw notFound(`The automation "${id}"`, 'nothing has been published in this project yet', 'Publish the workspace draft first.');
    const def = (doc.automations ?? []).find((a) => a.id === id);
    if (!def) {
      const ids = (doc.automations ?? []).map((a) => a.id);
      throw notFound(
        `The automation "${id}"`,
        "it isn't in the published workspace",
        ids.length ? `Published automations: ${ids.join(', ')}.` : 'No automation is published yet. Add one to the draft and publish it.',
      );
    }
    return def;
  }

  async function stateRows(projectId: string): Promise<StateRow[]> {
    const res = await sql<StateRow>`
      SELECT automation_id, enabled, enabled_by, members, evaluated_at FROM meta.automation_state WHERE project_id = ${projectId}`.execute(db);
    return res.rows;
  }

  // Primary keys of the objects in a set now (read through logic.*, so rules and derived values count).
  async function currentMembers(projectId: string, set: ObjectSet): Promise<ObjectRef[]> {
    const keys: ObjectRef[] = [];
    let pageToken: string | undefined;
    do {
      const page = await objects.query(projectId, { set, select: [], pageSize: MEMBER_PAGE, ...(pageToken ? { pageToken } : {}) });
      for (const r of page.rows) keys.push(r.ref);
      pageToken = page.nextPageToken;
    } while (pageToken && keys.length < MAX_MEMBERS);
    return keys;
  }

  // ── Read and switch ──

  async function lastEvents(projectId: string, id?: string, limit = 1): Promise<AutomationEvent[]> {
    const res = await sql<EventRow>`
      SELECT id, automation_id, trigger, entered, effects, fired_at FROM meta.automation_events
      WHERE project_id = ${projectId} ${id ? sql`AND automation_id = ${id}` : sql``}
      ORDER BY fired_at DESC, id LIMIT ${limit}`.execute(db);
    return res.rows.map(toEvent);
  }

  async function list(projectId: string): Promise<AutomationView[]> {
    const doc = await publishedDoc(projectId);
    const defs = doc?.automations ?? [];
    if (defs.length === 0) return [];
    const states = new Map((await stateRows(projectId)).map((s) => [s.automation_id, s]));
    const latest = await sql<EventRow>`
      SELECT DISTINCT ON (automation_id) id, automation_id, trigger, entered, effects, fired_at FROM meta.automation_events
      WHERE project_id = ${projectId} ORDER BY automation_id, fired_at DESC, id`.execute(db);
    const last = new Map(latest.rows.map((r) => [r.automation_id, toEvent(r)]));
    return defs.map((def) => ({ def, enabled: states.get(def.id)?.enabled === true, lastEvent: last.get(def.id) ?? null }));
  }

  async function get(projectId: string, id: string): Promise<AutomationView> {
    const def = await requireDef(projectId, id);
    const state = (await stateRows(projectId)).find((s) => s.automation_id === id);
    return { def, enabled: state?.enabled === true, lastEvent: (await lastEvents(projectId, id, 1))[0] ?? null };
  }

  async function events(projectId: string, id: string, limit = 20): Promise<AutomationEvent[]> {
    await requireDef(projectId, id);
    return lastEvents(projectId, id, limit);
  }

  // Enabling records who is "currentUser" and the objects already in the set; nothing fires for them.
  async function enable(projectId: string, id: string, user: User): Promise<AutomationStateView> {
    const def = await requireDef(projectId, id);
    const existing = (await stateRows(projectId)).find((s) => s.automation_id === id);
    if (existing?.enabled) return { automationId: id, enabled: true, enabledBy: existing.enabled_by, evaluatedAt: existing.evaluated_at?.toISOString() ?? null };
    const members = (await currentMembers(projectId, def.condition.set)).map((r) => r.primaryKey);
    const res = await sql<StateRow>`
      INSERT INTO meta.automation_state (project_id, automation_id, enabled, enabled_by, members, evaluated_at)
      VALUES (${projectId}, ${id}, true, ${user.id}, ${members}::text[], now())
      ON CONFLICT (project_id, automation_id)
      DO UPDATE SET enabled = true, enabled_by = EXCLUDED.enabled_by, members = EXCLUDED.members, evaluated_at = now()
      RETURNING automation_id, enabled, enabled_by, members, evaluated_at`.execute(db);
    const r = res.rows[0]!;
    return { automationId: id, enabled: true, enabledBy: r.enabled_by, evaluatedAt: r.evaluated_at?.toISOString() ?? null };
  }

  async function disable(projectId: string, id: string): Promise<AutomationStateView> {
    await requireDef(projectId, id);
    const res = await sql<StateRow>`
      INSERT INTO meta.automation_state (project_id, automation_id, enabled) VALUES (${projectId}, ${id}, false)
      ON CONFLICT (project_id, automation_id) DO UPDATE SET enabled = false
      RETURNING automation_id, enabled, enabled_by, members, evaluated_at`.execute(db);
    const r = res.rows[0]!;
    return { automationId: id, enabled: false, enabledBy: r.enabled_by, evaluatedAt: r.evaluated_at?.toISOString() ?? null };
  }

  // ── Evaluation ──

  // Runs after every publish and every applied action run. Errors never reach the caller: the publish or
  // the action already happened.
  function evaluate(projectId: string, trigger: Trigger): Promise<AutomationEvent[]> {
    const run = (queues.get(projectId) ?? Promise.resolve()).catch(() => undefined).then(() => evaluateNow(projectId, trigger));
    queues.set(projectId, run);
    const clear = () => {
      if (queues.get(projectId) === run) queues.delete(projectId);
    };
    run.then(clear, clear);
    return run;
  }

  async function evaluateNow(projectId: string, trigger: Trigger): Promise<AutomationEvent[]> {
    const fired: AutomationEvent[] = [];
    const blocked = new Set<string>(); // automations whose action already ran in this evaluation
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const doc = await publishedDoc(projectId);
      if (!doc) return fired;
      const states = (await stateRows(projectId)).filter((s) => s.enabled);
      let ranAction = false;
      for (const state of states) {
        if (blocked.has(state.automation_id)) continue;
        const def = (doc.automations ?? []).find((a) => a.id === state.automation_id);
        if (!def) continue; // removed by a later publish: nothing to evaluate
        let refs: ObjectRef[];
        try {
          refs = await currentMembers(projectId, def.condition.set);
        } catch {
          continue; // the set no longer compiles against the published objects; keep the last members
        }
        const members = refs.map((r) => r.primaryKey);
        const before = new Set(state.members);
        const enteredRefs = refs.filter((r) => !before.has(r.primaryKey));
        const entered = enteredRefs.map((r) => r.primaryKey);
        await sql`
          UPDATE meta.automation_state SET members = ${members}::text[], evaluated_at = now()
          WHERE project_id = ${projectId} AND automation_id = ${def.id}`.execute(db);
        if (entered.length === 0) continue;
        const effects = await runEffects(projectId, def, enteredRefs, state.enabled_by);
        if (effects.some((e) => e.kind === 'runAction' && e.status === 'done')) {
          ranAction = true;
          blocked.add(def.id);
        }
        const inserted = await sql<EventRow>`
          INSERT INTO meta.automation_events (project_id, automation_id, trigger, entered, effects)
          VALUES (${projectId}, ${def.id}, ${trigger}, ${entered}::text[], ${JSON.stringify(effects)}::jsonb)
          RETURNING id, automation_id, trigger, entered, effects, fired_at`.execute(db);
        fired.push(toEvent(inserted.rows[0]!));
      }
      if (!ranAction) break;
    }
    return fired;
  }

  async function runEffects(projectId: string, def: AutomationDef, entered: ObjectRef[], enabledBy: string | null): Promise<EffectOutcome[]> {
    const user = enabledBy ? await resources.getUser(enabledBy) : null;
    const out: EffectOutcome[] = [];
    for (const ref of entered) {
      const scope = await objectScope(projectId, ref);
      for (const effect of def.effects) {
        try {
          out.push(await runEffect(projectId, effect, ref, scope, user));
        } catch (err) {
          out.push({ kind: effect.kind, status: 'failed', message: err instanceof ApiError ? err.message : `The effect failed: ${(err as Error).message}` });
        }
      }
    }
    return out;
  }

  async function objectScope(projectId: string, ref: ObjectRef): Promise<Record<string, unknown>> {
    try {
      const o = await objects.getObject(projectId, ref.objectType, ref.primaryKey);
      return { object: { ref, values: { ...o.properties, ...o.rules } } };
    } catch {
      return { object: { ref, values: {} } };
    }
  }

  async function runEffect(
    projectId: string,
    effect: AutomationEffect,
    ref: ObjectRef,
    scope: Record<string, unknown>,
    user: User | null,
  ): Promise<EffectOutcome> {
    if (effect.kind === 'notify') {
      const ids = new Set<string>();
      for (const r of effect.recipients) {
        if (r.kind === 'currentUser') {
          if (user) ids.add(user.id);
        } else if (await resources.getUser(r.userId).catch(() => null)) {
          ids.add(r.userId);
        }
      }
      if (ids.size === 0) return { kind: 'notify', status: 'skipped', message: 'There was nobody to notify.' };
      const title = renderTemplate(effect.title, scope);
      const body = renderTemplate(effect.body, scope);
      const link = `/p/${projectId}/objects/${ref.objectType}/${ref.primaryKey}`;
      for (const userId of ids) {
        await sql`INSERT INTO meta.notifications (user_id, project_id, title, body, link) VALUES (${userId}, ${projectId}, ${title}, ${body}, ${link})`.execute(db);
      }
      return { kind: 'notify', status: 'done', message: `Notified ${ids.size} ${ids.size === 1 ? 'person' : 'people'}: ${title}` };
    }
    if (!user) return { kind: 'runAction', status: 'failed', message: 'The person who switched this automation on is no longer available.' };
    const params: Record<string, unknown> = {};
    for (const [name, expr] of Object.entries(effect.params)) {
      const v = paramValue(expr, ref, user);
      if (v !== undefined) params[name] = v;
    }
    const res = await actions.runAction({ projectId, user, apiName: effect.action, request: { params }, via: 'automation' });
    return { kind: 'runAction', status: res.status === 'applied' ? 'done' : 'failed', message: res.message };
  }

  // ── Notifications ──

  async function listNotifications(userId: string, opts: { unread?: boolean; limit?: number } = {}): Promise<NotificationView[]> {
    const res = await sql<{ id: string; project_id: string; title: string; body: string; link: string | null; read_at: Date | null; created_at: Date }>`
      SELECT id, project_id, title, body, link, read_at, created_at FROM meta.notifications
      WHERE user_id = ${userId} ${opts.unread ? sql`AND read_at IS NULL` : sql``}
      ORDER BY created_at DESC, id LIMIT ${opts.limit ?? 50}`.execute(db);
    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.read_at !== null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async function markRead(userId: string, id: string): Promise<{ id: string; read: true }> {
    const res = await sql<{ id: string }>`
      UPDATE meta.notifications SET read_at = COALESCE(read_at, now()) WHERE id = ${id} AND user_id = ${userId} RETURNING id`.execute(db);
    if (res.rows.length === 0) throw notFound('The notification', 'it does not exist or belongs to someone else');
    return { id, read: true };
  }

  return { list, get, events, enable, disable, evaluate, listNotifications, markRead };
}

export type AutomationsService = ReturnType<typeof createAutomationsService>;

// triggerObject = the object that entered the set; other expressions can only be constants here.
function paramValue(expr: ValueExpr | { kind: 'triggerObject' }, ref: ObjectRef, user: User): unknown {
  switch (expr.kind) {
    case 'triggerObject':
      return ref;
    case 'literal':
      return expr.value;
    case 'now':
      return new Date().toISOString();
    case 'currentUser':
      return user.displayName;
    default:
      return undefined; // param / paramProperty need an action's parameters: validation refuses them
  }
}
