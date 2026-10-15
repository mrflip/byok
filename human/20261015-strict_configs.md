# 2026-10-15: Strict configs -- the IDE/tsc split was dist/, not strictness; three questions

Branch `20261015-strict_configs`, PR filed from it (link in chat).

**What the Coach saw.** VSCode flagged a type-only `VaultBundle` import and untyped arrow
parameters that `tsc` and lint passed. Not a strictness gap: every package read `safebyok` through
its built `dist/`. `pnpm typecheck` built it first; the editor never did. With `dist/` missing,
`safebyok` was `any` (hence the untyped `(ckey) =>`, `(row) =>`); with it stale, the editor
checked an older API (hence `VaultBundle`, which is a value and a type, and imported correctly).

**What changed.** One `tsconfig.base.json` holds all the strictness; tsdown's `devExports` gives
the core and the binding a `@safebyok/source` condition that tsc, the editor and lint now resolve
through; every eslint config is cut from the core's. The PR body has the detail.

**Caught on the way.** `exactOptionalPropertyTypes` pointed at the core's `Lockbox.note`; the
obvious fix (`.exactOptional()`) would have refused every note-less lockbox already in a browser's
IndexedDB, which kept the `note: undefined` earlier versions wrote. Reverted; a test now holds the
schema to reading it, and the writer no longer writes it.

## Questions

1. **Keep the eslint configs in step mechanically?** They are cut from the core's by hand, and
   drift is how three of them ended up on `recommended` alone. A small `scripts/` generator (I
   used a throwaway one) or a shared module the configs import would stop it; either is a new
   piece of tooling, so it is your call.
2. **Tests still run against `dist/`.** Typecheck and lint read source; vitest still resolves
   `safebyok` through the build (`pretest`). Adding the condition to vitest's `resolve.conditions`
   would make the tests live too and drop the build step, at the cost of no longer testing the
   built package from a sibling. Left as is.
3. **`pnpm publish` only.** `publishConfig.exports` is a pnpm feature; the release workflow packs
   with `pnpm pack`, and a release test now fails if the source condition reaches a tarball. A
   hand `npm publish` would ship it.
