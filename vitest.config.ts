import { defineConfig } from 'vitest/config'

// The workspace root's own tests: those of its tooling in scripts/. Each package under packages/
// and demos/ has its own vitest config, run by its own `test` script.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
