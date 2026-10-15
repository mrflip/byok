---
"safebyok": minor
"safebyok-convex": minor
"safebyok-react": patch
---

**The stored vault bundle changes shape, with no migration** (until 1.0.0, nothing binds backward). A bundle's `key_deriver_label`, `passphrase_salt_b64` and `vault_key_passphrase_wrapped` are replaced by `unlocks`, a list of one to `MaxUnlocks` (8) unlock envelopes, each `{ method: 'passphrase', unlock_id, unlocklabel, key_deriver_label, salt_b64, vault_key_wrapped }`, each wrapping the one vaultKey under its own passphrase and salt. A bundle written before this fails validation and reads as `corrupt_record`, left as it is: a development vault is destroyed and made anew. A Convex deployment holding such bundle rows refuses the new component schema at deploy until those rows (and their vaults' lockboxes) are deleted. Lockboxes and the device record are unchanged.

A vault may now have several passphrases. `vault.addPassphrase(passphrase, newPassphrase, { unlocklabel })` adds one and returns its `unlock_id`; `vault.removeUnlock(passphrase, unlockId)` removes one, never the last (kind `last_unlock`); `changePassphrase(old, new, { unlockId? })` changes only the passphrase `old` opens, keeping its id and label. Each asks for a passphrase the vault opens with, even while unlocked, and moves `unlock_epoch`, so every other device locks. `unlock(passphrase, { unlockId? })` tries each passphrase in turn, one key derivation apiece, or only the one named. The snapshot lists the ways in, locked or not, as `unlocks` (`UnlockSummary`: `method`, `unlock_id`, `unlocklabel`). New exports: `MaxUnlocks`, `PassphraseEnvelope`, `UnlockEnvelope`, `UnlockMethodVals`, and the types `UnlockMethod` and `UnlockSummary`. New error kinds, all conditions: `absent_unlock`, `too_many_unlocks`, `last_unlock`; a taken `unlocklabel` is `bad_label`.

`safebyok/testing`'s `bundleOf` builds the new shape, and a new `envelopeOf` builds one fake passphrase envelope. `safebyok-convex`'s `VaultBundle` validator and table follow, with new `PassphraseEnvelope` and `UnlockEnvelope` validators. `safebyok-react`'s empty snapshot carries `unlocks: []`.
