---
"safebyok": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**Stored shape: every vault now records which vaultKey it stands under, and each device refuses an older copy of a vault it has already seen newer.** No vault written before this reads: no compatibility before 1.0. `openVault` refuses such a vault as `damaged_bundle`; `eraseDamagedVault(opts)` clears it (it knows `safebyok-vault-v1` as an older format, not a newer one), and the vault can then be made anew. Its lockboxes list as damaged until then.

- **`safebyok`**:
  - The bundle's format is `safebyok-vault-v2`. It gains `vault_key_epoch` (1 for a vault's first vaultKey) and `prior_vault_key` (absent until a vault's vaultKey is replaced). Each unlock envelope gains `vault_key_epoch`, `device_id` (a random id the device that added it keeps for the vault) and `registered_at`, all bound into its wrap. An envelope at another `vault_key_epoch` than its bundle's is passed over as damaged (`damaged_unlock`).
  - The lockbox's format is `safebyok-lockbox-v2`. It gains `vault_key_epoch`, bound into both its encryptions, so `LockboxSummary` and the snapshot's `boxes` carry it too. A lockbox at another epoch than its bundle's reads as `damaged_lockbox`.
  - `LockboxExpectation` gains `vault_key_epoch`. `VaultDB.updateBox` lands a lockbox only while the bundle stands at that epoch (`VAULTDB.md` line 3.8), and refuses as `bad_option` a lockbox whose own epoch is not the expected one. An adapter of your own compares it in its `doUpdateBox`, beside `vault_id` and `revision_id`; `describeVaultDB` tests it, and its new option `comparesVaultKeyEpoch: false` holds that test pending for an adapter that does not yet. `localVaultDB` compares it; the IndexedDB, Convex and Postgres adapters (and GraphQL's recipe, over Postgres) do not yet. Nothing in this release replaces a vaultKey either, so every vault stands at epoch 1 and the comparison has nothing yet to refuse.
  - `DeviceDB` gains `readMark`, `writeMark` and `eraseMark`, which a host's own `DeviceDB` must implement (`openVault` refuses one without them as `bad_option`), and `eraseAll` erases marks too. A device mark (`DeviceMark`, format `safebyok-mark-v1`) holds the device's id for the vault and the highest `unlock_epoch` it has seen. `memoryDeviceDB` and `idbDeviceDB` keep them; `Ckeys.mark` and `Ckeys.isMark` name their rows.
  - New error kind `rolled_back`, a condition: storage handed back an older bundle of the vault than this device has seen. It is refused at open, unlock, every change to the ways in and every refresh, and nothing is taken from it. `destroy()` and `eraseDamagedVault` erase the mark.
- **`safebyok-convex`**: the component's validators carry the new fields and formats, so a deployment holding records written before this no longer matches its schema: clear the component's tables before deploying it.
- **`safebyok-postgres`**: `safebyok_bundles` gains `vault_key_epoch` and `prior_vault_key`, and `safebyok_lockboxes` gains `vault_key_epoch`. `VaultTablesSql` creates only missing tables, so drop and recreate tables made before this.
- **`safebyok-graphql`**: the schema carries the new fields (`prior_vault_key` as the scalar `SafebyokPriorVaultKey`), and a lockbox expectation's `vault_key_epoch`.
