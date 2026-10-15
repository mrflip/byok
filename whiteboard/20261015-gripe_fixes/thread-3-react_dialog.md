# Thread 3: react_dialog (2026-10-15)

Branch `20261015-react_dialog`, PR not yet filed, stacked on [#66](https://github.com/mrflip/safebyok/pull/66).
Justify: green (core 705, convex 265, react 52, demo 61, root 105).

* **Built**: `PassphraseModal` (`packages/safebyok-react/src/passphrase-modal.tsx`) takes an
  optional `reentryHours` prop and states the window: "for 7 days" / "1 day" / "8 hours" /
  "15 minutes" / "until you lock it". `VaultProvider` passes its `forcePassphraseReentryHours`.
  An unlock error other than `vault_locked` (closes as dismissed, from #55) is handled by
  family: a condition (`wrong_passphrase`, `storage_unavailable`, `not_permitted`,
  `corrupt_record`, ...) shows its calm message in the dialog; misuse or a non-VaultError is
  stored in state and rethrown in render, so the nearest error boundary above `VaultProvider`
  gets it. README paragraph, minor changeset for `safebyok-react`.
* **Decisions taken**:
  - **No core accessor.** The dialog opens while the vault is locked, when `askPassphraseAt` is
    null, so the snapshot cannot say the window; the provider already holds the option. A prop
    is the smaller additive surface than a new `Vault` member, and nothing needed a VOCABULARY
    line.
  - **Window wording**: whole days, else whole hours, else minutes (minimum 1); any window at or
    past the vault's own longest (`FarFuture - FarPast` ms, `Infinity` included) reads "until you
    lock it". The core's `ForeverMs` is private, so the dialog recomputes it from the exported
    `FarFuture` and `FarPast`.
  - **`reentryHours` is validated** at the dialog's door (it is exported): NaN or <= 0 throws
    `bad_option` while rendering. A vault could never have been opened with one.
  - **Every condition shows in the dialog**, not only `storage_unavailable` and `not_permitted`:
    `isVaultCondition` is the guide's split (#61), and VaultError messages never carry secrets.
    The gripe clears when the user types, as the wrong-passphrase one did.
  - **"Redundant assertion"** read as `getByText(...)` followed by `.to.not.be.null`: `getBy*`
    throws when absent, so the check can never fail. Replaced by `queryByText` throughout the
    modal test, where `not.be.null` means something. If the Coach meant another assertion,
    that is the one place this reading could be wrong.
* **Tests**: wrong passphrase (message, no `onDone`, cleared on typing), a typed passphrase
  reaching `unlock`, cancel, a condition shown in place, misuse and a non-VaultError reaching a
  boundary, 12 window cases (default, singular/plural, hours, minutes, `Infinity`, 1e9 hours,
  under a minute), bad `reentryHours`, and two provider tests that the window reaches the dialog.
* **Discoveries**: `Vault.unlock`'s doc says it remembers the unlock "for
  `forcePassphraseReentryHours`", but the vault does not expose that number anywhere; a host
  rendering the dialog by hand must repeat it. A core `reentryHours` on the snapshot or `Vault`
  would end that, at the cost of surface in `vault.ts`, which threads 1 and 2 are editing.
