# Thread 5: mask_utils (2026-10-15)

Branch `20261015-mask_utils`, PR [#37](https://github.com/mrflip/safebyok/pull/37), cut from `origin/main`. Justify: green (core 343
tests, convex 213, react 7, demo 24, root 91).

* **Built**: `safebyok/utils`, a new entry point (`src/utils.ts`, a `tsdown.config.ts` line, the
  `exports` entry tsdown wrote, and a hand-kept `typesVersions` line beside `idb`'s) exporting
  `mask(whisper, { head = 2, tail = 4, minStars = 6, maxLen = 15 })` and the `MaskOpts` type.
  The code is `src/mask.ts`; tests are `tests/mask.test.ts` (a bulk table with every `@example`,
  the short end, `maxLen`, spaces, bidi and invisible characters, marks, emoji, right-to-left
  letters, a property test over adversarial and random input, refusals) and `tests/utils.test.ts`.
  A real changeset, `.changeset/20261015-mask_utils.md` (minor). A `notes/security.md` line.
* **The contract (the Coach, in chat, after review; it supersedes the orchestrator's earlier YOLO
  calls on grapheme handling, the `maxLen` floor and the narrow strip list)**: `mask` gives "a
  whiff of interesting text from each end, best effort, safely viewable in a log or reminder", one
  plain line; fidelity gives way to safety. Not a faithful copy.
* **Decisions taken**:
  - **No `Intl.Segmenter`, no `Intl` guard.** The whisper is cut by code point (`/./gsu`, which
    never splits a surrogate pair; `Array.from` and `[...str]` are both refused by the linter).
    A cut may part an emoji sequence, a flag or a skin tone: what is left is visible text.
  - **The final stage is `plainLine`, private to `mask.ts`** (not exported: it would be public
    surface to carry, and the property test exercises it through `mask`). It runs `normalize('NFC')`
    (a letter and its accent become one letter), then strips `\p{M}` (every combining mark that
    remains, which defeats stacked "Zalgo" marks), `\p{C}` (controls, format characters, lone
    surrogates, private-use, unassigned), `\p{Z}` (every space and the line and paragraph
    separators), `\p{Default_Ignorable_Code_Point}` (soft hyphen, fillers, variation selectors,
    tags, invisible operators), `\p{Bidi_Control}` and U+2800 (the blank braille pattern). Strip,
    never escape.
  - **It runs twice**: on the whisper before it is counted (so invisible characters and marks do
    not count as characters, and a cut cannot orphan a mark), and on the whole result before it
    is returned (the backstop the Coach asked for; today a no-op, because the pieces were already
    clean and stars and the marker are ASCII).
  - **Whitespace is removed entirely, not collapsed to one space**: a key has no meaningful
    spaces, and a result with none cannot start or end on a blank or wrap.
  - **Strong right-to-left letters stay** (Hebrew, Arabic and so on): they are visible text, and
    `\p{Bidi_Class}` is not available in JavaScript regexes, so excluding them would mean listing
    scripts by hand and would erase whole languages from a mask. With every explicit bidi control
    gone, what remains is the ordinary bidi algorithm on letters, ASCII stars and dots: the result
    stays on one line and cannot change how the text around it displays. A stricter reading is
    one line of regex if the Coach wants it.
  - **Cost of stripping `\p{M}`**: scripts whose vowels are combining marks (Devanagari, Thai,
    Arabic with harakat) lose them in the mask. Accepted by the Coach's "fidelity left the
    building"; flagged here so it is a known consequence.
  - **`maxLen` too small never throws**: the collapsed form (`head***...***tail`) that does not
    fit gives `'*'.repeat(maxLen)`, no head, no tail, no ellipsis; `maxLen: 0` gives `''`.
    `Infinity` never collapses. The default is 15 again (it no longer grows with `head` and
    `tail`, so `{ head: 4 }` alone on a long whisper gives 15 stars). `maxLen` counts code points
    and wins over `minStars`. Nonsense (negative, fractional, NaN, text) is still `bad_option`
    at the entry.
  - **Nothing left**: `''` for an empty whisper; a non-empty whisper that is entirely stripped
    gives `minStars` stars (clamped by `maxLen`), as if it were a short whisper.
  - **Give-up order**: of what may be shown (`length - minStars`), `tail` is kept first and
    `head` gives way.
  - **`maskAll` struck**, not exported: `mask(w, { head: 0, tail: 0 })` is the stars-only variant.
  - **Validation**: `Z.object` with defaults at the entry (matches every other schema in `src/`),
    `bad_option`; a non-string whisper is `bad_whisper`. Neither message quotes the whisper.
* **Library search** (CLAUDE.md): `maskdata` 1.3.4 (238 kB unpacked, Node-oriented; no
  control-character stripping, no minimum star count); `mask-string` and `string-mask` (pattern
  formatters, a different job); the `react-input-mask` family (input fields); `redact-pii` (finds
  PII in prose). Nothing does the job; hand-rolled display formatting, no dependency.
* **Deviations**: TODO.md on `main` does not hold the `mask` spec (it is on #26's branch); I worked
  from the preplan and commit `030d7fb`. No `eslint-disable`, no `@ts-expect-error`.
* **Discoveries**: tsdown's `exports: true` writes the `exports` entry but not `typesVersions`;
  attw (node10) fails the build until the new entry is added there by hand. Thread 2's
  `safebyok/browser` needs the same line (a mechanical conflict). `unicorn/prefer-spread` and
  `@typescript-eslint/no-misused-spread` together refuse `Array.from(str)` and `[...str]`, hence
  `text.match(/./gsu)`. The remote branch had been rebased by the orchestrator onto a newer main
  while this worktree was gone; the local branch was reset to the remote tip.
* **For thread 8**: a size-budget entry for `import { mask } from 'safebyok/utils'` waits on this
  merging; it ships `errors` and `zod` (core's peer), not the vault.
* **For the Coach**: whether to keep right-to-left letters (above), the `\p{M}` cost to Indic and
  Thai text, whitespace removed rather than collapsed, and whether `mask` should validate lighter
  than `Z.object` (it ships zod). The changeset is `minor`.
