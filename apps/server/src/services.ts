import type pg from 'pg';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { OnProfileDone, SemanticsPort } from './ports.js';
import { buildAlexandreServices } from './services.alexandre.js';
import { buildAlfredServices } from './services.alfred.js';

// Everything a service builder may need. Built once in main.ts (or a test).
export type AppDeps = {
  config: Config;
  db: Db;
  pool: pg.Pool; // raw connections, for COPY (datasets)
  semantics: SemanticsPort;
  onProfileDone: OnProfileDone;
};

// The object of all service modules, passed to routes and to agent tools (09 §4.4).
// Each part adds its services in its own file so neither edits the other's.
export type Services = ReturnType<typeof buildAlexandreServices> & ReturnType<typeof buildAlfredServices>;

export function buildServices(deps: AppDeps): Services {
  return { ...buildAlexandreServices(deps), ...buildAlfredServices(deps) };
}
