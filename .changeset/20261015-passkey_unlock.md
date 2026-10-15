---
"safebyok": minor
"safebyok-convex": minor
"safebyok-react": minor
---

**Fingerprint unlock: a vault's ways in may include passkeys** (a fingerprint, a face, a phone, a security key), through the WebAuthn PRF extension. A new unlock envelope, `{ method: 'passkey', unlock_id, unlocklabel, credential_id, prf_salt_b64, vault_key_wrapped }`, wraps the vaultKey under HKDF-SHA256 of the passkey's 32-byte PRF answer. Nothing already stored changes shape: a bundle written before reads as it did.

The core takes the answer as a `PasskeyProof` (`{ credentialId, prfSaltB64, prfBytes }`) and never calls WebAuthn. `vault.addPasskey(proof, passkey, { unlocklabel })` adds one and returns its `unlock_id`; `vault.unlock(passkey)` opens with one, with no key derivation, remembered on the device as a passphrase unlock is. `addPassphrase` and `removeUnlock` now take a passphrase or a passkey's answer as proof, so a passkey can set a new passphrase for a user who forgot theirs; `changePassphrase` still takes the passphrase it changes. A vault always keeps one passphrase: `removeUnlock` refuses removing the last with `last_unlock`, though passkeys remain. The snapshot's `unlocks` lists a passkey's `credential_id` and `prf_salt_b64` too (`UnlockSummary` is now a union by `method`). New exports: `PasskeyEnvelope`, `PasskeySaltBytes` and the type `PasskeyProof`; `UnlockMethodVals` gains `passkey`. New error kinds, both conditions: `wrong_passkey` and `passkey_unavailable`. `safebyok/utils` exports the base64url codec, `toB64` and `fromB64`. `safebyok/testing` gains `passkeyOf` (a fake passkey's answer) and `passkeyEnvelopeOf`.

`safebyok-react` adds `createPasskey()` and `askPasskey()`, which make the WebAuthn calls (and import no React), `passkeysAvailable()`, and `PasskeyUnlockButton`; `PassphraseModal` offers "Use a passkey" for a vault that has one. `safebyok-convex`'s `UnlockEnvelope` validator gains a `PasskeyEnvelope` member, an additive schema change.
