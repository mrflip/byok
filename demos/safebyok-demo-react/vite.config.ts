import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both: `vite` for the dev server, `vitest` for the tests. The tests cover the
// machinery (stub vault, stores, auth scaffold), all plain TypeScript, so they run under node.
export default defineConfig({
  plugins: [react()],
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
