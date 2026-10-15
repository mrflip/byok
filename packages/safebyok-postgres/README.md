# safebyok-postgres

safebyok's storage in [Postgres](https://www.postgresql.org): the SQL that makes the tables a
vault is stored in, and **`postgresVaultDB`**, the VaultDB over them, which runs on your server.
Your database holds ciphertext and a few public fields; it never sees a whisper, a passphrase, or
any key that opens one.

It brings no database driver: it speaks through the one you already have -- a `pg` Pool, a
PGlite, postgres.js behind a one-line wrapper -- and has no runtime dependency but `safebyok`.

## Install

```sh
pnpm add safebyok safebyok-postgres
```

`safebyok` is a peer dependency: your app installs it, so the adapter and your app share one
copy, and a `VaultError` from one is a `VaultError` to the other.

## Make the tables

`VaultTablesSql` is the SQL, for Postgres 14 or later in a UTF8 database. The package also ships
it as `vault-tables.sql`, to copy into your migrations. It is safe to run again: it creates only
what is missing.

```ts
import { VaultTablesSql } from 'safebyok-postgres'

await pool.query(VaultTablesSql)    // pg runs several statements in one query without parameters
await pglite.exec(VaultTablesSql)   // PGlite
```

**Each vault's count of lockboxes** sits on its bundle's row (`lockbox_count`), kept by a trigger
whatever statement adds or removes a lockbox, your own SQL included. Two things it asks of that
SQL:

* **Lock the bundle's row before deleting lockboxes** (`SELECT ... FROM safebyok_bundles WHERE
  ... FOR UPDATE`, in the same transaction), as the adapter does: otherwise the trigger may
  deadlock with an erase of the whole vault.
* **Never `TRUNCATE` the lockboxes alone**, as a truncate fires no row trigger. If a count goes
  astray, after that or after a restore with triggers off, this sets every vault's right. Run
  it while nothing writes to these tables: a lockbox stored while it runs may go uncounted.

```sql
UPDATE safebyok_bundles AS bundle SET lockbox_count = (SELECT count(*) FROM safebyok_lockboxes AS box WHERE (box.applabel, box.user_id, box.vaultlabel, box.vault_id) = (bundle.applabel, bundle.user_id, bundle.vaultlabel, bundle.vault_id));
```

## Where it runs

Postgres has nowhere to run a vault's verbs, and the vault itself runs in the browser. So
`postgresVaultDB` runs on your server, **made per request for the signed-in user**, and your
route layer carries its verbs to a VaultDB in the browser (the recipe below), or a GraphQL server
does (`safebyok-graphql`).

```ts
import { postgresVaultDB } from 'safebyok-postgres'

const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
```

* **`userId`** is the user your own auth signed in for this request -- from its verified session,
  never from anything the browser sends -- or `null` when no one is. The VaultDB reaches only that
  user's vaults: a verb naming any other user's scope, or any at all while signed out, refuses
  with a `VaultError` of kind `not_permitted` before the database is asked anything.
* **`client`** is anything with `query(text, params)` resolving to `{ rows }`: a `pg` Pool,
  Client or PoolClient, or a PGlite, as they stand. postgres.js takes a wrapper:
  `{ query: async (text, params) => ({ rows: await sql.unsafe(text, params) }) }`.
* **Every write is one statement**, atomic as Postgres makes every statement, so it asks no
  transaction of your driver: a write lands only while what it expects still stands, and refuses
  with kind `stale_write` otherwise. A new lockbox refused for a full vault costs one read more.
* **Isolation**: every write holds under READ COMMITTED, Postgres's default. Under REPEATABLE
  READ or SERIALIZABLE, any two writes that add or remove a lockbox in one vault at once may fail
  with a serialization error, as `storage_unavailable`, since each moves the count on the vault's
  bundle row, and the call may simply be tried again.
* **`maxLockboxes`**, 1000 unless you say otherwise, is the most lockboxes one vault holds: see
  *A limit of the server's own*, below.
* **Trouble** refuses with kind `storage_unavailable`, your driver's own error as its `cause`.
  Every refusal is a `VaultError`, and its `kind` and message are safe to send to the browser;
  its `cause` is not, being your driver's, and may name your database.

## The route recipe

One POST route serves every verb, and the browser's VaultDB posts to it. This is web-standard
`Request` and `Response`, so it is a Next.js route handler as it stands, and a Hono, Bun or Deno
handler with its export renamed. The package's tests run this recipe whole
(`tests/route-recipe.test.ts`), against the same suite every VaultDB passes.

The server half, `app/api/safebyok/route.ts`:

```ts
import { Pool } from 'pg'
import { AnyTextValidators, VaultError } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, VaultBundle, VaultScope } from 'safebyok'
import { postgresVaultDB } from 'safebyok-postgres'
import type { PostgresVaultDB } from 'safebyok-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

type Served = (vaultDB: PostgresVaultDB, args: unknown[]) => Promise<unknown>

// What the server takes a name to be: any text. The browser's vault checks names with whichever
// validators it was opened with, and reads a row they refuse back as damaged; this server's job
// is to keep each user to their own vault, whatever the names.
const validators = AnyTextValidators

// The verbs a browser's vault may call -- VaultDB's own, and nothing else -- each passed to the
// VaultDB, which refuses another user's vault. A listing
// goes as the stored records, which the browser's VaultDB validates.
const served = new Map<string, Served>([
  ['readBundle',   (vaultDB, [scope]) => vaultDB.readBundle(scope as VaultScope, validators)],
  ['createBundle', (vaultDB, [bundle]) => vaultDB.createBundle(bundle as VaultBundle, validators)],
  ['updateBundle', (vaultDB, [bundle, expected]) => vaultDB.updateBundle(bundle as VaultBundle, expected as BundleExpectation, validators)],
  ['readBox',      (vaultDB, [scope, boxlabel]) => vaultDB.readBox(scope as VaultScope, boxlabel as string, validators)],
  ['listBoxes',    (vaultDB, [scope]) => vaultDB.listBoxRecords(scope as VaultScope)],
  ['updateBox',    (vaultDB, [scope, lockbox, expected]) => vaultDB.updateBox(scope as VaultScope, lockbox as Lockbox, expected as LockboxExpectation, validators)],
  ['eraseBox',     (vaultDB, [scope, boxlabel, expected]) => vaultDB.eraseBox(scope as VaultScope, boxlabel as string, expected as EraseExpectation, validators)],
  ['eraseVault',   (vaultDB, [scope, expected]) => vaultDB.eraseVault(scope as VaultScope, expected as EraseExpectation, validators)],
])

/** What a request posts: its verb and arguments, or nothing when its body is not a JSON object. */
const postedCall = async (request: Request): Promise<{ verb?: unknown, args?: unknown }> => {
  try {
    const posted: unknown = await request.json()
    return typeof posted === 'object' && posted !== null ? posted : {}
  } catch {
    return {}
  }
}

export async function POST(request: Request): Promise<Response> {
  const { verb, args } = await postedCall(request)
  const serve = typeof verb === 'string' ? served.get(verb) : undefined
  if (! serve || ! Array.isArray(args)) {
    return Response.json({ refusal: { kind: 'bad_option', message: 'That is not a vault verb.' } }, { status: 400 })
  }
  // Made per request, for the user your own auth signed in -- never one the request names.
  const vaultDB = postgresVaultDB({ client: pool, userId: await signedInUserId(request) })
  try {
    return Response.json({ result: (await serve(vaultDB, args)) ?? null })
  } catch (err) {
    if (! (err instanceof VaultError)) { throw err }
    // A refusal crosses as its kind and its calm message; never its cause, the driver's own error.
    return Response.json({ refusal: { kind: err.kind, message: err.message } })
  }
}
```

`signedInUserId` is your own: the user id from the request's verified session cookie, or null.
A listing goes through `listBoxRecords`, not `listBoxes`: `listBoxes` hands back summaries, the
shape a vault shows, and a VaultDB in the browser must hand back records as stored.

The client half, a VaultDB over `fetch`, to hand `openVault` as its `vaultDB`:

```ts
import { VaultDB, VaultError, VaultErrorKindVals } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, VaultBundle, VaultErrorKind, VaultScope } from 'safebyok'

const VaultRouteUrl = '/api/safebyok'

export class RouteVaultDB extends VaultDB {
  readonly maxRecordBytes = 1024 * 1024
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = 1000 // the server's postgresVaultDB maxLockboxes

  protected doReadBundle(scope: VaultScope) { return this.call('readBundle', scope) }
  protected doCreateBundle(bundle: VaultBundle) { return this.call('createBundle', bundle) }
  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation) {
    await this.call('updateBundle', bundle, expected)
    return true
  }
  protected doReadBox(scope: VaultScope, boxlabel: string) { return this.call('readBox', scope, boxlabel) }
  protected async doListBoxes(scope: VaultScope) { return await this.call('listBoxes', scope) as unknown[] }
  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) {
    await this.call('updateBox', scope, lockbox, expected)
    return true
  }
  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation) {
    await this.call('eraseBox', scope, boxlabel, expected)
    return true
  }
  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation) {
    await this.call('eraseVault', scope, expected)
    return true
  }

  // A stale write refuses on the server and crosses as its kind, so a write that answers lands.
  private async call(verb: string, ...args: unknown[]): Promise<unknown> {
    const response = await fetch(VaultRouteUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ verb, args }),
    })
    const { result, refusal } = await response.json() as { result?: unknown, refusal?: { kind?: unknown, message?: unknown } }
    if (refusal && isKind(refusal.kind) && typeof refusal.message === 'string') {
      throw new VaultError(refusal.kind, refusal.message)
    }
    if (! response.ok) { throw new Error(`The vault route answered ${String(response.status)}`) }
    return result
  }
}

const isKind = (kind: unknown): kind is VaultErrorKind => (VaultErrorKindVals as readonly unknown[]).includes(kind)
```

* **Authenticate by your session**, the cookie `fetch` sends to its own origin, and never by a
  user id in the body. The JSON content type means a cross-site page cannot post to the route
  without a CORS preflight your server would have to allow.
* **No push over a plain route**: the browser's vault refreshes after its own writes, and learns
  of other devices' writes when it next reads. For live updates, carry `subscribe` over a
  socket, server-sent events, or a GraphQL subscription (`safebyok-graphql`), fed by `listen`.
* **A limit of the server's own.** As the Convex component does, this VaultDB holds every vault
  to a number of lockboxes, `maxLockboxes` (1000 unless you pass another), whatever the browser
  asks: a new lockbox past it refuses with kind `vault_full`, checked in the statement that
  inserts it, and a lockbox replacing one already there never does. Declare the same number as
  the browser VaultDB's `maxLockboxes`, so that `openVault` refuses a larger one up front. For no
  practical limit, pass both a large number, such as `1_200_300_400_500_600`: the server's goes
  to Postgres as a bigint, where `Infinity` cannot. Nothing bounds a vault's bytes beyond that:
  your framework's request-size limit bounds each record.

## Hearing other writes

The tables' trigger sends a notification on the channel `VaultChangeChannel`
(`safebyok_vault_changes`) after every write that changes a vault, its payload the vault's scope
as JSON: no record, nothing ciphered. Hand `postgresVaultDB` a **`listen`**, and its `subscribe`
calls each subscriber after every write to their vault, from any server and any device. Without
one, it never calls.

`listen(channel, onNotify)` calls `onNotify` with each notification's payload and returns the
unlisten (or a promise for it). A PGlite's own `listen` is one, called on its PGlite -- passed
bare, as `listen: pglite.listen`, it loses its `this`, and the VaultDB hears nothing:

```ts
const vaultDB = postgresVaultDB({ client: pglite, userId, listen: (channel, onNotify) => pglite.listen(channel, onNotify) })
```

With `pg`, one long-lived connection LISTENs for the whole server and hands its notifications to
every VaultDB made per request -- not a pooled one, which the pool would hand to someone else:

```ts
import pg from 'pg'
import { VaultChangeChannel } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'

const listener = new pg.Client({ connectionString: process.env.DATABASE_URL })
await listener.connect()
await listener.query(`LISTEN ${VaultChangeChannel}`)

const hearers = new Set<(payload: string) => void>()
listener.on('notification', ({ channel, payload = '' }) => {
  if (channel === VaultChangeChannel) {
    for (const hear of hearers) { hear(payload) }
  }
})

export const listen: PostgresListen = (_channel, onNotify) => {
  hearers.add(onNotify)
  return () => { hearers.delete(onNotify) }
}
```

A notification whose payload is empty (a scope too long for one) or unreadable reaches every
subscriber: at worst, a refresh that finds nothing new.

## What is stored

Two tables, each record **a column to a field**, exactly as safebyok wrote it: text as text, a
time or a count as a `bigint`, and each structured value as one opaque `jsonb` -- an encrypted
value (a cipherIv and its ciphertext, `{ cipher_iv_b64, ciphertext_b64 }`), or the bundle's
`unlocks`, its list of unlock envelopes. Nothing is normalized: a note or a
user id reads back byte for byte.

| Table                | One row per | Primary key                                     | Columns                                                                                                |
| -------------------- | ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `safebyok_bundles`   | vault       | `applabel`, `user_id`, `vaultlabel`             | every field of the `VaultBundle`, then `lockbox_count`, the vault's lockboxes as a trigger counts them |
| `safebyok_lockboxes` | lockbox     | `applabel`, `user_id`, `vaultlabel`, `boxlabel` | the vault's scope and `vault_id`, then every field of the `Lockbox`; a lockbox with no note, null      |

* **Encrypted**: each whisper (`whisper_ciphered`), each lockbox's lockboxKey
  (`lockbox_key_wrapped`), and the vaultKey, once under each way into the vault (each unlock
  envelope's `vault_key_wrapped`, inside the bundle's `unlocks`).
* **In the open**: the scope, each `boxlabel` and `note`, the `vault_id`, `unlock_epoch`,
  `revision_id`s, each unlock envelope's method, id, label, salt and key deriver's label, when
  each vault and lockbox was first stored and each whisper last changed (`registered_at`,
  `changed_at`, epoch milliseconds), and the length of every ciphertext.
* **Never**: a whisper, a passphrase, any key in usable form, or the device-local remembered
  unlock. No history: an update replaces its row (your database's backups and WAL keep what
  they keep).
* **A lockbox stands only beside its bundle**, under the same `vault_id`: the foreign key
  erases a vault's lockboxes with its bundle, in one statement, and refuses a lockbox written for
  a vault since erased and made anew.
* **Row-level security is on, with no policy**: the tables' owner -- the role your server
  connects as -- reaches them as before, and every other role reaches no row. To serve the
  tables to another role, give it a policy of your own, or connect as their owner.

## On Supabase

Supabase is Postgres, so this package runs there as it stands: put `vault-tables.sql` in a
migration (`supabase/migrations/`), and run `postgresVaultDB` on your server, or in an Edge
Function, connected with your project's database connection string, its `userId` the one
`supabase.auth.getUser()` verified on the server.

* **Keep the tables out of the Data API.** Supabase serves every table in the `public` schema to
  the browser through its Data API, under row-level security. The tables come with it on and no
  policy, so the `anon` and `authenticated` roles reach nothing: leave them so. Your server's
  connection, as the tables' owner, is the only way in, and the only one that checks the user.
* **Listen over a direct or session-mode connection.** LISTEN needs a connection of its own for
  as long as it listens; the transaction-mode pooler (port 6543) cannot give it one.

This section is a reading of Supabase's documentation, not something the package's tests run.

## Writing an adapter of your own

This package is the example of a SQL backend, as `safebyok-convex` is of a hosted one and the
IndexedDB adapter of a key-value store. To store vaults in another SQL database, or another
shape of table, copy it, and keep to what makes it right:

* **Extend `VaultDB` and write its `do*` methods**, never its public verbs: the base class checks
  labels and scope on the way in, validates every record on the way out, and turns a `false`
  into `stale_write` and anything you throw into `storage_unavailable`.
* **One statement per verb**, so each is atomic without a transaction: the expectation goes in
  the `WHERE` (`UPDATE ... WHERE vault_id = $ AND unlock_epoch = $ RETURNING 1`), and a row
  back means it landed. A create returns the row that stands with `ON CONFLICT ... DO UPDATE`
  (a no-op update), since `DO NOTHING` returns no row when another device got in first.
* **Let the schema hold the vault together.** The lockbox's foreign key names its bundle down to
  the `vault_id`, so a lockbox cannot outlive its vault or land in one made anew, and erasing a
  vault is one `DELETE` of its bundle.
* **Store each record a column to a field**, and compare only the scope, `boxlabel`, `vault_id`,
  `unlock_epoch` and `revision_id`. `src/columns.ts` names each record's columns once, the
  compiler holding the list to the record's fields both ways, and builds every statement from it.
* **Authorize in the adapter**: made per request for one user, it refuses every other user's
  scope with `not_permitted`.
* **Enforce the lockbox limit in the write itself.** A count read in one statement and checked
  in the next lets two writes race past it, and so does a `count(*)` inside the insert: under
  READ COMMITTED, each statement counts from its own snapshot. Here a trigger keeps the count on
  the bundle's row, and the insert locks that row (`FOR UPDATE`) before reading it, so racing
  writes take turns, and a write that waited reads the count its forerunner left. Lock the
  bundle first in an erase too, so the trigger and a waiting insert never deadlock. Only the
  locked row is re-read: before refusing a full vault, look afresh at the vault and the boxlabel,
  since the write you waited on may have stored it, or another erased a lockbox since, and either
  way the writer is only stale.
* **Prove it with the shared suite**: `describeVaultDB` from `safebyok/testing` runs every verb,
  expectation and refusal against a fresh adapter. Its two users' vaults go through one adapter,
  so a per-request adapter answers it with one VaultDB per user, through `perUser` from
  `safebyok/testing`.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and
arethetypeswrong. The tests run against [PGlite](https://pglite.dev), a real Postgres compiled to
WebAssembly and run in-process: no database server, and every statement exactly as Postgres
runs it, the trigger, row-level security and foreign keys included. They build the core first
(`pnpm build:deps`) and read it through its `dist/`, as a consumer would; the typecheck and lint
read it from source. `tests/route-recipe.test.ts` runs the README's route recipe, and changes
with it.
