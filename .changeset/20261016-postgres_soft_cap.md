---
"safebyok-postgres": minor
"safebyok-graphql": patch
---

Postgres's lockbox limit is now the contract's best effort, and its push is opt-in: the tables ask nothing of a host beyond tables, columns and keys.

`safebyok_bundles` loses its `lockbox_count` column, and the count trigger, the `FOR UPDATE` row lock and the second read on a full vault go with it. A new lockbox is inserted in one statement that counts the vault's lockboxes as of its own start and says, from that one snapshot, why it missed: a vault at its limit is `vault_full`, a vault gone or a boxlabel already taken is `stale_write`, and so is a foreign key violation (`23503`) from a vault erased mid-statement. With no lock, writers racing for the last places under READ COMMITTED may each find room and all land, a few past the limit (by at most one less than the number of racers), which the contract allows (lines 4.2 to 4.5); the README says what it guarantees, that every guarantee holds at READ COMMITTED (above it some races fail with `40001`, refused as `storage_unavailable`), and offers an unsupported trigger for a host that wants a hard cap.

`VaultTablesSql` no longer installs the NOTIFY trigger. A host that wants other devices' writes pushed runs the new `VaultNotifySql` (also shipped as `vault-notify.sql`) once, and passes a `listen`; without it, `subscribe` never calls, the vault refreshes after its own writes, and another device's changes arrive on its next read. A host whose tables came from an earlier build should drop the column and the count trigger (`ALTER TABLE safebyok_bundles DROP COLUMN lockbox_count` and `DROP TRIGGER safebyok_lockboxes_counted ON safebyok_lockboxes`) and may run `VaultNotifySql` to keep push; before 1.0.0 nothing migrates for you. `safebyok-graphql`'s README points at `VaultNotifySql` for subscriptions over Postgres.
