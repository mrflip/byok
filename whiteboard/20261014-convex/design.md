# 20261014-convex: the Convex VaultDB adapter

Design agreed in chat with the Coach, 2026-10-14. Intent, not yet code.

## Decisions

* **A Convex component, in its own workspace package**, `packages/safebyok-convex` (like
  safebyok-react). It ships `convex.config` with its own isolated tables, a server class whose
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
* **Numbers are `v.number()`** (float64, exact to 2^53 - 1, the rulings' safe-integer storage
  contract), never `v.int64()`, which reads back as a BigInt.
* **Dev dependencies**: `convex-test` (with its `@edge-runtime/vm` environment) tests the
  component's functions under vitest. `convex-helpers` is left out: its Zod bridge is the kind of
  kit CLAUDE.md rules out, and nothing else in it is needed.

## Tables

`safebyok_bundles`: the VaultBundle record as-is. Index `by_scope: [user_id, applabel, vaultlabel]`.

`safebyok_lockboxes`: scope columns (`applabel`, `user_id`, `vaultlabel`) added on write and stripped
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

Every function first resolves `getUserId(ctx)`, the host's callback: inside a component
`ctx.auth` is not available, so the app authenticates and passes the user id in (Convex docs,
*Authoring Components*, which show the same re-export wrapper taking an auth callback). Null
refuses as unauthenticated, and a `user_id` argument that differs refuses as forbidden.

The client accepts a `ConvexReactClient` or a `ConvexClient`, so a React app reuses its socket.

## Sizes

Measured 2026-10-14. PKCS#8 PEM private keys are 1704, 3272 and 6392 bytes at RSA 2048, 4096 and
8192; their public keys 451, 800 and 1491. Stored as a whisper, the 8192 PEM is 8680 bytes of
base64 ciphertext. Per-record limits: DynamoDB 400 KB, Convex and Firestore 1 MiB; localStorage
holds about 5 MB per origin in all. The binding constraints on whisper size are those limits,
base64 growth, refresh fan-out (every refresh reads every lockbox) and one-shot WebCrypto
encryption holding the whole whisper in memory several times; encryption time is not one.

## Open

* Whisper size cap: built in the core, PR #7 (`maxWhisperBytes`, adapters' `maxRecordBytes`).
* A box written under one `vault_id` landing in a vault recreated under another: `versionedUpdate`
  does not see it (both expectations can hold). Checking `vault_id` would close it. The Coach
  calls it a huge hole; the storage thread closes it.
* Component packaging: `convex.config` export and generated types in the package build.
