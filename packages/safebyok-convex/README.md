# safebyok-convex

safebyok's storage on [Convex](https://convex.dev): a Convex **component** that holds each vault's
bundle and lockboxes, ciphertext and public fields only, in tables of its own, and
**`convexVaultDB`**, the client side a vault stores through. Your Convex backend never sees a
whisper, a passphrase, or any key that opens one.

## Install

```sh
pnpm add safebyok safebyok-convex convex
```

`safebyok` and `convex` are peer dependencies: your app installs them itself, so the adapter and
your app share one copy of each, and a `VaultError` from one is a `VaultError` to the other.

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

## What your app does on the client

`convexVaultDB(client, api.safebyok)`, from `safebyok-convex`, is a vault's storage: a `VaultDB`
whose every call is one call to the functions above, through the Convex client your app already
has. Hand it to `openVault`:

```ts
import { ConvexClient } from 'convex/browser'
import { openVault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { convexVaultDB } from 'safebyok-convex'
import { api } from '../convex/_generated/api'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
convex.setAuth(fetchToken) // your auth provider's token, as for any Convex call

const vault = await openVault({
  applabel: 'acme', userId, vaultlabel: 'main',
  vaultDB:  convexVaultDB(convex, api.safebyok),
  ...browserOpts(), // the key deriver and device store a browser wants
})
```

In a React app, pass the `ConvexReactClient` you give `ConvexProvider`, so the vault shares its
socket and its signed-in user. `safebyok-convex` itself imports nothing of React's.

* **Sign in first.** `userId` is the id your `getUserId` answers for the signed-in user. Open
  the vault once the Convex client is authenticated (in React, once `useConvexAuth()` says so):
  a call made before then is refused with kind `not_permitted`.
* **Close the vault when the user signs out.** Signing out of Convex does not lock it: every
  call it makes is refused from then on, but the unlocked vaultKey stays in memory until the
  vault locks, expires or closes.
* **Other devices' writes arrive live.** The vault watches `watchVault` and refreshes whenever
  it changes, so its snapshot (and a React render) follows writes from anywhere.
* **Refusals** are `VaultError`s: `not_permitted` (signed out, or not this user's vault);
  `stale_write` (another device changed the vault first: the vault has already caught up, so
  read again before retrying); and `storage_unavailable` for anything else Convex reported, with
  Convex's own error as its `cause`.
* **Offline, a call waits** for the connection, as every Convex call does, rather than failing.
  Convex resends a mutation when it reconnects, so a write may land after any timeout you set:
  show progress, but don't report it failed.
* A record holds at most 1 MiB, Convex's document limit; `openVault` keeps `maxWhisperBytes`
  under half of it. A vault holds at most 8 MiB in all (`maxVaultBytes`; see *How big a vault
  can be*).

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
in one Convex transaction, which may read 16 MiB; erasing reads it twice, so `convexVaultDB`
declares a `maxVaultBytes` of 8 MiB. A vault holds 100 lockboxes by default, raised with
`maxLockboxes` as far as `maxVaultBytes` allows: `openVault` refuses, with kind `bad_option`, a
`maxLockboxes` whose lockboxes at `maxWhisperBytes` each might not fit, and its message says how
many would. At the default `maxWhisperBytes` (40444) that is at most 101; at a `maxWhisperBytes`
of 2048, ample for API keys, it is 1365. A store past the limit is refused with kind
`vault_full`, until a lockbox is erased. Each record must also fit Convex's 1 MiB document limit,
which the core's `maxWhisperBytes` keeps well inside.

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
instance. It assumes vitest, or another runner on Vite: it loads the component's modules with
`import.meta.glob`.

```ts
import { register } from 'safebyok-convex/test'

const t = convexTest(schema, modules)
register(t)
```

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests -- `convex-test` under the edge runtime,
in memory, with no deployment -- and the build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from its source, through
the workspace's `@safebyok/source` export condition, so they need no build. The tests resolve it
through its built `dist/`, as a consumer's would, and make real vaults with the core's own code;
they build the core first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild
step.

The client's tests run the real `ConvexClient` and `ConvexReactClient` against
`tests/fake-deployment.ts`: a fake WebSocket that answers the sync protocol's query and mutation
messages from `convex-test`. It runs one call at a time, reruns every watched query after each
mutation, and signs each socket in as one user from the start; its doc block says what that
cannot prove.

The build follows Convex's component template: ESM only, unbundled, so each of the component's
modules keeps its own file under `dist/component/`, beside its `convex.config.js` and
`_generated/`, for a host's Convex CLI to bundle at deploy. `safebyok-convex/test` alone ships as
source, `src/test.ts`, since its `import.meta.glob` must find the component's `.ts` modules; a
test runner that resolves as a bundler does (vitest) loads it.

`src/component/_generated/` holds Convex's codegen output for the component, written by the
templates of the installed `convex` and never edited by hand. Codegen for a component needs a
Convex deployment, so until one has run it holds only the files Convex writes without one
(`server.ts`, `dataModel.ts`, and the untyped stub `api.ts`); the component's typed API,
`ComponentApi`, is derived from the functions themselves in `src/component-api.ts`.
