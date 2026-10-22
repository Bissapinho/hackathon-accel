import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    env: { LLM_MOCK: '1' },
    // One local test database shared by every file: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
