# safebyok-convex

safebyok's storage on [Convex](https://convex.dev): a Convex **component** that holds each vault's
bundle and lockboxes, ciphertext and public fields only, in tables of its own. Your Convex
backend never sees a whisper, a passphrase, or any key that opens one.

A workspace package, source-exported (`exports` points at `src/`) while the interface settles;
not yet built or published. `convex` is a peer dependency.

## What your app adds to its `convex/` directory

Install the component, in `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import safebyok from 'safebyok-convex/convex.config'

const app = defineApp()
app.use(safebyok)
export default app
```

Serve its functions to your clients, from a module of your own, `convex/safebyok.ts`. They call
your `getUserId` first: say who is signed in, the same id your app passes to `openVault` as
`userId`.

```ts
import { SafebyokComponent } from 'safebyok-convex/server'
import { components } from './_generated/api'

export const {
  getBundle, createBundle, updateBundle, getBox, listBoxSummaries,
  updateBox, eraseBox, eraseVault, watchVault,
} = new SafebyokComponent(components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
})
```

Run your usual Convex codegen, and your clients reach these as `api.safebyok.*`.

* **Who may reach a vault.** Each function refuses a caller who is signed out (`getUserId`
  answers null, undefined or empty), or whose id is not the vault's `user_id`, with a
  `ConvexError` whose `data` is `{ kind: 'not_permitted', message }`. The kind is the safebyok
  `VaultError` kind of the same name. The message names no user and quotes no record.
* **Writes that come too late.** An update (`updateBundle`, `updateBox`) or an erase
  (`eraseBox`, `eraseVault`) carries what its writer expects to stand -- the vault's `vault_id`,
  and the bundle's `passphrase_epoch` or the lockbox's `revision_id` -- and checks it in the same
  transaction it writes in. When that no longer stands, it writes nothing and resolves `false`,
  which the client turns into a `stale_write`. Not an error: no `ConvexError`, nothing in your logs.

## What is stored

Two tables, inside the component, beside nothing of your app's:

| Table                | One row per | Columns                                                         | Index                                                |
| -------------------- | ----------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `safebyok_bundles`   | vault       | the `VaultBundle` record as-is                                  | `by_scope`: `user_id`, `applabel`, `vaultlabel`      |
| `safebyok_lockboxes` | lockbox     | the `Lockbox` record as-is, and its vault's scope columns       | `by_box`: `user_id`, `applabel`, `vaultlabel`, `boxlabel` |

* **Encrypted**, as `{ cipher_iv_b64, ciphertext_b64 }`: each whisper (`whisper_ciphered`), each
  lockbox's lockboxKey (`lockbox_key_wrapped`), and the vaultKey (`vault_key_passphrase_wrapped`).
* **In the open**: the scope (`applabel`, `user_id`, `vaultlabel`), each `boxlabel` and `note`,
  the `vault_id`, `passphrase_epoch`, `revision_id`s, the passphraseSalt and key deriver's label,
  timestamps, and the length of every ciphertext.
* **Never**: a whisper, a passphrase, any key in usable form, or the device-local remembered
  unlock. No history: an update replaces its row. (Convex's own backups and exports keep what
  they keep.)
* `user_id` leads both indexes, so one user's rows are one range of each.

**How big a vault can be.** Listing a vault, watching it and erasing it each read the whole vault
in one Convex transaction, which may read 16 MiB; erasing reads it twice. A lockbox at the
largest whisper a vault stores by default is about 54 KB, so about 150 of those; a lockbox
holding an API key is about 1 KB, so thousands. Each record must also fit Convex's 1 MiB document
limit, which the core's `maxWhisperBytes` keeps well inside.

## The functions

Each is one `VaultDB` verb (the core's storage interface). Arguments and results are plain JSON:
the core's own records, scopes and expectations.

| Function           | Kind     | Arguments                                   | Resolves                                              |
| ------------------ | -------- | ------------------------------------------- | ----------------------------------------------------- |
| `getBundle`        | query    | `{ scope }`                                 | the `VaultBundle`, or null                            |
| `createBundle`     | mutation | `{ bundle }`                                | the bundle standing after: this one, or the first one |
| `updateBundle`     | mutation | `{ bundle, expected: { vault_id, passphrase_epoch } }` | `true` if written, `false` if not           |
| `getBox`           | query    | `{ scope, boxlabel }`                       | the `Lockbox`, or null                                |
| `listBoxSummaries` | query    | `{ scope }`                                 | each lockbox without its ciphered fields, `format` kept, in boxlabel order |
| `updateBox`        | mutation | `{ scope, lockbox, expected: { vault_id, revision_id } }` | `true` if written, `false` if not        |
| `eraseBox`         | mutation | `{ scope, boxlabel, expected: { vault_id } }` | `true` if the vault still stands (box or none), `false` if not |
| `eraseVault`       | mutation | `{ scope, expected: { vault_id } }`         | `true` if erased, `false` if not                      |
| `watchVault`       | query    | `{ scope }`                                 | `{ vault_id, passphrase_epoch, boxes: [[boxlabel, revision_id]] }`, changing with every write |

`scope` is `{ applabel, user_id, vaultlabel }`. A `revision_id` of null expects no lockbox there.

## Testing your own functions

`safebyok-convex/test` installs the component into a [`convex-test`](https://docs.convex.dev/testing/convex-test)
instance:

```ts
import { register } from 'safebyok-convex/test'

const t = convexTest(schema, modules)
register(t)
```

## Developing this package

`pnpm justify` here runs its lint, typecheck and tests: `convex-test` under the edge runtime,
in memory, with no deployment. The tests make real vaults with the core's own code, so build it
first (`pnpm build` at the repository root).

`src/component/_generated/` holds Convex's codegen output for the component, written by the
templates of the installed `convex` and never edited by hand. Codegen for a component needs a
Convex deployment, so until one has run it holds only the files Convex writes without one
(`server.ts`, `dataModel.ts`, and the untyped stub `api.ts`); the component's typed API,
`ComponentApi`, is derived from the functions themselves in `src/component-api.ts`.
