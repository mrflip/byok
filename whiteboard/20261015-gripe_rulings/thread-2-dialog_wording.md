# Thread 2: dialog_wording (2026-10-15)

Branch `20261015-dialog_wording`, PR [#91](https://github.com/mrflip/safebyok/pull/91), stacked on #83. Justify: green (all packages and the demo; react 55-plus tests, convex 268, demo 124).

* **Built**: `PassphraseModal`'s window line (`packages/safebyok-react/src/passphrase-modal.tsx`) reads "Locks again on this device in 7 days" through `new Intl.RelativeTimeFormat(Locale, { numeric: 'always', style: 'long' })`, with today's unit choice (whole days, else hours, else minutes, at least one minute). `ForeverMs` or longer reads "Stays unlocked on this device until you lock it." Where `'RelativeTimeFormat' in Intl` is false it falls back to the old "Stays unlocked on this device for 7 days." The window is `vault.reentryWindowMs`. Tests (`passphrase-modal.test.tsx`, `vault-provider.test.tsx`) carry the new wording plus four fallback cases that delete `Intl.RelativeTimeFormat` for the test and restore it after. The react README line and a patch changeset (`.changeset/20261015-dialog_wording.md`) say it.
* **Decisions taken**:
  * `numeric: 'always'`, so one day is "in 1 day", never "tomorrow" (the default `'always'` is also the spec default; stated for the reader).
  * The locale is one module constant, `Locale = 'en'`, used by the relative phrase and by the fallback's `Intl.NumberFormat`: the i18n thread changes one line (and will want the sentence frames, "Locks again on this device", translated too; they are still English literals).
  * The fallback is a feature test (`'RelativeTimeFormat' in Intl`), at render, not at module load, so a test (or a polyfill loaded late) is honoured.
  * `windowCount` was split out of `unlockedFor` to share the unit choice between the two phrasings.
* **Discoveries**:
  * `Intl.RelativeTimeFormat` has no grouping option, so a window just under `ForeverMs` reads "in 288,000,000,000 minutes" where the old text had no separators. The test for that edge case now allows commas. Nobody opens a vault that way; recorded only for honesty.
  * Spreading `Intl` into a stub loses every property (they are non-enumerable); the fallback tests delete and restore the one property instead.
* **For the Coach**: the commit prefix is `react:` where the previous commit on this component used `client:`; say if the repository's prefix for `safebyok-react` is `client:` and I will keep to it in later threads.
