import { defineConfig } from 'vitest/config'

// The tests run the whole round trip under Node, in-process: an urql Client, a GraphQL server
// over the resolvers, and safebyok-postgres's VaultDB behind them over PGlite, a real Postgres
// compiled to WebAssembly -- so no database or GraphQL server is needed.
export default defineConfig({
  // One graphql for everyone. graphql ships a development build beside its own, chosen by the
  // `development` condition Vite resolves with by default: src/, which Vite reads, would get that
  // one, and graphql-tools and urql, which Node loads, the other -- two GraphQLErrors, two
  // GraphQLSchemas, and graphql's own "another module or realm" refusal. Without it, both get one.
  ssr: { resolve: { conditions: ['module', 'node'] } },
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
