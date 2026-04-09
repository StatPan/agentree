import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.opencode-integration.ts'],
    testTimeout: Number(process.env.AGENTREE_TEST_TIMEOUT_MS ?? 180_000),
    hookTimeout: Number(process.env.AGENTREE_TEST_TIMEOUT_MS ?? 180_000),
    fileParallelism: false,
  },
})
