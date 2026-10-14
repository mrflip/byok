# 20261014-convex: the Convex VaultDB adapter

Design agreed in chat with the Coach, 2026-10-14. Intent, not yet code.

## Decisions

* **A Convex component, in its own workspace package**, `packages/byok-convex` (like
  byok-react). It ships `convex.config` with its own isolated tables, a server class whose
  `.api({ getUserId })` returns the functions the host re-exports from its `convex/` directory,
  and the client `convexVaultDB(client, api)`. `convex` is a peer dependency.
* **Typed schema columns** that mirror the Zod records field for field, not an opaque blob. A new
  record format widens a `v.union` on `format`: an additive deploy that ships with the package.
* **Ciphered fields stay nested**, `{ cipher_iv_b64, ciphertext_b64 }`, exactly as the record holds
  them, under one shared `ciphered` validator. Not flattened into columns, not `v.bytes()`.
* **Only the bundle and lockboxes go remote.** DeviceUnlock never does; no revision history is kept.
* **New error kinds are added as the adapter needs them** (likely `not_permitted`,
  `storage_unavailable`).
* **The adapter implements the vault's verbs directly** (the Coach's storage rulings,
  `whiteboard/20261014-crypto/rulings.md`): no fetch/save/trash primitives underneath. Each verb
  is one Convex query or mutation, and the base class keeps validation wrapped around it.
* **`versionedUpdate` is a mutation** that reads the standing row and checks its `revision_id`
  (lockbox) or `passphrase_epoch` (bundle) in the same transaction it writes in. Convex mutations
  are serializable, so the check is atomic for real; a failed expectation refuses as `stale_write`.
* **`maxRecordBytes` is 1 MiB** (1_048_576), Convex's document limit.
* **Dev dependencies**: `convex-test` (with its `@edge-runtime/vm` environment) tests the
  component's functions under vitest.

## Tables

`byok_bundles`: the VaultBundle record as-is. Index `by_scope: [user_id, applabel, vaultlabel]`.

`byok_lockboxes`: scope columns (`applabel`, `user_id`, `vaultlabel`) added on write and stripped
on read, plus the Lockbox record as-is. Index `by_box: [user_id, applabel, vaultlabel, boxlabel]`
serves both one box (all four) and the vault's boxes (the first three). `note` is omitted, never
written as `undefined`, which Convex refuses.

`user_id` leads both indexes: every call is one user's, and deleting an account is one range.

## Interface map

Verb names follow the rulings where they name one (`versionedUpdate`); the rest are as the
storage thread settles them.

| VaultDB verb                 | Convex function                  | Notes                                                       |
| ---------------------------- | -------------------------------- | ----------------------------------------------------------- |
| read the bundle              | query `getBundle`                | record minus `_id`, `_creationTime`; or null                |
| create the bundle            | mutation `createBundle`          | find-or-insert in one transaction: the creation race closes |
| `versionedUpdate`, bundle    | mutation `updateBundle`          | only if the standing `passphrase_epoch` is the expected one |
| read one lockbox             | query `getBox`                   |                                                             |
| list lockboxes               | query `listBoxSummaries`         | projected server-side, keeping `format`; sorted client-side |
| `versionedUpdate`, lockbox   | mutation `updateBox`             | only if the standing `revision_id` is the expected one, or there is none; refuses when the scope holds no bundle |
| erase a lockbox              | mutation `eraseBox`              | erase wins: no version expectation                          |
| erase the vault              | mutation `eraseVault`            | boxes and bundle in one transaction                         |
| subscribe                    | `onUpdate` on query `watchVault` | `{ vault_id, passphrase_epoch, boxes: [[boxlabel, revision_id]] }`; first emit skipped |
| `maxRecordBytes`             | (a constant)                     | 1 MiB                                                       |

Every function first resolves `getUserId(ctx)` (the host's: a component cannot read `ctx.auth`):
null refuses as unauthenticated, and a `user_id` argument that differs refuses as forbidden.

The client accepts a `ConvexReactClient` or a `ConvexClient`, so a React app reuses its socket.

## Open

* Whisper size cap: built in the core, PR #7 (`maxWhisperBytes`, adapters' `maxRecordBytes`).
* A box written under one `vault_id` landing in a vault recreated under another: `versionedUpdate`
  does not see it (both expectations can hold). Checking `vault_id` would close it.
* Component packaging: `convex.config` export and generated types in the package build.
