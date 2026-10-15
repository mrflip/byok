---
"safebyok": minor
---

**Misuse is refused at the door, with a `kind`, where it used to meet a `TypeError` later.** `openVault` refuses a `userId` that is not non-empty text (`bad_label`), a call with no options bag, and a `vaultDB` or `deviceDB` missing a verb (`bad_option`), before it touches storage. `unlock` and `changePassphrase` refuse a passphrase that is not text, `subscribe` a listener and `use` a callback that is not a function, each with `bad_option`. `browserOpts`, `idbVaultDB`, `idbDeviceDB` and `inspectIdb` refuse a `dbName` that is not non-empty text, and `inspectIdb` an unknown `shelf`, with `bad_option`; `IdbOpts.dbName` now also accepts `undefined`, read as the default.

**A `VaultDB` checks what it is handed to write.** Every write verb validates its record and its expectation against the schemas a read uses, and refuses one this package would never write with `bad_option` (`bad_label` for a label), quoting none of it, before your adapter's `do*` method is called. `updateBundle` refuses a bundle whose `vault_id` is not the expected one. A field the core does not know is stripped, so it never reaches storage. Nothing a vault writes is affected, and no stored record changes shape. `safebyok/testing`'s `describeVaultDB` checks the refusals for every adapter.

**A remembered unlock must name its vault.** A device record whose `applabel`, `user_id` or `vaultlabel` is not the vault's is forgotten as unreadable, said through the `logger`, and the vault opens locked.

**The vault-size check is unchanged in effect.** It now reads as each lockbox counted at twice `maxWhisperBytes` plus 2 KiB for its other fields, against the adapter's whole `maxVaultBytes`; this admits exactly the configurations the old reading did, and the 2 KiB covers a lockbox's other fields at their largest, with a `user_id` of up to 512 bytes.
