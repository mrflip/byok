---
"safebyok": minor
"safebyok-react": minor
---

**A `userId` is now at most 100 characters.** `openVault` refuses a longer one with kind `bad_label`, before it touches storage, and says the bound without quoting the id. So does every `VaultDB` verb, for a scope's `user_id`. A stored bundle or remembered unlock naming a longer `user_id` fails validation, as any damaged record does; until 1.0.0 there is no migration. The bound is the new exported `UserId` schema, which a host can use to check an id before opening a vault.

**`erase()` removes a damaged lockbox.** A lockbox whose stored record fails verification (it reads as `corrupt_record`) used to refuse `erase()` too, leaving `destroy()` as the only remedy; `erase()` now removes it, and leaves the vault's other lockboxes as they were. What `erase()` refuses otherwise is unchanged: a locked vault, an absent lockbox, a bad label, a vault replaced elsewhere.

**The vault reports its unlock window.** `Vault` has a new `reentryWindowMs`: how long an entered passphrase lasts on this device, in milliseconds, with the default and `Infinity` already applied. `Infinity` hours reads as the new export `ForeverMs`, the longest window a vault keeps (`FarFuture - FarPast`). A host's own `Vault` stand-in (a test fake, say) needs the property too.

**`PassphraseModal` drops its `reentryHours` prop** (`safebyok-react`): the dialog reads the window from the vault it is given, so it always matches the vault's own. A host rendering the dialog by hand should remove the prop; `VaultProvider` no longer passes it.
