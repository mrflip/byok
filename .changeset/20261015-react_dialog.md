---
"safebyok-react": minor
---

The passphrase dialog states the unlock window the vault really has. It said "seven days" whatever `forcePassphraseReentryHours` was; it now reads "for 7 days", "for 8 hours", "for 15 minutes" or, for `Infinity`, "until you lock it". `VaultProvider` hands the dialog its `forcePassphraseReentryHours`; a host rendering `PassphraseModal` itself passes the new optional `reentryHours` prop (default 168, the vault's own default), and a value that is no number of hours above zero is refused with kind `bad_option`.

An unlock that fails with a condition other than a wrong passphrase -- `storage_unavailable`, `not_permitted`, `corrupt_record`, and the rest of the condition family -- now shows the vault's calm message in the dialog, where the user may try again or cancel. Misuse, or a failure that is no `VaultError`, is thrown while the dialog renders, for the nearest error boundary above `VaultProvider`; before, it was rethrown into a promise nobody awaited, and went unhandled.
