// pnpm seed:kumo <folder> [--skip NAME ...] [--replace]
// Uploads every .csv / .csv.gz of a folder into the project "Kumo 2025" as Ada, then waits for the
// background profiles (task T-08). Works on fixtures/kumo-mini and on the real files, locally or on Aiven.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../apps/server/src/config.js';
import { createDb } from '../apps/server/src/db/index.js';
import { createPool } from '../apps/server/src/db/pool.js';
import { initReadOnly } from '../apps/server/src/db/readonly.js';
import { SEED_PROJECT_NAME, SEED_USERS } from '../apps/server/src/db/seed.js';
import { buildServices } from '../apps/server/src/services.js';
import { ports } from '../apps/server/src/wiring.js';

// Generated tables, tagged as simulated everywhere (02-slice-and-demo §3).
const SIMULATED = new Set(['CUISINES_REFERENTIEL', 'CAPACITE_CUISINES_JOUR_2025', 'STOCKS_MAGASINS_JOUR_2025']);
const FILE_RE = /\.csv(\.gz)?$/i;

function parseArgs(argv: string[]) {
  const skip = new Set<string>();
  let folder: string | undefined;
  let replace = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--skip') skip.add(argv[++i] ?? '');
    else if (a === '--replace') replace = true;
    else if (a === '--') continue;
    else folder = a;
  }
  if (!folder) {
    console.error('usage: pnpm seed:kumo <folder> [--skip NAME ...] [--replace]');
    process.exit(2);
  }
  // pnpm runs the script from apps/server; paths are relative to where the command was typed.
  return { folder: path.resolve(process.env.INIT_CWD ?? process.cwd(), folder), skip, replace };
}

const datasetName = (file: string) => file.replace(/\.gz$/i, '').replace(/\.csv$/i, '');

const { folder, skip, replace } = parseArgs(process.argv.slice(2));
const config = loadConfig();
const pool = createPool({ connectionString: config.DATABASE_URL, caCertPath: config.DATABASE_CA_CERT, max: 2 });
initReadOnly(pool);
const db = createDb(pool);
const services = buildServices({ config, db, pool, ...ports });

try {
  const owner = await db
    .selectFrom('meta.users')
    .select('id')
    .where('email', '=', SEED_USERS[0]!.email)
    .executeTakeFirst();
  const project = await db.selectFrom('meta.projects').select('id').where('name', '=', SEED_PROJECT_NAME).executeTakeFirst();
  if (!owner || !project) throw new Error('Run pnpm db:migrate && pnpm db:seed first.');

  const files = readdirSync(folder)
    .filter((f) => FILE_RE.test(f) && statSync(path.join(folder, f)).isFile())
    .sort();
  if (files.length === 0) throw new Error(`No .csv or .csv.gz file in ${folder}.`);

  const existing = new Map(
    (await services.datasets.listDatasets(project.id, owner.id)).map((d) => [d.name, d.id] as const),
  );

  await services.jobs.recover();
  for (const file of files) {
    const name = datasetName(file);
    if (skip.has(name)) {
      console.log(`skip     ${name}`);
      continue;
    }
    const datasetId = existing.get(name);
    if (datasetId && !replace) {
      console.log(`exists   ${name} (use --replace to load a new version)`);
      continue;
    }
    const started = Date.now();
    const v = await services.datasets.ingest({
      projectId: project.id,
      userId: owner.id,
      filePath: path.join(folder, file),
      originalName: file,
      name,
      transactionType: 'SNAPSHOT',
      ...(datasetId ? { datasetId } : {}),
      simulated: SIMULATED.has(name),
      onProgress: (rows) => process.stdout.write(`\r  ${name}: ${rows.toLocaleString('en')} rows`),
    });
    process.stdout.write('\r');
    console.log(
      `loaded   ${name} v${v.version}: ${v.rowCount} rows, ${v.columns.length} columns, ` +
        `${v.parseErrors.length} parse errors (${((Date.now() - started) / 1000).toFixed(1)} s)`,
    );
  }

  console.log('waiting for the background profiles…');
  services.jobs.kick();
  await services.jobs.waitIdle();
  const jobs = await services.jobs.listJobs(project.id, owner.id);
  const failed = jobs.filter((j) => j.status === 'failed');
  const notes = jobs.filter((j) => j.status === 'done' && j.error);
  for (const j of failed) console.error(`profile failed (job ${j.id}): ${j.error}`);
  for (const j of notes) console.warn(`profile note (job ${j.id}): ${j.error}`);
  console.log(`profiles: ${jobs.filter((j) => j.status === 'done').length} done, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
} finally {
  await services.jobs.stop();
  await db.destroy();
}
