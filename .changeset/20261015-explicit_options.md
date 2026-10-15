---
'safebyok': minor
'safebyok-react': minor
---

**Breaking:** `openVault`'s `keyDeriver` is required, and so is `VaultProvider`'s: `openVault` no longer falls back to the Argon2id deriver, so an app that never imports it never ships it. The new entry point `safebyok/browser` exports `browserOpts({ dbName }?)`, the browser's defaults as a bag of options (`keyDeriver: argon2idWebV1Deriver`, `deviceDB: idbDeviceDB({ dbName })`): a browser app spreads it into `openVault` (or `<VaultProvider {...browserOpts()} />`) beside its own `vaultDB`, and may drop its own `deviceDB`. `argon2idWebV1Deriver` is still exported from `safebyok`, for an app that passes it itself. An `openVault` without a `keyDeriver` refuses with kind `bad_option`. Vaults already stored read as before.
