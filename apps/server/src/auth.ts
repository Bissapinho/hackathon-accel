import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from './errors.js';
import type { User } from './modules/resources/schemas.js';
import type { Access, ResourcesService } from './modules/resources/service.js';

// Slice auth (04-api intro): a seeded user chosen at login, kept in a signed cookie holding the user id.
export const SESSION_COOKIE = 'mini_uid';

export async function installAuth(app: FastifyInstance, opts: { cookieSecret: string; resources: ResourcesService }) {
  await app.register(cookie, { secret: opts.cookieSecret });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    req.user = await opts.resources.getUser(unsigned.value);
  });
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(SESSION_COOKIE, userId, { path: '/', httpOnly: true, sameSite: 'lax', signed: true });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'You are not logged in.', { hint: 'Log in with POST /api/login.' });
  }
  return req.user;
}

// Route-level guard: logged in + member of the project with the needed access. Returns the user.
export async function requireProject(
  req: FastifyRequest,
  resources: ResourcesService,
  projectId: string,
  access: Access,
): Promise<User> {
  const user = requireUser(req);
  await resources.requireAccess(projectId, user.id, access);
  return user;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}
