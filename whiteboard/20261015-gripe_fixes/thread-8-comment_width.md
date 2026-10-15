# Thread 8: comment_width (2026-10-15)

Branch `20261015-comment_width`, PR [#81](https://github.com/mrflip/safebyok/pull/81), stacked on #66 (cut from its tip `5fefc90`; the
sprint's other threads' work is not on this base). Justify: green; root 105 tests, core 705,
Convex 265, React 28, demo 61.

* **Built**: `@stylistic/max-len` is on in the five lint configs (root, core, React, Convex, demo)
  and on this base 123 comment lines past 100 columns were found: 116 (in 40 files, the configs among them) are rewrapped, and
  seven `eslint-disable` directive lines are left (the rule ignores them). STYLE.md has one bullet saying so. Empty changeset.
* **Commits to read apart**: `140f0f4` is the reflow of the sources alone (rule still off, justify
  green); `323334a` is the rule, STYLE.md, the changeset **and the configs' own comment rewraps**
  (the `eslint.config.mjs` files' long comments ride here, not in `140f0f4`); `9554c7f` is the
  review's fix (below). Redoing the reflow later means redoing `140f0f4`, and the configs' rewraps
  are redone by the same scripts.
* **Review fix**: the reflow had split `{@link FarFuture}` across two lines above `clockReading` in
  `vault.ts`, which TypeScript reads as a link to nothing. The recipe now ends with
  `inline-tags.mjs`, which lists every open inline tag at a line end.

## The rule, and what it catches

```js
'@stylistic/max-len': ['error', {
  code: 1e5, comments: 100, ignoreUrls: true,
  ignorePattern: String.raw`^\s*(//|/\*)\s*eslint-(disable|enable)`,
}],
```

* **Catches**: any line that is wholly comment -- `//` lines, every line of a `/* */` or `/** */`
  block, a one-line `/** ... */` -- over 100 columns. Generated code is not special-cased: Convex's
  `_generated/` is already in the Convex config's ignores.
* **Does not catch**: a comment trailing code on the same line (`const x = 1 // long ...`) or an
  inline `/* ... */` after code -- the rule measures those at the `code` limit. Probed. Code lines
  carrying a trailing comment, some past 150 columns, remain. Closing that needs `code: 100` with `ignoreComments`-style
  carve-outs, which would then enforce width on code the formatter owns, so it was left.
* **Does not touch code length**: `code: 1e5` (not `100000`, which `unicorn/numeric-separators-style`
  refuses) is "no limit"; `Infinity` is not a valid option value for the rule's schema, not tried.
* **Ignores** a line holding a URL (`ignoreUrls`), and an `eslint-disable`/`eslint-enable`
  directive line (`ignorePattern`): `eslint-disable-next-line` cannot wrap, because the comment
  between it and its line moves the target. Seven such directive lines run past 100 and are left.
  Nothing else is exempted; no `eslint-disable-line` was added.
* An `@example` line that is code gets wrapped by hand style (below), not exempted.

## Decisions taken

* **Wrapping `@example`s.** STYLE.md already says "a long one on following lines, indented two
  spaces"; a long code line breaks at a space with the continuation two columns deeper, a trailing
  `// result` on a line of its own. Whitespace changes only; the examples read the same. Five that
  broke ugly (JSX, a ternary, `refuses(...)`) were fixed by hand.
* **A too-long one-line `/** text */`** opens to `/**`, ` * text`, ` */` -- the form every multi-line
  block here already takes.
* **Verified pure reflow**: `verify.mjs` parses every changed file at the base and now with
  TypeScript and compares code tokens and comment words; they match everywhere except the configs
  (where the rule was added). It cannot see a wrap that splits an inline tag: `inline-tags.mjs` does.
* **STYLE.md** got the one bullet; it is a Markdown hunk the docs thread (#69) may also touch.

## The recipe, for redoing after the rest merge

1. Rebase on main with the rest merged (or cut anew). Drop `140f0f4`; keep `323334a`'s configs.
2. Collect violations as JSON (`lint.sh` in `comment_width-reflow-recipe.md`).
3. `node reflow.mjs $S/*.json`, re-lint, then `node reflow-ex.mjs $S/*.json` on what remains;
   `node unwrap.mjs $(git diff --name-only)` if the directive `ignorePattern` was ever absent.
4. Fix by eye what broke ugly; run `node verify.mjs <base-ref>` and `node inline-tags.mjs` from the
   repo root (both must be clean, `verify.mjs` apart from the configs); then `pnpm justify`.
The scripts are in `comment_width-reflow-recipe.md` beside this file. Total time on this base: minutes.
New comments from the other threads were told to stay within 100 columns, so the second run should
be small.

## Discoveries

* The cascade wrap of a paragraph leaves a ragged final line but changes only the lines from the
  long one down; hunks stay small, which is what makes the later rebase tractable.
* `eslint-disable-next-line` lines were the one trap: a first pass without the `ignorePattern`
  wrapped seven and each wrap silently unused its directive (lint reports "unused directive").
* Trailing comments over 100 columns exist and are not enforced (see above); worth knowing if the
  Coach wants a formatter (Prettier does not reflow comments either).

## For the Coach

* Merge this last. Its comment hunks conflict with every other open PR's; the redo recipe above is
  faster than resolving them.
* Decide whether trailing comments should be held to 100 too (would take a code-length rule,
  which the formatter should own).
* Open on the PR as well: a long `// @ts-expect-error` line is flagged by the rule (only eslint
  directives are exempted, as recorded above); STYLE.md says an example's continuation is "indented
  two spaces" but the wraps here use four columns from the `@example` tag (two more than a plain
  example's code lines) -- one of them should move; trailing comments past 100 are not caught.
