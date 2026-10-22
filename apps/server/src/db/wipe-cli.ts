import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

// pnpm db:wipe --yes — deletes every Mini-Foundry schema, table and role from DATABASE_URL (01-architecture §7:
// Kumo data is deleted on the agreed date). Run as the migrating role. On Aiven, deleting the service is preferred.
if (!process.argv.includes('--yes')) {
  console.error('This deletes all Mini-Foundry data in DATABASE_URL. Re-run with: pnpm db:wipe --yes');
  process.exit(1);
}

const config = loadConfig();
const pool = createPool({ connectionString: config.DATABASE_URL, caCertPath: config.DATABASE_CA_CERT, max: 1 });
try {
  await pool.query(`
    DROP SCHEMA IF EXISTS logic, ont, edits, data, meta CASCADE;
    DROP TABLE IF EXISTS public.schema_migrations;
  `);
  // Roles are cluster-wide: DROP ROLE fails while another database (e.g. mini_test) still has their objects.
  await pool
    .query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mini_reader') THEN DROP OWNED BY mini_reader; DROP ROLE mini_reader; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mini_app') THEN DROP OWNED BY mini_app; DROP ROLE mini_app; END IF;
      END $$;`)
    .catch((err: Error) => console.warn(`roles kept (still used by another database): ${err.message}`));
  console.log('wiped: schemas meta, data, edits, ont, logic and the migration history. Also delete var/ on this machine.');
} finally {
  await pool.end();
}
