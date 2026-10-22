import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createPool } from '../src/db/pool.js';
import { TEST_DATABASE_URL } from './helpers.js';
import { writeKumoLike } from './kumo-like.js';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../../../scripts/seed-kumo.ts', import.meta.url));
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

let db: Db;
beforeAll(() => {
  db = createDb(createPool({ connectionString: TEST_DATABASE_URL, max: 1 }));
});
afterAll(async () => {
  await db.destroy();
});

describe('T-08 pnpm seed:kumo', () => {
  it('loads every CSV of a folder into "Kumo 2025", ignores other files and waits for the profiles', async () => {
    const kumo = writeKumoLike();
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, INIT_CWD: kumo.dir };
    delete env.DATABASE_CA_CERT;
    const out = await run(process.execPath, ['--import', 'tsx', SCRIPT, '.', '--skip', 'ARTICLES_NETSUITE'], {
      cwd: SERVER_DIR,
      env,
      timeout: 120_000,
    });
    expect(out.stdout).toMatch(/skip\s+ARTICLES_NETSUITE/);
    expect(out.stdout).toMatch(/profiles: \d+ done, 0 failed/);
    expect(out.stdout).not.toMatch(/README/);

    const rows = await db
      .selectFrom('meta.datasets as d')
      .innerJoin('meta.projects as p', 'p.id', 'd.project_id')
      .innerJoin('meta.dataset_versions as v', (j) => j.onRef('v.dataset_id', '=', 'd.id').onRef('v.version', '=', 'd.current_version'))
      .select(['d.name', 'v.profile_status'])
      .where('p.name', '=', 'Kumo 2025')
      .execute();
    const byName = new Map(rows.map((r) => [r.name, r.profile_status]));
    expect(byName.get('COMMANDES_NETSUITE_2025')).toBe('done');
    expect(byName.get('CLIENTS_NETSUITE')).toBe('done');

    // A second run leaves existing datasets alone.
    const again = await run(process.execPath, ['--import', 'tsx', SCRIPT, '.'], { cwd: SERVER_DIR, env, timeout: 120_000 });
    expect(again.stdout).toMatch(/exists\s+CLIENTS_NETSUITE/);
  }, 180_000);
});
