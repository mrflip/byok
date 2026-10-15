---
'safebyok': minor
'safebyok-convex': minor
'safebyok-indexeddb': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
---

**`passphrase_epoch` is now `unlock_epoch`, in every stored record and every adapter, with no alias and no migration.** The counter moves whenever any way into the vault changes (a passphrase or a passkey added, removed or changed), so the old name no longer fit. It is renamed in the vault bundle (`VaultBundle`), the remembered device unlock (`DeviceUnlock`), a `VaultDB`'s `BundleExpectation`, `safebyok/testing`'s `bundleOf`, `safebyok-convex`'s tables and validators, `safebyok-indexeddb`'s checks, `safebyok-postgres`'s column (`vault-tables.sql` and the exported DDL), and `safebyok-graphql`'s schema fields. What a host with vaults already stored will see, by store:

* **IndexedDB, `localVaultDB`, or a host's own `VaultDB`**: a bundle written under the old name fails validation and reads as `corrupt_record`, left as it is: a development vault is cleared from storage and made anew.
* **Postgres**: `vault-tables.sql` creates only the tables that are missing, so running it again leaves an existing `safebyok_bundles` with its old column, and every bundle read and write fails as `storage_unavailable`, so no vault opens, until the host renames it, `ALTER TABLE safebyok_bundles RENAME COLUMN passphrase_epoch TO unlock_epoch` (which keeps every vault readable), or drops and re-creates the table.
* **Convex**: a deployment holding bundle rows under the old name refuses the new component schema at deploy until those rows (and their vaults' lockboxes) are deleted.
* **GraphQL**: the client and server halves must be the same version; a client of one against a server of the other fails every vault call as `storage_unavailable`.

On every device, a remembered unlock written under the old name reads as absent, so that device asks for the passphrase once.
