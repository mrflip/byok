import { defineConfig } from 'vitest/config'

// The binding is React components and hooks, so the tests render them under jsdom.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
