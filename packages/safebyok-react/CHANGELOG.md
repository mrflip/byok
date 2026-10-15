# safebyok-react

## 0.2.0

### Patch Changes

- Updated dependencies [[`0568faf`](https://github.com/mrflip/safebyok/commit/0568fafeca76287020a6f989ee447af07196b930)]:
  - safebyok@0.2.0

## 0.1.0

### Minor Changes

- [#44](https://github.com/mrflip/safebyok/pull/44) [`5ee702c`](https://github.com/mrflip/safebyok/commit/5ee702cda4c2d85abce7430b7da60dc9a58d6598) Thanks [@mrflip](https://github.com/mrflip)! - **Breaking:** `openVault`'s `keyDeriver` is required, and so is `VaultProvider`'s: `openVault` no longer falls back to the Argon2id deriver, so a bundled app that never imports it never ships it. The new entry point `safebyok/browser` exports `browserOpts({ dbName }?)`, the browser's defaults as a bag of options (`keyDeriver: argon2idWebV1Deriver`, `deviceDB: idbDeviceDB({ dbName })`): a browser app spreads it into `openVault` (or `<VaultProvider {...browserOpts()} />`) beside its own `vaultDB`, and may drop its own `deviceDB`. `argon2idWebV1Deriver` is still exported from `safebyok`, for an app that passes it itself. An `openVault` without a `keyDeriver` refuses with kind `bad_option`. Vaults already stored read as before. **Also renamed, before the first release makes them costly:** the snapshot's `expiresAt` is now `askPassphraseAt`; the `openVault` and `VaultProvider` option `rememberForMs` is now `forcePassphraseReentryHours`, counted in hours (fractions allowed: `0.25` is fifteen minutes) and refused with kind `bad_option` unless above zero; and the exported `SevenDaysMs` is replaced by `ForcePassphraseReentryHours`, its default, 168. A host passing `rememberForMs: ms` passes `forcePassphraseReentryHours: ms / 3_600_000`. Remembered unlocks already on a device keep their deadline.

- [#44](https://github.com/mrflip/safebyok/pull/44) [`64d09c3`](https://github.com/mrflip/safebyok/commit/64d09c36dfc5c63f1781dea17c42354c244ccf3d) Thanks [@mrflip](https://github.com/mrflip)! - A vault holds at most 100 lockboxes by default (`MaxLockboxes`), raised with the new `openVault` option `maxLockboxes`; `store()` of a new lockbox in a full vault refuses with the new error kind `vault_full` (replacing a lockbox never does), and `VaultProvider` passes `maxLockboxes` through. **Breaking, for adapter authors:** `VaultDB` gains an abstract `maxVaultBytes`, the most the backend holds of one vault in bytes (`Infinity` for none), and `openVault` refuses with kind `bad_option` a `maxLockboxes` and `maxWhisperBytes` that might not fit it, or an adapter that does not declare it. A custom adapter adds `readonly maxVaultBytes = Infinity`, or its backend's real limit. A host that switches on every `VaultErrorKind` adds a case for `vault_full`. Vaults already stored read as before, and a vault already holding more than its limit keeps every lockbox: it can read, replace and erase them, and stores a new one once it is back under the limit.

- [#28](https://github.com/mrflip/safebyok/pull/28) [`800ce29`](https://github.com/mrflip/safebyok/commit/800ce29418659365a3c5731f9e1a5bce54a4f499) Thanks [@mrflip](https://github.com/mrflip)! - First release. `safebyok` is an end-to-end encrypted vault for the API keys and other small secrets users bring to a browser app: encrypted on the user's device under keys that never leave it, synced through a storage layer the host app plugs in (an IndexedDB adapter ships as `safebyok/idb`). `safebyok-react` is its React binding: a provider that follows the signed-in user, snapshot hooks, and a guard that asks for the passphrase on demand.

### Patch Changes

- [#33](https://github.com/mrflip/safebyok/pull/33) [`09c35ac`](https://github.com/mrflip/safebyok/commit/09c35acea82ac81642558960b06cb09e66dde529) Thanks [@mrflip](https://github.com/mrflip)! - The unlock dialog now says plainly that a forgotten passphrase cannot be recovered, as the dialog for choosing one already did.

- [#32](https://github.com/mrflip/safebyok/pull/32) [`5650a9e`](https://github.com/mrflip/safebyok/commit/5650a9ee7271f7c1f93ad02bc2fc70fe42c72881) Thanks [@mrflip](https://github.com/mrflip)! - `VaultProvider` no longer swallows a failed `openVault`: it throws the error while rendering, so an error boundary and the dev overlay show it. A bad label or option and unreachable storage were silent before.
- Updated dependencies [[`a0927b2`](https://github.com/mrflip/safebyok/commit/a0927b2c135619e2f36d9900330acd24f1155bde), [`5ee702c`](https://github.com/mrflip/safebyok/commit/5ee702cda4c2d85abce7430b7da60dc9a58d6598), [`a5ec52a`](https://github.com/mrflip/safebyok/commit/a5ec52aab3ff627b2fe8680ad5ca767b856cdc17), [`64d09c3`](https://github.com/mrflip/safebyok/commit/64d09c36dfc5c63f1781dea17c42354c244ccf3d), [`800ce29`](https://github.com/mrflip/safebyok/commit/800ce29418659365a3c5731f9e1a5bce54a4f499), [`69defa2`](https://github.com/mrflip/safebyok/commit/69defa2e9ed54f288496ff05583b0111306b01e2)]:
  - safebyok@0.1.0
