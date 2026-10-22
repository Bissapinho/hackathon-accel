import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/db/pool.js';
import { TEST_DATABASE_URL } from './helpers.js';

// A dropped idle connection must not crash the server (it did when Postgres restarted under a live demo).
describe('database pool', () => {
  it('survives an idle connection closed by the server and keeps answering', async () => {
    const pool = createPool({ connectionString: TEST_DATABASE_URL, max: 2 });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const client = await pool.connect();
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      client.release(); // now idle in the pool

      const killer = createPool({ connectionString: TEST_DATABASE_URL, max: 1 });
      await killer.query('SELECT pg_terminate_backend($1)', [pid]);
      await killer.end();
      await new Promise((r) => setTimeout(r, 200)); // let the 'error' event reach the pool

      expect(errors).toHaveBeenCalled();
      const res = await pool.query<{ ok: number }>('SELECT 1 AS ok');
      expect(res.rows[0]!.ok).toBe(1);
    } finally {
      errors.mockRestore();
      await pool.end();
    }
  });
});
