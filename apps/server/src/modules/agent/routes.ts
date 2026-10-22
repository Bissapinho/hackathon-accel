import type { AgentEvent } from '@mini/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireProject } from '../../auth.js';
import type { Access, ResourcesService } from '../resources/service.js';
import {
  answerBodySchema, answerParamsSchema, approvalParamsSchema, createSessionBodySchema, decisionBodySchema, eventsQuerySchema,
  messageBodySchema, projectSessionParamsSchema, sessionParamsSchema,
} from './schemas.js';
import type { AgentService } from './service.js';

// Agent routes (04-api §1 "Agent"). Viewers read sessions and their events; editors and owners write.

const HEARTBEAT_MS = 15_000;

export function registerAgentHttpRoutes(app: FastifyInstance, deps: { agent: AgentService; resources: ResourcesService }): void {
  const { agent, resources } = deps;

  /** Loads the session and checks the caller's role on its project. */
  async function guard(req: FastifyRequest, sid: string, access: Access) {
    const session = await agent.getSession(sid);
    const user = await requireProject(req, resources, session.projectId, access);
    return { session, user };
  }

  app.post('/api/projects/:pid/agent/sessions', async (req, reply) => {
    const { pid } = projectSessionParamsSchema.parse(req.params);
    const user = await requireProject(req, resources, pid, 'write');
    const body = createSessionBodySchema.parse(req.body ?? {});
    return reply.status(201).send(await agent.createSession(pid, user, body.title));
  });

  app.get('/api/agent/sessions/:sid', async (req) => {
    const { sid } = sessionParamsSchema.parse(req.params);
    await guard(req, sid, 'read');
    return agent.getSessionWithItems(sid);
  });

  app.post('/api/agent/sessions/:sid/messages', async (req, reply) => {
    const { sid } = sessionParamsSchema.parse(req.params);
    const { user } = await guard(req, sid, 'write');
    const { text } = messageBodySchema.parse(req.body);
    return reply.status(202).send(await agent.postMessage(sid, user, text));
  });

  app.post('/api/agent/sessions/:sid/approvals/:aid', async (req, reply) => {
    const { sid, aid } = approvalParamsSchema.parse(req.params);
    const { user } = await guard(req, sid, 'write');
    return reply.status(202).send(await agent.decide(sid, aid, user, decisionBodySchema.parse(req.body)));
  });

  app.post('/api/agent/sessions/:sid/answers/:qid', async (req, reply) => {
    const { sid, qid } = answerParamsSchema.parse(req.params);
    const { user } = await guard(req, sid, 'write');
    const { answers } = answerBodySchema.parse(req.body);
    return reply.status(202).send(await agent.answer(sid, qid, user, answers));
  });

  app.post('/api/agent/sessions/:sid/stop', async (req) => {
    const { sid } = sessionParamsSchema.parse(req.params);
    await guard(req, sid, 'write');
    return agent.stop(sid);
  });

  // SSE: `data: <AgentEvent JSON>` per event, `id: <seq>` on item events. On connect: the items after
  // `?after=` / Last-Event-ID (if given), then the current status, then live events.
  app.get('/api/agent/sessions/:sid/events', async (req, reply) => {
    const { sid } = sessionParamsSchema.parse(req.params);
    await guard(req, sid, 'read');
    const query = eventsQuerySchema.parse(req.query);
    const lastEventId = Number(req.headers['last-event-id']);
    const after = query.after ?? (Number.isInteger(lastEventId) && lastEventId >= 0 ? lastEventId : undefined);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (event: AgentEvent) => {
      const id = event.type === 'item' ? `id: ${event.item.seq}\n` : '';
      res.write(`${id}data: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe first so nothing emitted while the backlog is read is lost; buffer until the backlog is sent.
    const buffered: AgentEvent[] = [];
    let live = false;
    const unsubscribe = agent.hub.subscribe(sid, (e) => (live ? send(e) : buffered.push(e)));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.on('close', close);

    try {
      let lastSeq = after ?? 0;
      if (after !== undefined) {
        for (const item of await agent.itemViews(sid, after)) {
          send({ type: 'item', item });
          lastSeq = item.seq;
        }
      }
      const session = await agent.getSession(sid);
      send({ type: 'status', status: session.status, mode: session.mode });
      for (const e of buffered) if (!(e.type === 'item' && e.item.seq <= lastSeq)) send(e);
      live = true;
    } catch (err) {
      req.log.error({ err }, 'agent events stream failed');
      close();
      res.end();
    }
  });
}
