import { defineConfig } from 'vitest/config';

// Pure unit tests only (no database, no global setup): `npx vitest run --config vitest.unit.config.ts`.
// `pnpm test` runs them too, with the rest.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
  },
});
