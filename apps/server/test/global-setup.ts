import { createDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { seed } from '../src/db/seed.js';
import { TEST_DATABASE_URL } from './helpers.js';

// Once per `pnpm test`: bring the local test database to the latest migration and seed it.
export default async function setup(): Promise<void> {
  const pool = createPool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await migrate(pool);
    await seed(createDb(pool));
  } catch (err) {
    throw new Error(
      `Test database not ready at ${TEST_DATABASE_URL}. Start it with "docker compose up -d db". (${(err as Error).message})`,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
