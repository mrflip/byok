import { defineConfig } from 'tsdown'

// The same build as the core's (ESM and CommonJS, each with declarations and source maps; `exports`
// writes package.json's entry points from what was built; publint and attw read the package as a
// consumer would and fail the build on anything they find). `safebyok` is a peer, so it stays
// external and the host's one copy is the one whose VaultError this package throws; `hash-wasm`
// is a dependency, external too, so a host's bundler takes only the Argon2id it uses from it.
export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm', 'cjs'],
  // Wherever WebAssembly runs: browsers, Node, Bun, and the frameworks on them.
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
