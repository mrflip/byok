---
'safebyok': minor
'safebyok-convex': minor
'safebyok-indexeddb': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
---

**`passphrase_epoch` is now `unlock_epoch`, in every stored record and every adapter, with no alias and no migration.** The counter moves whenever any way into the vault changes (a passphrase or a passkey added, removed or changed), so the old name no longer fit. It is renamed in the vault bundle (`VaultBundle`), the remembered device unlock (`DeviceUnlock`), a `VaultDB`'s `BundleExpectation`, `safebyok/testing`'s `bundleOf`, `safebyok-convex`'s tables and validators, `safebyok-indexeddb`'s checks, `safebyok-postgres`'s column (`vault-tables.sql` and the exported DDL: a host re-creates its `safebyok_bundles` table, or renames the column, `ALTER TABLE safebyok_bundles RENAME COLUMN passphrase_epoch TO unlock_epoch`), and `safebyok-graphql`'s schema fields (client and server halves must be the same version). A vault written under the old name fails validation: it reads as corrupt (`corrupt_record`) or absent, and a remembered unlock on a device reads as absent, so that device asks for the passphrase once.
