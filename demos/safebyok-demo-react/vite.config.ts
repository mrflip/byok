import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both: `vite` for the dev server, `vitest` for the tests. The machinery's
// tests (stores, auth scaffold, outage) are plain TypeScript and run under node; each component's
// renders under jsdom, by a `@vitest-environment jsdom` line at the top of its file.
export default defineConfig({
  plugins: [react()],
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
