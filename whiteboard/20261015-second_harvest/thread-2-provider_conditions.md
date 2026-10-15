# Thread 2: provider_conditions (2026-10-15)

Branch `20261015-provider_conditions`, PR not yet filed, cut from `origin/main` (`23e38a2`).
Justify: green (root 105; core 362, convex 219, react 26, demo 61 tests; `pnpm size` within
every limit).

* **Built**:
  - *The core closes a failed open's watch* (`packages/safebyok/src/vault.ts`, tail of
    `openVault`): when the first `refresh()` or `rememberedUnlock()` throws, the handle closes
    itself (ending `vaultDB.subscribe`) and rethrows the very error. Seven tests in
    `tests/vault.test.ts`, *a failed open*: each failure point, a bundle that does not parse,
    nothing listening afterwards, a clean reopen with exactly one live watch. All seven fail
    without the fix.
  - *The error families, exported* (`packages/safebyok/src/errors.ts`, appended after
    `isVaultError`; `index.ts`): `VaultErrorFamilyVals` (`misuse`, `condition`),
    `VaultErrorFamilyForKind` (a `satisfies Record<VaultErrorKind, VaultErrorFamily>` table, so
    a new kind fails the build until it is given a family) and `isVaultCondition(err)`. The table
    agrees kind for kind with [#50](https://github.com/mrflip/safebyok/pull/50)'s doc block and
    README tables. Tests in a new `tests/errors.test.ts`.
  - *`VaultProvider` hands conditions down* (`packages/safebyok-react/src/vault-provider.tsx`):
    the context gains `openError: VaultError | null` and `retryOpen()`. A rejection that
    `isVaultCondition` lands in `openError` (vault stays null); misuse and anything not a
    VaultError (including a rejected `null`) still throw to the boundary. `retryOpen` bumps an
    attempt counter in the open effect's deps, so the effect's cleanup clears the error and a
    fresh open runs; it does nothing while there is no `openError`. Sign-out clears it. Twelve
    new tests, replacing the one that sent storage trouble to the boundary; among them the leak check: after two failed opens and a retry that
    succeeds, the tally is exactly one live watch. The README's *When opening fails* is
    rewritten in two parts (conditions in place, misuse to the boundary).
  - *The demo shows it* (`demos/safebyok-demo-react`): `src/lib/outage.ts` is an outage switch
    and an `OutageVaultDB` wrapping the IndexedDB adapter (it passes `describeVaultDB` while up,
    and refuses every read and write as `storage_unavailable` while down). The backend panel has
    a checkbox. `VaultDashboard` renders "Can't reach your vault." with the error's message and a
    Retry button in place of "Opening vault…".
  - Changeset `.changeset/20261015-provider_conditions.md`: `safebyok` and `safebyok-react`
    minor (the lockstep group moves together anyway).
* **Decisions taken**:
  - Names: `openError` and `retryOpen` (the plan left them to me). `openError` is typed
    `VaultError`, since only a VaultError can be a condition.
  - The family split goes in a lookup table, not two lists: STYLE's `FooForBar`, and the type
    checker forces it to cover every kind exactly once. One predicate, `isVaultCondition`, and no
    `isVaultMisuse`: "not a condition" includes non-VaultErrors, which are not misuse by kind, and
    the binding needs only the one test.
  - A non-VaultError rejection goes to the boundary: an adapter that throws a raw error has a
    bug (`VaultDB`'s public verbs already wrap a raw throw as `storage_unavailable`).
  - `corrupt_record` lands in `openError` too, though a retry will not mend it: #50 makes it a
    condition, and the README tells the host to branch on `openError.kind`.
* **Pulled forward**: the core fix for the leaked watch, from the never-filed
  `open_vault_unsubscribe` worktree (`/workspace/byok-open_vault_unsubscribe`, uncommitted, on
  pre-move paths). I ported its `vault.ts` hunk and adapted its tests to the current helpers; I
  wrote nothing to that worktree. The plan asked to "check the leaked watch is really closed on
  retry", and without this fix it was not: each failed open, retried or reset, left one watch.
  Its Convex-side test and README line were not carried over.
* **Deviations**: the plan's *Touches* list did not name `vault.ts`; the fix above needed it. The
  hunk is the last lines of `openVault` and a paragraph in its doc block, away from the unlock
  lines threads 3-5 change.
* **Discoveries** (for whoever lands second, this or #50):
  - Both add `packages/safebyok/tests/errors.test.ts`, so the rebase meets an add/add conflict:
    keep both files' `describe`s and merge the imports. Worth adding then: a test that
    `VaultErrorFamilyForKind` agrees with #50's README tables.
  - Both rewrite the React README's *When opening fails* paragraph: take this thread's version
    (which supersedes #50's parenthesis, whose claim that conditions "reach the boundary here
    too" stops being true).
  - #50's TODO.md rewrite of *Error families* says the provider question is "still open"; this
    thread closes it. I left TODO.md alone to keep out of #50's hunk: after both land, that
    entry should go.
  - `errors.ts` itself merges cleanly: #50 changes the top doc block and the `vault_full`
    comment; this thread only appends at the bottom.
  - #50's core README *Misuse* intro says `VaultProvider` "rethrows a failed `openVault`
    during render": after both land, that should say "misuse at open".
* **For the Coach**:
  - A React host that relied on its error boundary to catch storage trouble at open now gets
    `openError` instead, and must render it or the vault UI just shows no vault. The changeset
    says so.
