import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps;
// `exports` writes package.json's entry points from what was built, with the `@safebyok/source`
// condition the workspace's tsconfigs ask for; publint and attw read the package as a consumer
// would, and fail the build on anything they find. Two entry points: the browser's half (`.`) and
// the server's (`./server`). `safebyok`, `graphql` and `@urql/core` are peers, so they stay
// external: the host's one copy of safebyok is the one whose VaultDB and VaultError this adapter
// extends, and its one copy of graphql the one whose GraphQLError its server knows.
export default defineConfig({
  entry:      ['src/index.ts', 'src/server.ts'],
  format:     ['esm', 'cjs'],
  // The host's server, whichever it is: Node, Bun, Deno, an edge runtime. Nothing here is any one's.
  platform:   'neutral',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  exports:    { devExports: '@safebyok/source' },
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
