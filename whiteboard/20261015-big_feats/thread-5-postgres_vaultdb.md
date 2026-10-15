# Thread 5: postgres_vaultdb (2026-10-15)

Branch `20261015-postgres_vaultdb`, PR not yet filed; to be stacked on thread 2's PR (cut from
#63's tip `ea4b93d`, rebased onto thread 2 before filing). Justify: green -- root 105, core 705,
convex 265, postgres 131, react 28, demo 61; postgres coverage 100% lines, 98.8% branches.

* **Built**: `packages/safebyok-postgres/`, packaged like the core and React binding (ESM+CJS,
  tsdown-written `exports`, `safebyok` a peer, its own eslint cut from the core's, a README, a
  changeset, a place in the `fixed` group).
  - `vault-tables.sql`, also exported as `VaultTablesSql`: `safebyok_bundles` and
    `safebyok_lockboxes`, **a column to a field** (text, bigint, each Ciphered one opaque
    `jsonb`; a lockbox with no note has a null `note`), the lockbox's foreign key naming its bundle
    down to the `vault_id` with `ON DELETE CASCADE`, row-level security on with no policy, and a
    trigger notifying `safebyok_vault_changes` (`VaultChangeChannel`) with the scope as JSON.
  - `src/columns.ts`: **the one row mapper**. `BundleColumns` and `LockboxColumns` name each
    record's columns once; the compiler holds each list to the record's fields both ways (a field
    missing, or a stray column, fails to compile); every statement is built from them;
    `paramsOf`/`recordOf` map a record to parameters and a row back. A test holds the DDL's
    columns (information_schema) to these lists, name, type and order.
  - `postgresVaultDB({ client, userId, listen })` -> `PostgresVaultDB`: the per-request factory.
    `client` is anything with `query(text, params) => Promise<{ rows }>` (pg Pool/Client/PoolClient
    and PGlite type-checked as they stand). Every verb one statement. `not_permitted` for another
    user's scope, or any while signed out, before any query. `subscribe` fed by an optional
    `listen(channel, onNotify) => unlisten | Promise<unlisten>`.
  - `PostgresVaultDB.listBoxRecords(scope)`: the listing as stored records (see Discoveries).
  - Tests: `describeVaultDB` over it (one VaultDB per user, `TH.perUser`), and again over the
    README's route recipe (`tests/route-recipe.test.ts`, a POST handler plus a client VaultDB
    over fetch, run in-process); authorization, storage shape, unicode kept, trouble kinds, the
    foreign-key race, subscribe and its listen lifecycle, row-level security, the pg fan-out.
* **Decisions taken**:
  - The client is an object with a `query` method, not a bare function: `pool` and `pglite` pass
    as they stand, with no `this`-binding trap (`pool.query` unbound fails).
  - The statement races, each closed by one statement: create is `ON CONFLICT DO UPDATE` (no-op)
    `RETURNING`, since `DO NOTHING` returns no row when a concurrent insert wins; a first lockbox
    is `INSERT ... SELECT FROM safebyok_bundles WHERE vault_id = $`, and a foreign-key violation
    (SQLSTATE 23503, a bundle erased meanwhile) resolves `false`; a replacement matches the
    lockbox row's own `vault_id`, which the foreign key keeps equal to its bundle's.
  - `updateBundle` lands only when the new bundle's `vault_id` equals the expectation's.
  - bigints are read as `::float8` and jsonb as `::text` (parsed by us), so every driver hands
    back numbers and the same JSON whatever its type parsers; every parameter is cast.
  - Table and channel names are fixed (no prefix option): no identifier is ever interpolated
    from a host. A host wanting another schema uses `search_path`.
  - `maxRecordBytes` 1 MiB, `maxVaultBytes` Infinity: the server sets no vault limit.
  - No zod import: the three option checks are hand-written, as convexVaultDB's are; the
    notification payload is parsed with the core's exported `VaultScope`.
  - RLS on with no policy, in the DDL itself: harmless to the owner role, and it keeps Supabase's
    Data API out.
* **Deviations**:
  - Packaging follows `safebyok-react`'s tsdown shape rather than `safebyok-convex`'s (whose
    hand-written, ESM-only exports are Convex's component layout), so the package builds ESM and
    CJS like the core.
  - The plan's first rule (records whole as text) was built first, then replaced at the Coach's
    correction with field-by-field columns before any commit.
* **Discoveries**:
  - **A VaultDB's public `listBoxes` output is not valid `doListBoxes` input.** Summaries drop
    `format` and give `note: null`; the base class validates a listing as records with `format`
    and an optional string note. So a VaultDB over a wire cannot serve the server VaultDB's public
    `listBoxes`: hence `listBoxRecords`. **Thread 6 meets this** in its listBoxes resolver: use
    `listBoxRecords`, or the core grows a way for `doListBoxes` to hand back summaries.
    gripe_fixes' `vaultdb_validation` may move listing to whole-row validation, which would make
    the wire carry ciphered fields too; `listBoxRecords` would then select every column.
  - The suite's two users through one adapter means a per-request VaultDB needs `perUser`.
  - PGlite starts in about a second once its wasm is cached; tests share one per file and
    truncate. NOTIFY is delivered to the same PGlite, deduplicated per transaction.
  - For thread 6: `vaultDB.subscribe(scope, onChange)` is the change hook a subscription
    resolver wraps; one `listen` (the README's pg fan-out) is shared by every per-request VaultDB.
* **For the Coach**:
  - Before filing: rebase onto thread 2's tip and move the bundle's columns to its `unlocks`
    shape: `vault-tables.sql` (with `src/vault-tables.ts`, a copy a test checks) and
    `BundleColumns` in `src/columns.ts`. `unlocks` is one `jsonb` column.
  - The server holds no vault limit (Convex's component does). Worth a follow-up: a lockbox count
    cap inside the insert statement, refusing `vault_full`.
  - The Supabase section is from Supabase's docs, untested against Supabase.
