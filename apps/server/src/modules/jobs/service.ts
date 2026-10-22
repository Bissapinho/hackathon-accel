import type { Job } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import type { ResourcesService } from '../resources/service.js';

// Background jobs (meta.jobs), run in-process one at a time: the deployed database has one CPU
// (01-architecture §9 rule 3). Jobs are inserted by the services that need them, then `kick()` runs them.

export type JobHandler = (target: string, progress: (p: number) => Promise<void>) => Promise<{ note?: string }>;

type Log = { info(obj: object, msg: string): void; error(obj: object, msg: string): void };

export function createJobsService(deps: { db: Db; resources: ResourcesService; log?: Log }) {
  const { db } = deps;
  const handlers = new Map<Job['kind'], JobHandler>();
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;

  function setHandler(kind: Job['kind'], handler: JobHandler): void {
    handlers.set(kind, handler);
  }

  // Jobs left `running` by a stopped server are run again.
  async function recover(): Promise<void> {
    await db.updateTable('meta.jobs').set({ status: 'queued', progress: 0 }).where('status', '=', 'running').execute();
  }

  async function claimNext() {
    const res = await sql<{ id: string; kind: Job['kind']; target: string }>`
      UPDATE meta.jobs SET status = 'running', progress = 0
      WHERE id = (
        SELECT id FROM meta.jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, target`.execute(db);
    return res.rows[0];
  }

  async function drain(): Promise<void> {
    do {
      again = false;
      for (let job = await claimNext(); job && !stopped; job = await claimNext()) {
        const handler = handlers.get(job.kind);
        const id = job.id;
        try {
          if (!handler) throw new Error(`no handler for job kind ${job.kind}`);
          const { note } = await handler(job.target, async (p) => {
            await db.updateTable('meta.jobs').set({ progress: Math.min(1, Math.max(0, p)) }).where('id', '=', id).execute();
          });
          await db
            .updateTable('meta.jobs')
            .set({ status: 'done', progress: 1, error: note ?? null, finished_at: new Date() })
            .where('id', '=', id)
            .execute();
        } catch (err) {
          deps.log?.error({ err, jobId: id }, 'job failed');
          await db
            .updateTable('meta.jobs')
            .set({ status: 'failed', error: (err as Error).message, finished_at: new Date() })
            .where('id', '=', id)
            .execute();
        }
      }
    } while (again && !stopped);
  }

  // Starts running queued jobs if nothing is running; never throws.
  function kick(): void {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = drain()
      .catch((err) => deps.log?.error({ err }, 'job runner stopped on an error'))
      .finally(() => {
        running = null;
      });
  }

  // Resolves when no job is running and none is queued (tests, seed script).
  async function waitIdle(): Promise<void> {
    for (;;) {
      if (running) {
        await running;
        continue;
      }
      const queued = await db
        .selectFrom('meta.jobs')
        .select('id')
        .where('status', 'in', ['queued', 'running'])
        .limit(1)
        .executeTakeFirst();
      if (!queued) return;
      kick();
      if (!running) return;
    }
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (running) await running;
  }

  async function listJobs(projectId: string, userId: string, status?: Job['status']): Promise<Job[]> {
    await deps.resources.requireAccess(projectId, userId, 'read');
    let q = db
      .selectFrom('meta.jobs')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc')
      .limit(200);
    if (status) q = q.where('status', '=', status);
    const rows = await q.execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      target: r.target,
      status: r.status,
      progress: r.progress,
      ...(r.error ? { error: r.error } : {}),
      createdAt: r.created_at.toISOString(),
      ...(r.finished_at ? { finishedAt: r.finished_at.toISOString() } : {}),
    }));
  }

  return { setHandler, recover, kick, waitIdle, stop, listJobs };
}

export type JobsService = ReturnType<typeof createJobsService>;
