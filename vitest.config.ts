import { defineConfig } from 'vitest/config'

// The workspace root's own tests: those of its tooling in scripts/. Each package under packages/,
// demos/ and e2e/ has its own vitest config, run by its own `test` script.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include:  ['scripts/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
