# Thread 1: zod_mini (2026-10-15)

Branch `20261015-zod_mini`, PR not yet filed. Justify: green (root 105 tests; core 327, convex
219, react 15, demo 28; `pnpm size` passes at the lowered limits).

* **Built**: every validator in the core is `zod/mini` (`types.ts`, `crypto.ts`, `vault-db.ts`,
  `vault.ts`; the React binding and the Convex adapter's `src/` use no zod). The core builds
  `unbundle`d (`tsdown.config.ts`): one dist file per source module, so `sideEffects: false`
  lets a host's bundler drop whole modules. `.size-limit.json` limits lowered. The core's lint
  refuses classic `zod` in `src/` (`safebyok/tree-shaking` block). A test that the exported
  schemas compose inside a host's classic Zod (`tests/types.test.ts`). STYLE.md's *Imports* and
  *Validation* name `zod/mini`; a `notes/security.md` entry; a minor changeset; TODO roadmap 7
  marked built.

* **Measured** (`pnpm size`: rolldown, minified, brotlied, zod included):

  | entry                | before | classic, unbundled | mini, bundled | **after** | limit was | **limit** |
  | -------------------- | -----: | -----------------: | ------------: | --------: | --------: | --------: |
  | everything           |  35.83 |              35.78 |         21.32 | **21.26** |        38 |    **23** |
  | openVault            |  29.49 |              29.47 |         14.47 | **14.44** |      31.5 |  **15.5** |
  | stableJsonify        |  25.16 |               2.32 |          8.33 |  **2.32** |        27 |   **2.5** |
  | argon2idWebV1Deriver |   5.01 |               5.01 |          5.01 |  **5.01** |       5.5 |   **5.5** |
  | idbDeviceDB          |  25.71 |              23.67 |         10.11 |  **8.00** |      27.5 |   **8.5** |
  | browserOpts          |  30.55 |              28.59 |         14.96 | **12.90** |        33 |    **14** |

  Zod's share before, measured with zod ignored: about 22 kB of every entry that validates
  (everything without zod: 13.79 kB). After: about 7.5 kB, a two-thirds cut. The two levers do
  different work: mini shrinks every entry that validates by about 14-15 kB; unbundling is what
  takes zod out of a bare `stableJsonify`. New limits keep the size-budget thread's 7-8%
  headroom, rounded up to half a kilobyte.

* **Decisions taken**:
  - **Unbundled build, not `/* @__PURE__ */` annotations.** Mini's builders are marked
    `@__NO_SIDE_EFFECTS__`, but a `.check(...)` is a method call a bundler must keep, and one
    inside an `object({...})` keeps the whole object. Annotating every schema would be noise in
    every file; unbundling makes `sideEffects: false` drop the unreached modules, with no
    change to the source. Cost: dist/ is a file per module (plus rolldown's CJS runtime helper);
    publint, attw, the CJS `require` and the demo's Vite build are all fine.
  - **A minor changeset.** The exported schemas (`Label`, `VaultScope`, `Lockbox`,
    `LockboxSummary`, `VaultBundle`, `Ciphered`, `Whisper`) are mini schemas now: `.parse` and
    `.safeParse` are unchanged, and they still nest in classic Zod, but classic's chained
    methods (`.optional()`, `.omit()`) are gone. Breaking at 0.x is a minor bump (PROCESS.md,
    *Releases*); the changeset says how to rewrite.
  - **zod joins safebyok-convex's dev dependencies** (`^4.6.7`, already in the lockfile): its
    validator test did `Records.Lockbox.omit(...)`, which is exactly the break above; it now
    uses `Z.omit` from `zod/mini`, as the core's own `ListedLockbox` does. Dev only, nothing a
    host installs.
  - **The peer range stays `^4.0.0`.** `zod/mini` is in 4.0.0's exports with every builder and
    check used here; the core's typecheck and all 325 tests passed with zod pinned to 4.0.0
    (tried by hand, reverted).

* **Deviations**: two additions not asked for -- the lint rule (so classic cannot creep back
  and undo this) and the classic-interop test (the use case the changeset promises).

* **Authoring clarity** (the report the plan asks for): a modest cost, worth the bytes.
  - `Z.string().min(1)` becomes `Z.string().check(Z.minLength(1))`; `.int().positive()` becomes
    `Z.int().check(Z.positive())`. Longer, but the aligned field tables still read as tables.
  - Wrappers turn inside out: `X.nullable().optional()` is `Z.optional(Z.nullable(X))`, read
    from the outside in; `.default(v)` is `Z._default(X, v)`, the underscore a wart.
  - `LockboxSummary` (`Z.extend(Z.omit(Lockbox, ...), {...})`) is a little harder to scan.
  - The one real loss: `forcePassphraseReentryHours`, a default-transform-pipe chain, nested
    past the linter's limit; it now reads as three named steps and a pipe, arguably clearer.
  - Messages per check are the same strings in the same places.

* **Discoveries**:
  - `idbDeviceDB` still carries all of `types.js` (every schema, about 0.5 kB brotlied), since
    within a module the `.check()` calls keep each schema. PURE annotations would shave it; not
    worth the noise today.
  - Zod's own core (`v4/core/schemas.js`, about 13 kB minified) is the floor for any entry that
    validates at all; nothing in our code lowers it further.
  - Mini loads no locale, so a zod issue's default message is "Invalid input". No zod message
    reaches a caller (every refusal is our own VaultError), so nothing changes for users.
  - A host-supplied label policy (TODO, *Pluggable label validator*) should be typed
    `Z.core.$ZodType`, so a host's classic schema and a mini one both fit.
  - **[#37](https://github.com/mrflip/safebyok/pull/37) (`mask`)**, left alone here: whichever
    lands second moves `mask.ts` to `zod/mini` (the new lint rule fails it otherwise):
    `shownCount = Z.int().check(Z.nonnegative(), Z.lte(MaxShown))`, each field
    `Z._default(shownCount, 2)`, and `maxLen` as
    `Z._default(Z.union([Z.literal(Infinity), Z.int().check(Z.nonnegative())]), 15)`. Its `mask`
    size entry (19.5 kB) then drops to measured-plus-headroom. Expect textual conflicts in
    `tsdown.config.ts` (its `utils` entry beside this thread's comment and `unbundle` line) and
    `.size-limit.json`; both are straightforward.

* **For the Coach**: confirm the minor bump -- the exported schemas changing from classic to
  mini is a break for any host that chains classic methods on them.
