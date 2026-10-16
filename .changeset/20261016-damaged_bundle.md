---
"safebyok": minor
"safebyok-react": minor
---

**Three new error kinds for a vault stored damaged, all conditions** (`VaultErrorKindVals` and `VaultErrorFamilyForKind` grow): `damaged_bundle`, `damaged_unlock` and `damaged_lockbox`. Each says only what the vault can know, with a calm message saying what to do.

- **`damaged_bundle`**: the vault's stored bundle fails its checks, so no way in can be tried. `openVault` (and any call that reads the bundle) now refuses with it where it refused `corrupt_record`; storage's own refusal is its `cause`. A host that branched on `openError.kind === 'corrupt_record'` (as `safebyok-react`'s README and the demo did) branches on `damaged_bundle` now.
- **`damaged_unlock`**: a way in is stored in a form this package never writes (a salt of the wrong length, or not base64url). Such a way in is now **passed over**, and the others tried as ever: before, one damaged passphrase envelope refused every passphrase unlock with `corrupt_record`. An unlock aimed (`unlockId`) at a damaged one, a passkey whose envelope is damaged, or a vault whose every passphrase is damaged refuses with `damaged_unlock`; the user unlocks another way, and `removeUnlock()` removes the damaged one. `safebyok-react`'s `askPasskey` likewise leaves out a passkey whose `credential_id` or `prf_salt_b64` is not base64url, or whose salt is not 32 bytes long, refusing `damaged_unlock` (it was `corrupt_record`) only when every passkey is damaged.
- **`damaged_lockbox`**: `read()` and `use()` of a lockbox whose record fails its checks, or will not open under the vault's own key, or opens to no whisper. They refused `corrupt_record`. The message names the lockbox and offers `erase()` or a fresh `store()`.

`corrupt_record` stays, as a `VaultDB`'s refusal of a record it reads back; a vault call now says what that means for the vault instead.

A passphrase that opens no envelope is still `wrong_passphrase`, and a passkey's answer that does not open its envelope still `wrong_passkey`, because the decryption fails alike for a wrong proof and for a vault altered in storage. Their messages now say the stored vault may be damaged; a host matching their exact text will see new wording. Nothing stored changes.
