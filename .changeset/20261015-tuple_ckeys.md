---
"safebyok": minor
"safebyok-indexeddb": minor
---

**The stored format changes, with no migration** (until 1.0.0, nothing binds backward). `localVaultDB`, safebyok-indexeddb's `idbVaultDB`, `idbDeviceDB` and `memoryDeviceDB` now file each row under the JSON text of its kind and names -- `["vault","acme","u1","main"]`, `["box","acme","u1","main","anthropic"]`, `["unlock","acme","u1","main"]` -- in place of the colon-joined `vault:acme:u1:main`. JSON quotes every name, so a name may hold any text, colons included, without two vaults ever sharing a row or listing each other's lockboxes.

What a host will see: a vault stored by an earlier version under one of these adapters reads as absent, so `openVault` reports it `absent` and the next `unlock()` makes a new, empty vault; a remembered unlock reads as absent, so the user enters the passphrase again. Old vault rows are not read, moved or deleted; they hold only ciphertext, and a host that wants them gone wipes the vault shelf once (`inspectIdbVaultDB({ dbName }).wipe()` from safebyok-indexeddb, or the `localStorage` prefix it gave `domStore`). An old remembered unlock on the device is different, since it keeps the vaultKey wrapped under this browser's localUnlockKey: `idbDeviceDB` deletes it, unread, the first time it reads or erases a remembered unlock after the upgrade -- an open that finds the vault, or any lock; under `idbVaultDB` or `localVaultDB`, whose first open finds no vault, that is the first lock or the first open after an unlock -- along with any other row on the device shelf that is not under an unlock's new ckey, so `lock()` still forgets every unlock on the device. `idbDeviceDB({ dbName }).eraseAll()` now clears the whole device shelf. The Convex adapter keeps its names in columns and is unaffected.

New export: `Ckeys`, the ckeys these adapters use (`bundle`, `box`, `unlock`, `boxPrefix`, `isBoxIn`, `isUnlock`), for an adapter of your own over a key-value store.
