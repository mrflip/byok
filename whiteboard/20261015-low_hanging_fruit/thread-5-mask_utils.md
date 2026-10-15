# Thread 5: mask_utils (2026-10-15)

Branch `20261015-mask_utils`, PR not yet filed, cut from `origin/main`. Justify: green (core 286
tests, convex 210, react 7, demo 24, root 67).

* **Built**: `safebyok/utils`, a new entry point (`src/utils.ts`, a `tsdown.config.ts` line, the
  `exports` entry tsdown wrote, and a hand-kept `typesVersions` line beside `idb`'s) exporting
  `mask(whisper, { head = 2, tail = 4, minStars = 6, maxLen = 15 })` and the `MaskOpts` type.
  The code is `src/mask.ts`; tests are `tests/mask.test.ts` (a bulk table with every `@example`,
  the short end, `maxLen`, an empty whisper, an all-control-characters whisper, emoji, a ZWJ
  family, a combining accent, the no-`Intl.Segmenter` fallback, refusals) and
  `tests/utils.test.ts` (the entry exports exactly `mask`). A real changeset,
  `.changeset/20261015-mask_utils.md` (minor). A `notes/security.md` line. READMEs name the entry.
* **Decisions taken**:
  - **`maxLen` kept** (the preplan's recommendation): it bounds the characters shown. `Infinity`
    turns collapsing off. When `head + stars + tail` would pass `maxLen`, the result is `head`,
    `***...***`, `tail`; with the defaults that is exactly 15 characters. If a host's `head` and
    `tail` alone pass `maxLen`, the result still passes it; `maxLen` also wins over `minStars`
    (a collapsed result shows three stars at each end). Both documented.
  - **"Characters" are graphemes** (`Intl.Segmenter`, granularity `grapheme`): a whisper with an
    emoji, a ZWJ sequence or a combining accent is never cut in half. `Intl.Segmenter` is in
    Node 16+, every current browser and Bun; Hermes (React Native) has lacked it, so where it is
    absent `mask` counts code points (`/./gsu`), which keeps emoji whole and only splits a
    combining mark from its base. The segmenter is built per call, not at module scope, to keep
    the module free of load-time effects (`sideEffects: false`).
  - **Stripped first**: `\p{Cc}` (newline, return, tab, NUL, DEL, C1) plus `\p{Zl}`/`\p{Zp}`
    (U+2028/2029). Format characters (`Cf`, e.g. zero-width joiner) are kept: they hold emoji
    sequences together.
  - **Empty after stripping gives `''`**, not six stars: there is nothing to hide, and stars
    would imply a secret exists. Any non-empty whisper shows at least `minStars` stars, even one
    shorter than `minStars` (so a 3-character whisper is `******`: its length is not revealed).
    `minStars: 0` is allowed and may show a short whisper whole; the doc block says to lower it
    with care.
  - **Give-up order**: of what may be shown (`length - minStars`), `tail` is kept first and
    `head` gives way, matching TODO.md's "remove stars first from head, then from tail".
  - **`maskAll` struck**, not exported: `mask(w, { head: 0, tail: 0 })` is the stars-only variant
    and a second name would be a contract for a one-liner. VOCABULARY.md's `mask` paragraph now
    says so and drops "or you can plug in your own" (no seam exists for that).
  - **Validation**: Zod (`Z.object` with defaults) at the entry, refusing as `VaultError`
    `bad_option`; a non-string whisper as `bad_whisper`. Neither message quotes the whisper
    (tested). `mask` pulls in `errors.ts` and `zod` (a peer already); the built `utils.js` is
    4.1 kB before the shared chunk.
* **Library search** (CLAUDE.md): `maskdata` 1.3.4 (238 kB unpacked, Node-oriented, a generic
  string mask with a mask character and output cap, but no control-character stripping, no
  minimum star count, no grapheme handling); `mask-string` 1.0.1 (3 kB, 2022, a pattern
  formatter like `string-mask`, a different job); the many input-mask packages (`react-input-mask`
  and kin) are UI-field formatters; `redact-pii` finds PII in prose. For graphemes,
  `graphemer` (811 kB) and `unicode-segmenter` (138 kB) exist, but `Intl.Segmenter` is built in
  everywhere the package runs, so no dependency. Nothing does the job; hand-rolled, display
  formatting only.
* **Deviations**: TODO.md on `main` does not hold the `mask` spec (it is on #26's branch, per the
  orchestrator); I worked from that text via the preplan and commit `030d7fb`. No
  `eslint-disable`, no `@ts-expect-error`. One non-null `!` in a test helper
  (`Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!`), reported here.
* **Discoveries**: tsdown's `exports: true` writes the `exports` entry but not `typesVersions`;
  attw (node10) fails the build until the new entry is added there by hand. Thread 2's
  `safebyok/browser` needs the same line: the conflict in `package.json` and `tsdown.config.ts` is
  mechanical, take both. `unicorn/prefer-spread` and `@typescript-eslint/no-misused-spread`
  together refuse both `Array.from(str)` and `[...str]`, hence the regex.
* **For thread 8**: a size-budget entry for `import { mask } from 'safebyok/utils'` waits on this
  merging; it ships `errors` and `zod` (core's peer), not the vault.
* **For the Coach**: the `maskAll` call (struck), `''` for an empty whisper, `maxLen` winning over
  `minStars`, and the changeset being `minor`.
