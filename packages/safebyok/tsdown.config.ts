import { defineConfig } from 'tsdown'

// ESM and CommonJS, each with its own declarations and source maps. `exports` writes package.json's
// entry points from what was built, so they never drift from the files; publint and attw then read
// the package as a consumer would, and fail the build on anything they find. Each entry point also
// gains a `@safebyok/source` condition pointing at its src/, which the workspace's tsconfigs ask
// for, while `publishConfig.exports`, the dist-only copy, is what publishing ships.
export default defineConfig({
  entry:      ['src/index.ts', 'src/idb.ts'],
  format:     ['esm', 'cjs'],
  // Browser first, but nothing here is browser-only: WebCrypto is the same global under Node.
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
