import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../app.js';
import type { AppDeps } from '../../services.js';
import { registerAgentHttpRoutes } from './routes.js';
import { AgentService } from './service.js';

export { AgentEventHub } from './events.js';
export { createFreshFactsProvider, type FreshFactsProvider } from './facts.js';
export { AgentService, type AgentRuntimeDeps } from './service.js';
export { AgentStore, estimateTokens, toItemView } from './store.js';
export type { AgentSessionView, AgentSessionWithItems } from './schemas.js';

export const DEFAULT_CONTEXT_BUDGET = 200_000;

/** LLM_MAX_CONTEXT_TOKENS (05-agent §7), read here rather than in src/config.ts (Part A's file). */
export function contextBudgetFromEnv(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.LLM_MAX_CONTEXT_TOKENS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CONTEXT_BUDGET;
}

/** Part B service entry for services.alfred.ts. The loop is attached by registerAgentRoutes. */
export function buildAgentServices(deps: Pick<AppDeps, 'db'> & { env?: Record<string, string | undefined> }) {
  return { agent: new AgentService({ db: deps.db, tokenBudget: contextBudgetFromEnv(deps.env) }) };
}

/** Binds the loop to the app (services, registry, semantics port, gateway) and registers the agent routes. */
export function registerAgentRoutes(app: FastifyInstance, ctx: AppContext): void {
  ctx.services.agent.attach({
    services: ctx.services,
    tools: ctx.tools,
    semantics: ctx.semantics,
    log: (message, err) => app.log.error({ err }, message),
  });
  registerAgentHttpRoutes(app, ctx.services);
}
