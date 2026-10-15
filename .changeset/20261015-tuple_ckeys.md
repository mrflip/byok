---
"safebyok": minor
---

**The stored format changes, with no migration** (until 1.0.0, nothing binds backward). `localVaultDB`, `idbVaultDB`, `idbDeviceDB` and `memoryDeviceDB` now file each row under the JSON text of its kind and names -- `["vault","acme","u1","main"]`, `["box","acme","u1","main","anthropic"]`, `["unlock","acme","u1","main"]` -- in place of the colon-joined `vault:acme:u1:main`. JSON quotes every name, so a name may hold any text, colons included, without two vaults ever sharing a row or listing each other's lockboxes.

What a host will see: a vault stored by an earlier version under one of these adapters reads as absent, so `openVault` reports it `absent` and the next `unlock()` makes a new, empty vault; a remembered unlock reads as absent, so the user enters the passphrase again. The old rows are not read, moved or deleted. They hold only ciphertext, except that an old remembered unlock on the device keeps the vaultKey wrapped under this browser's localUnlockKey, beyond the reach of `lock()`. To remove them, wipe both IndexedDB shelves once (`inspectIdb({ dbName, shelf: 'vault_db' }).wipe()`, and `shelf: 'device_db'`), or call `idbDeviceDB().eraseAll()`, which now clears every row on the device shelf. The Convex adapter keeps its names in columns and is unaffected.

New export: `Ckeys`, the ckeys these adapters use (`bundle`, `box`, `unlock`, `boxPrefix`, `isBoxIn`), for an adapter of your own over a key-value store.
