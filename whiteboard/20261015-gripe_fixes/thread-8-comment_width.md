# Thread 8: comment_width (2026-10-15)

Branch `20261015-comment_width`, PR not yet filed, stacked on #66 (cut from its tip `5fefc90`; the
sprint's other threads' work is not on this base). Justify: green; root 105 tests, core 705,
Convex 265, React 28, demo 61.

* **Built**: `@stylistic/max-len` is on in the five lint configs (root, core, React, Convex, demo)
  and 123 comment lines in 41 files, on this base, are rewrapped to pass (about 110 prose lines
  plus the `@example` lines). STYLE.md has one bullet saying so. Empty changeset.
* **Two commits to read apart**: `140f0f4` is the reflow alone (rule still off, justify green);
  `323334a` is the rule, STYLE.md and the changeset. Redoing the reflow later means redoing the first.

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
  inline `/* ... */` after code -- the rule measures those at the `code` limit. Probed. There are
  some on this base; they remain. Closing that needs `code: 100` with `ignoreComments`-style
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
* **Verified pure reflow**: a script strips comment markers and whitespace from every changed file
  at `HEAD` and now, and the two match (`verify.mjs` in the recipe).
* **STYLE.md** got the one bullet; it is a Markdown hunk the docs thread (#69) may also touch.

## The recipe, for redoing after the rest merge

1. Rebase on main with the rest merged (or cut anew). Drop `140f0f4`; keep `323334a`'s configs.
2. Collect violations as JSON (`lint.sh` in `comment_width-reflow-recipe.md`).
3. `node reflow.mjs $S/*.json`, re-lint, then `node reflow-ex.mjs $S/*.json` on what remains;
   `node unwrap.mjs $(git diff --name-only)` if the directive `ignorePattern` was ever absent.
4. Fix by eye what broke ugly; run `verify.mjs`; `pnpm justify`.
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
