---
"safebyok": minor
"safebyok-react": patch
---

**`vault.addPasskey` takes a function that makes the passkey, not the passkey itself**, and calls it only once its proof holds: `vault.addPasskey(passphrase, () => createPasskey({ ... }), { unlocklabel })`. A mistyped passphrase, a taken label or a full vault is now refused before the authenticator is asked, so it leaves no passkey behind that opens nothing. It resolves the new `unlock_id`, or null when the maker resolved null (the user dismissed the prompt), adding nothing; it refuses with kind `bad_option` anything but a function in that place, and throws what the maker throws. A host change of one line: wrap the `createPasskey(...)` call in `() => ...`, and test the result for null instead of the passkey. Nothing stored changes.
