---
'safebyok-postgres': minor
---

`safebyok-postgres`, new: safebyok's storage in Postgres, run on the host's server. `VaultTablesSql` (shipped too as `vault-tables.sql`) makes two tables holding each record a column to a field, its encrypted values as opaque `jsonb`, with row-level security on and no policy, and a trigger that notifies `safebyok_vault_changes` after every write. `postgresVaultDB({ client, userId, listen })`, made per request for the signed-in user, is the VaultDB over them, through any driver with `query(text, params)` (a `pg` Pool or Client, a PGlite as they stand; postgres.js with a one-line wrapper): every verb one statement, another user's vault refused with `not_permitted`, and `subscribe` fed by an optional `listen`. Its `listBoxRecords` serves a listing as stored records, for a route carrying the verbs to a VaultDB in the browser; the README has that route recipe, tested whole, and a section for writing an adapter of your own.
