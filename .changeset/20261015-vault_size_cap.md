---
'safebyok': minor
'safebyok-react': minor
---

A vault holds at most 100 lockboxes by default (`MaxLockboxes`), raised with the new `openVault` option `maxLockboxes`; `store()` of a new lockbox in a full vault refuses with the new error kind `vault_full` (replacing a lockbox never does), and `VaultProvider` passes `maxLockboxes` through. **Breaking, for adapter authors:** `VaultDB` gains an abstract `maxVaultBytes`, the most the backend holds of one vault in bytes (`Infinity` for none), and `openVault` refuses with kind `bad_option` a `maxLockboxes` and `maxWhisperBytes` that might not fit it, or an adapter that does not declare it. A custom adapter adds `readonly maxVaultBytes = Infinity`, or its backend's real limit. A host that switches on every `VaultErrorKind` adds a case for `vault_full`. Vaults already stored read as before, and a vault already holding more than its limit keeps every lockbox: it can read, replace and erase them, and stores a new one once it is back under the limit.
