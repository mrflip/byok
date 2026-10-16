---
'safebyok': minor
'safebyok-convex': minor
'safebyok-indexeddb': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
---

**Every storage adapter declares how many lockboxes it holds in one vault, and the Postgres server enforces its own.**

* **Breaking, for adapter authors:** `VaultDB` gains an abstract `maxLockboxes`, the most lockboxes the backend holds in one vault, or `Infinity` for no limit. A custom adapter adds `readonly maxLockboxes = Infinity`, or its backend's real limit (a large whole number where the limit must cross a wire or be stored). `openVault` refuses, with kind `bad_option`, an adapter that declares none.
* `openVault`'s `maxLockboxes` defaults to the smaller of `MaxLockboxes` (100) and the adapter's own, and is refused with kind `bad_option` when it is larger than the adapter's.
* `localVaultDB` and `idbVaultDB` declare `Infinity`; `convexVaultDB` declares the component's own limit, 8,000.
* `postgresVaultDB` takes a `maxLockboxes` option (default 1000; for no practical limit pass a large number, such as `1_200_300_400_500_600`, since `Infinity` cannot reach Postgres) and enforces it, as a best effort, inside the statement that inserts a new lockbox, refusing one past it with kind `vault_full`; a replacement never is. Writers racing for the last places may each find room and all land, a few past the limit, which the VaultDB contract allows. It keeps no count in the tables: `safebyok_bundles` has no `lockbox_count` column and nothing counts lockboxes by trigger.
* `graphqlVaultDB(client, { maxLockboxes })` declares what the server's VaultDB enforces (default 1000, the Postgres VaultDB's default); the server's `vault_full` crosses as itself.
