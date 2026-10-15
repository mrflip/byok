# Thread 3: passkey_button_ux (2026-10-15)

Branch `20261015-passkey_button_ux`, PR [#98](https://github.com/mrflip/safebyok/pull/98), cut
from main at `c4c070f`. Justify: green -- root 123, core 956, React 83 (was 71), Convex 276,
IndexedDB 104, Postgres 156, GraphQL 153, argon2-wasm 44, demo 124 (React 92 after the
review round).

* **Built**:
  - `packages/safebyok-react/src/boundary.tsx`: `Boundary`, a small error boundary each component
    keeps at its own edge (fallback, `onCaught`). Not exported from the package.
  - `PassphraseModal` is now its boundary around `UnlockForm` (the old body, unchanged but for its
    first line), with `DialogTrouble` as the fallback. `PasskeyUnlockButton` is its boundary around
    `PasskeyPress` (likewise), fallback nothing, `onCaught` gripes.
  - Tests: `tests/boundary.test.tsx`; the dialog's and the button's misuse tests rewritten; a
    provider test of a stale-tab unlock (`unknown_key_deriver`) that closes to `dismissed`;
    `TH.renderReporting`, a render that keeps what React hands `onCaughtError`.
  - README *When an unlock fails*; `notes/security.md` entry; changeset (React minor).
  - **Review round** (pulled in as best UX): `withUnlockedVault` settles every call
    (`vault-provider.tsx`: an `Asking` per showing, ended with false when its vault goes); the
    gripe is `role="alert"`; the passkey's word survives typing until the next submit, and focus
    returns to the field when the button goes; the notice is an `alertdialog` that Escape closes.
    Six provider tests, each failing on the old provider.
* **Decisions taken**:
  - **The rule**: a failure that is the user's to mend (a condition) shows in its own words, as
    before. Anything else, arising inside the dialog or the button, is contained there: the user
    gets fixed, calm copy and a way on; the developer gets the very error through React's
    `onCaughtError`. Nothing the dialog does reaches the host's boundary.
  - **The channel is React's**, not a new prop: a boundary-caught error goes to the root's
    `onCaughtError`, which React 19 defaults to `console.error` with the component stack and where
    hosts already wire Sentry and the like. The React package's lint forbids the console, and
    `reportError` is missing from jsdom and Node, so a hand-rolled fallback would have been needed.
  - **The dialog's form is replaced, not kept**, on such a failure: misuse is by definition not
    mended by retrying, and the transient failures (storage) are conditions, which keep the form.
    Close is a dismissal, so `withUnlockedVault` settles to null at last.
  - **The passkey button steps aside** rather than taking the dialog down: the passphrase may still
    work (a bad `rpId` breaks only the passkey; a stale deriver only the passphrase).
  - **The same in dev and prod.** No `process.env.NODE_ENV` branch: it isn't on every platform
    without a bundler, and a dev that behaves unlike prod hides what users get.
  - **`reentryHours` of no hours is contained too**, though it is a prop: the dialog can never work
    with it, and containing it keeps the rest of the app usable. The developer meets it on the
    dialog's first open.
  - **Overlapping calls share one dialog** rather than the newer one settling the older with
    false, as the review suggested: one unlock should run every action that waited for it.
  - `VaultProvider`'s open is left as it was: its misuse throws at mount, on every load, before any
    user has typed anything, and there is no in-place UI of ours to fall back to.
* **Deviations**: `eslint-disable-next-line jsx-a11y/no-autofocus` on the notice's Close, as the
  field has; `jsx-a11y/no-noninteractive-element-interactions` on the `alertdialog`, for Escape.
  No `ts-expect-error`.
* **Discoveries**:
  - The gloss said misuse "shows calmly in the button"; on main both components already threw it to
    the host's boundary (big_feats thread 3 copied the dialog). The real gap was the blank page.
  - `unknown_key_deriver` reaches the dialog at unlock, not at open: a tab left open across a
    deployment that changes the deriver is a production path for "misuse", not only a dev one.
  - Testing Library 16's `render(ui, { onCaughtError })` keeps the suite quiet and lets tests
    assert the report.
  - Left: dialog semantics and Escape on the *form* (gripes PR #90 rewrites its markup; cheaper
    there), and resetting `Boundary` when a hand-rendered dialog's `vault` changes (the provider
    keys each showing, so its dialogs start fresh).

## Before and after

What the developer and the end user each meet, before and after, is in
`thread-3-passkey_button_ux-before_after.md` beside this file: for the Coach, ruling on what
remains, and for anyone changing how these components fail.

## For the Coach

* **Library-first, needing your yes**: `Boundary` is ten lines against React's documented class
  API (react.dev shows writing one; there is no hook form). The boring library is
  `react-error-boundary`, which would be a runtime dependency of every host. Rec: keep the class.
* **A choice you may want to overrule**: on such a failure the dialog replaces its form with the
  notice rather than showing a gripe above the form. Rec: keep it -- retrying cannot mend misuse.
* No `onError` prop. Rec: none until a host asks.
