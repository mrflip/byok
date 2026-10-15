# Thread 5: mask_utils (2026-10-15)

Branch `20261015-mask_utils`, PR not yet filed, cut from `origin/main`. Justify: green (core 310
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
  - **`maxLen` kept** (the preplan's recommendation): it bounds the characters shown, and is a
    true ceiling. *Decided by the orchestrator on review:* a `maxLen` below `head + tail + 9`
    (9 = `***...***`) is refused as `bad_option`, naming the three options and the floor, since a
    collapse could otherwise be longer than the uncollapsed result. When `maxLen` is omitted it
    defaults to 15, or to `head + tail + 9` if that is more, so `{ head: 4 }` alone works. `Infinity`
    turns collapsing off. A collapse keeps only the head and tail the give-up rule left for that
    whisper (tested with large `minStars`), and `maxLen` wins over `minStars`. Tested: the result
    never exceeds `maxLen`.
  - **"Characters" are graphemes** (`Intl.Segmenter`, granularity `grapheme`): a whisper with an
    emoji, a ZWJ sequence or a combining accent is not cut in half (with `Intl.Segmenter`). `Intl.Segmenter` is in
    Node 16+, every current browser and Bun; Hermes (React Native) has lacked it, so where it is
    absent `mask` counts code points (`/./gsu`), which keeps a plain emoji whole but may split a ZWJ
    sequence, a flag or a skin-toned emoji, and part a combining mark from its base (the doc block says so). The segmenter is built per call, not at module scope, to keep
    the module free of load-time effects (`sideEffects: false`).
  - **Stripped first** (*widened on review, decided by the orchestrator*): `\p{Cc}` (newline,
    return, tab, NUL, DEL, C1), `\p{Zl}`/`\p{Zp}` (U+2028/2029), `\p{Bidi_Control}` (an override
    in the tail could reorder what the user reads), and U+200B, U+2060, U+FEFF (they take no room
    on screen yet would count as a character). Kept: U+200D (ZWJ) and U+200C (ZWNJ), variation
    selectors and tag characters, which emoji and scripts need.
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
  - **Validation**: Zod (`Z.object` with defaults; matches every other schema in `src/`, the orchestrator asks the Coach to note it) at the entry, refusing as `VaultError`
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
* **Also on review**: `Intl` itself is guarded (`typeof Intl === 'undefined'`); `errors.ts` widens the
  `bad_option` and `bad_whisper` comments; the bulk table's expected values are in `"`; new commits are
  `api:`-prefixed, and d30cf0d (`utils:`) can be reworded to `api:` when filing.
* **For the Coach**: the `maskAll` call (struck), `''` for an empty whisper, `maxLen` winning over
  `minStars` and refused below `head + tail + 9`, the strip list, and the changeset being `minor`.
