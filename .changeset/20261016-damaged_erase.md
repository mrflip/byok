---
"safebyok": minor
"safebyok-react": minor
"safebyok-indexeddb": patch
---

**A vault stored damaged can now be erased, to start over.** When the stored bundle fails its checks `openVault` refuses with `damaged_bundle`, and `destroy()` needs a handle that was never made. New: `eraseDamagedVault(opts)`, taking `openVault`'s options, erases that vault's bundle and lockboxes through the `VaultDB` and the unlock this device remembers through the `DeviceDB`. It erases a vault `openVault` refuses as `damaged_bundle` and no other: a sound vault is refused with `bad_option` and nothing erased (it is `destroy()`'s), and a record too damaged to show its `vault_id`, or one a newer safebyok may have written (a `format`, unlock method or number of unlocks this one does not know), is refused as `damaged_bundle`, nothing erased. Any change to the stored shape must bump `format` for that to hold.

- **`safebyok`**: exports `eraseDamagedVault` and its `EraseDamagedVaultOpts`, and the `VaultDB` base class gains a public verb, `eraseDamagedVault(scope, validators?)`, which adapters inherit and implement nothing for. An adapter that hands each call on to another `VaultDB`'s public verbs hands this one on too. `localVaultDB` now erases a whole vault on its `vault_id` alone, as `VAULTDB.md` line 3.5 says; it also required a readable `unlock_epoch`, which kept a damaged vault from being erased.
- **`safebyok-react`**: `useVault()` gains `eraseDamagedVault()`, which erases the vault `openError` reports as `damaged_bundle` with the provider's own options and opens again; it does nothing for any other `openError`, and opens again when the erase finds the vault sound or made anew.
- **`safebyok-indexeddb`**: `idbVaultDB` erases a whole vault on its `vault_id` alone, likewise.
