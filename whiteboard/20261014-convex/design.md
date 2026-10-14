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
* **Stale-write protection (CAS) is another thread's**; this adapter adopts it when it lands.
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

| VaultDB             | Convex function                 | Notes                                                    |
| ------------------- | ------------------------------- | -------------------------------------------------------- |
| `fetchBundle`       | query `getBundle`               | record minus `_id`, `_creationTime`; or null             |
| `saveBundle`        | mutation `putBundle`            | upsert by scope                                          |
| `trashBundle`       | mutation `dropBundle`           |                                                          |
| `fetchBox`          | query `getBox`                  |                                                          |
| `saveBox`           | mutation `putBox`               | upsert; refuses when the scope holds no bundle           |
| `trashBox`          | mutation `dropBox`              |                                                          |
| `fetchBoxes`        | query `listBoxRecords`          | full records                                             |
| `createBundle` (ov) | mutation `createBundle`         | find-or-insert in one transaction: the race really closes |
| `listBoxes` (ov)    | query `listBoxSummaries`        | projected server-side, keeping `format`; sorted client-side |
| `eraseVault` (ov)   | mutation `eraseVault`           | boxes and bundle in one transaction                      |
| `subscribe` (ov)    | `onUpdate` on query `watchVault` | `{ vault_id, passphrase_epoch, boxes: [[boxlabel, revision_id]] }`; first emit skipped |

Every function first resolves `getUserId(ctx)` (the host's: a component cannot read `ctx.auth`):
null refuses as unauthenticated, and a `user_id` argument that differs refuses as forbidden.

The client accepts a `ConvexReactClient` or a `ConvexClient`, so a React app reuses its socket.

## Open

* Whisper size cap in the core (Coach weighing the factors; see chat of 2026-10-14).
* Component packaging: `convex.config` export and generated types in the package build.
