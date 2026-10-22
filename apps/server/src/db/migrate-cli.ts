import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';

// pnpm db:migrate — DATABASE_URL must be a role that can create roles (local superuser, avnadmin on Aiven).
const config = loadConfig();
const pool = createPool({ connectionString: config.DATABASE_URL, caCertPath: config.DATABASE_CA_CERT, max: 1 });
try {
  const { applied, skipped } = await migrate(pool, {
    miniAppPassword: config.MINI_APP_PASSWORD,
    log: (line) => console.log(line),
  });
  console.log(`migrations: ${applied.length} applied, ${skipped.length} already there`);
} finally {
  await pool.end();
}
