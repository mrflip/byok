import { defineConfig } from 'tsdown'

// Built the way Convex's own component template is: ESM only, and unbundled, so each module of the
// component keeps its own file under dist/component/, beside its convex.config.js and _generated/.
// A host's Convex CLI finds the component through convex.config.js and bundles that directory's
// modules itself at deploy. `exports` is written by hand in package.json, since two of its entries
// are Convex's conventions rather than built entry points: the types-only
// `./_generated/component.js`, and `./test`, which ships as source because its `import.meta.glob`
// must find the component's .ts modules. publint and attw read the package as a consumer would;
// attw leaves out `./test`, which only a test runner resolving as a bundler does (vitest) loads.
export default defineConfig({
  entry:      ['src/index.ts', 'src/server.ts', 'src/component-api.ts', 'src/component/**/*.ts'],
  format:     ['esm'],
  unbundle:   true,
  // The component runs in Convex's isolates and the client in browsers; nothing here is either's
  // alone.
  platform:   'neutral',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  publint:    { level: 'warning' },
  attw:       { profile: 'esm-only', level: 'error', excludeEntrypoints: ['./test'] },
  failOnWarn: 'ci-only',
})
