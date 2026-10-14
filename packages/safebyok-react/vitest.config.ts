import { defineConfig } from 'vitest/config'

// The binding is React components and hooks, so the tests render them under jsdom.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
})
