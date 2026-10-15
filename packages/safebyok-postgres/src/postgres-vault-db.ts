import { VaultDB, VaultError, VaultScope } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, VaultBundle } from 'safebyok'
import * as Columns from './columns'
import { BundleColumns, ListedLockboxColumns, LockboxColumns } from './columns'
import { VaultChangeChannel } from './vault-tables'

/**
 * What this VaultDB needs of a Postgres driver: one statement, its parameters numbered `$1`, `$2`
 * and on, and the rows it returns. A `pg` Pool, Client or PoolClient is one as it stands, and so
 * is a PGlite; postgres.js takes a one-line wrapper. Every statement this VaultDB sends is one
 * statement, so each is atomic on its own, and every write is one: no transaction is asked of the
 * driver.
 *
 * @example new Pool({ connectionString })                                      // pg
 * @example new PGlite()                                                         // @electric-sql/pglite
 * @example { query: async (text, params) => ({ rows: await sql.unsafe(text, params) }) }  // postgres.js
 */
export type PostgresClient = {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>
}

/** Ends what a {@link PostgresListen} began; it may return a promise, which nothing awaits. */
export type PostgresUnlisten = () => unknown

/**
 * The host's way to hear Postgres notifications on `channel` (always {@link VaultChangeChannel}):
 * call `onNotify` with each one's payload, and return the unlisten, or a promise for it. A
 * PGlite's `listen` is one, called on its PGlite as the example does: passed bare, it loses its
 * `this`. With `pg`, one long-lived connection LISTENs for the whole server, and this hands its
 * notifications to every VaultDB made per request (see the README).
 *
 * @example (channel, onNotify) => pglite.listen(channel, onNotify)
 */
export type PostgresListen = (channel: string, onNotify: (payload: string) => void) => PostgresUnlisten | Promise<PostgresUnlisten>

/**
 * The VaultDB {@link postgresVaultDB} makes, with one verb more for a server that carries its
 * verbs over a wire to a VaultDB in the browser: {@link PostgresVaultDB.listBoxRecords}.
 */
export type PostgresVaultDB = VaultDB & {
  /**
   * Every lockbox in `scope` as stored, its two ciphered fields left out, `format` kept and a
   * missing note missing: what the browser's VaultDB hands back from its own `doListBoxes`, to be
   * validated there. `listBoxes` gives summaries instead, the shape a vault shows, which a VaultDB
   * may not hand back. Refuses as `listBoxes` does: `bad_label` for a malformed scope,
   * `not_permitted` for another user's, `storage_unavailable` for trouble.
   *
   * @example served.set('listBoxes', (vaultDB, [scope]) => vaultDB.listBoxRecords(scope))
   */
  listBoxRecords(scope: VaultScope): Promise<unknown[]>
}

/** What {@link postgresVaultDB} is made with, once per request. */
export type PostgresVaultDBOpts = {
  /** The database: a {@link PostgresClient}, such as your server's `pg` Pool. */
  client: PostgresClient
  /**
   * The signed-in user this request is for, as your server's own auth established it -- never
   * as the browser claims it -- or null (or undefined, or empty) when no one is signed in. Only
   * that user's vaults are reached.
   */
  userId: string | null | undefined
  /** Where the VaultDB hears other writes, to call its subscribers; without it, it never calls. */
  listen?: PostgresListen | undefined
  /**
   * The most lockboxes one vault holds: a whole number above zero, default 1000. Enforced here,
   * on the server, so a modified browser cannot grow a vault past it; the browser's vault opens
   * with no larger `maxLockboxes`. For no practical limit, pass a large number, such as
   * 1_200_300_400_500_600: the limit goes to Postgres as a bigint, where `Infinity` cannot.
   */
  maxLockboxes?: number | undefined
}

/** How many lockboxes a vault holds unless {@link PostgresVaultDBOpts.maxLockboxes} says otherwise. */
const DefaultMaxLockboxes = 1000

/**
 * safebyok's storage in Postgres: a VaultDB over the tables {@link VaultTablesSql} makes, run on
 * your server -- Postgres has nowhere to run a vault's verbs, and the vault itself runs in the
 * browser -- made per request for the signed-in user. Your route layer calls its verbs for the
 * browser's vault (the README has the recipe), or a GraphQL server does (`safebyok-graphql`).
 *
 * * **Who may reach a vault**: only `userId`. A verb naming any other user's scope, or any at
 *   all while no one is signed in, refuses with a VaultError of kind `not_permitted` before the
 *   database is asked anything.
 * * **Every write is one statement**, atomic as Postgres makes every statement: a write lands only
 *   while what it expects still stands, and a failed expectation refuses with kind `stale_write`.
 * * **A full vault**: a new lockbox in a vault already holding `maxLockboxes` refuses with kind
 *   `vault_full`, checked in the statement that inserts it, so two writes racing for the last
 *   place cannot both land. A lockbox replacing one already there is never refused for the count.
 *   A refusal for the count costs one read more, to tell a full vault from a writer who missed a
 *   lockbox it would replace, or whose vault changed meanwhile (`stale_write`).
 * * **Isolation**: under READ COMMITTED, Postgres's default, every write holds as said. Under
 *   REPEATABLE READ or SERIALIZABLE, any two writes adding or removing a lockbox in one vault at
 *   once may fail with a serialization error, as `storage_unavailable` (each moves the count on
 *   the vault's bundle row), and the call may simply be tried again.
 * * **Other writes**: with `listen`, `subscribe` hears every write to the vault, from any server
 *   and any device, through the tables' trigger; without it, nothing is pushed.
 * * **Trouble**: anything the driver throws refuses with kind `storage_unavailable`, the driver's
 *   own error as its `cause`. Every refusal is a VaultError, whose `kind` a wire can carry.
 *
 * @param opts - The `client`, the `userId` this request is for, an optional `listen`, and an
 *   optional `maxLockboxes`.
 * @returns The VaultDB, holding at most 1 MiB in one record and `maxLockboxes` lockboxes in one
 *   vault, setting no limit on a vault's bytes, with {@link PostgresVaultDB.listBoxRecords}
 *   beside its verbs for a route to serve.
 *
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId, maxLockboxes: 250 })
 */
export const postgresVaultDB = (opts: PostgresVaultDBOpts): PostgresVaultDB => {
  const { client, userId, listen, maxLockboxes = DefaultMaxLockboxes } = (opts as Partial<PostgresVaultDBOpts> | null | undefined) ?? {}
  if (! isPostgresClient(client)) {
    throw new VaultError('bad_option', 'postgresVaultDB needs a `client` with a `query(text, params)` method: a pg Pool or Client, a PGlite, or a wrapper around your driver.')
  }
  if (userId !== null && userId !== undefined && typeof userId !== 'string') {
    throw new VaultError('bad_option', "postgresVaultDB's `userId` is the signed-in user's id as text, or null when no one is signed in.")
  }
  if (listen !== undefined && typeof listen !== 'function') {
    throw new VaultError('bad_option', "postgresVaultDB's `listen`, when given, is a function: (channel, onNotify) => unlisten.")
  }
  if (! isLockboxCount(maxLockboxes)) {
    throw new VaultError('bad_option', "postgresVaultDB's `maxLockboxes`, when given, is a whole number above zero; for no practical limit, pass a large one, such as 1_200_300_400_500_600.")
  }
  return new TablesVaultDB(client, userId === undefined || userId === '' ? null : userId, listen, maxLockboxes)
}

// A safe integer, so it reaches Postgres as the bigint it reads.
const isLockboxCount = (count: unknown): count is number => Number.isSafeInteger(count) && (count as number) > 0

const isPostgresClient = (client: unknown): client is PostgresClient => (
  typeof client === 'object' && client !== null && typeof (client as { query?: unknown }).query === 'function'
)

// ------------------------------------------------------------------------------------- the SQL

// Every statement names its vault by these three parameters, first.
const ScopeIs = 'applabel = $1::text AND user_id = $2::text AND vaultlabel = $3::text'
const BundleParamCount = BundleColumns.length
const LockboxParamsFrom = 4

const ReadBundleSql = `SELECT ${Columns.selected(BundleColumns)} FROM safebyok_bundles WHERE ${ScopeIs}`

// Another device's bundle may land between this statement's start and its insert: DO NOTHING
// would then return no row, so a no-op update instead returns the bundle that stands. The trigger
// sees nothing changed, and notifies no one.
const CreateBundleSql = `INSERT INTO safebyok_bundles (${Columns.names(BundleColumns)})
  VALUES (${Columns.placeholders(BundleColumns, 1)})
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET format = safebyok_bundles.format
  RETURNING ${Columns.selected(BundleColumns)}`

// The bundle written must name the vault it replaces: a vault_id never changes.
const UpdateBundleSql = `UPDATE safebyok_bundles SET (${Columns.names(BundleColumns)}) = ROW(${Columns.placeholders(BundleColumns, 1)})
  WHERE ${ScopeIs}
    AND vault_id = $${String(BundleParamCount + 1)}::text AND unlock_epoch = $${String(BundleParamCount + 2)}::bigint
    AND vault_id = ${Columns.placeholderOf(BundleColumns, 'vault_id', 1)}
  RETURNING 1 AS landed`

const ReadBoxSql = `SELECT ${Columns.selected(LockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text`

const ListBoxesSql = `SELECT ${Columns.selected(ListedLockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs}`

// A first lockbox under its boxlabel: inserted only beside a bundle of the expected vault_id, only
// where no lockbox stands, and only while the vault holds fewer than $5 lockboxes. It answers one
// row: whether it landed, and whether the vault it locked was full.
//
// The count is the bundle's lockbox_count, which the tables' trigger keeps, and the bundle's row is
// locked (FOR UPDATE) as it is read, so new lockboxes in one vault are written one at a time. Under
// READ COMMITTED, Postgres's default, a statement that waited for the lock is handed the row as the
// write before it left it -- Postgres re-reads a row it had to wait to lock -- so it counts that
// write's lockbox too. Under REPEATABLE READ or SERIALIZABLE, it fails with a serialization error
// instead, which refuses as storage_unavailable. Either way, two writes racing for the last place
// never both land. The lock also holds the bundle in place, so no erase lands between the read and
// the insert, and the foreign key never refuses it. Only the locked row is re-read: the lockboxes
// are seen as the statement began, so whether a full vault already holds this boxlabel -- the
// write it waited on may have stored it -- is StillFullSql's to say, afresh.
const InsertBoxSql = `WITH vault AS (
    SELECT applabel, user_id, vaultlabel, vault_id, lockbox_count FROM safebyok_bundles
    WHERE ${ScopeIs} AND vault_id = $4::text
    FOR UPDATE
  ), inserted AS (
    INSERT INTO safebyok_lockboxes (applabel, user_id, vaultlabel, vault_id, ${Columns.names(LockboxColumns)})
    SELECT applabel, user_id, vaultlabel, vault_id, ${Columns.placeholders(LockboxColumns, LockboxParamsFrom + 2)}
    FROM vault WHERE lockbox_count < $5::bigint
    ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM inserted) AS landed, EXISTS (SELECT 1 FROM vault WHERE lockbox_count >= $5::bigint) AS full`

// Whether the vault of that vault_id still stands full, with no lockbox under the boxlabel: asked
// only after a first write found the vault full, as a statement of its own. Under READ COMMITTED, or
// outside a transaction, it sees things as they stand now, and so it also sees a lockbox erased, or the vault erased, since
// the insert let go of the bundle's row: either leaves the writer only stale. Inside a host's
// REPEATABLE READ or SERIALIZABLE transaction it shares the insert's snapshot, which is still
// current for this vault: the insert holds the bundle's row until the transaction ends, and would
// have failed to lock it had any lockbox come or gone in the vault since the snapshot was taken.
const StillFullSql = `SELECT 1 FROM safebyok_bundles
  WHERE ${ScopeIs} AND vault_id = $5::text AND lockbox_count >= $6::bigint
    AND NOT EXISTS (SELECT 1 FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text AND vault_id = $5::text)`

// A lockbox over the revision read. Its vault_id column is its bundle's (the foreign key holds
// them together), so matching it is matching the bundle that stands.
const ReplaceBoxSql = `UPDATE safebyok_lockboxes SET (${Columns.names(LockboxColumns)}) = ROW(${Columns.placeholders(LockboxColumns, LockboxParamsFrom + 2)})
  WHERE ${ScopeIs} AND vault_id = $4::text AND revision_id = $5::text
    AND boxlabel = ${Columns.placeholderOf(LockboxColumns, 'boxlabel', LockboxParamsFrom + 2)}
  RETURNING 1 AS landed`

// Lands while the bundle of that vault_id stands, whether or not there was a lockbox to erase. The
// bundle's row is locked before the lockbox's, as a first lockbox's insert locks them, so the
// count's trigger never waits on an insert that waits on this erase.
const EraseBoxSql = `WITH vault AS (
    SELECT 1 FROM safebyok_bundles WHERE ${ScopeIs} AND vault_id = $5::text FOR UPDATE
  ), erased AS (
    DELETE FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text AND vault_id = $5::text
      AND EXISTS (SELECT 1 FROM vault)
  )
  SELECT 1 AS landed FROM vault`

// The lockboxes go with their bundle, by the foreign key's cascade, in the same statement.
const EraseVaultSql = `DELETE FROM safebyok_bundles WHERE ${ScopeIs} AND vault_id = $4::text RETURNING 1 AS landed`

// ------------------------------------------------------------------------------------ the adapter

/** Each write one statement, first checking the scope is the signed-in user's own. */
class TablesVaultDB extends VaultDB implements PostgresVaultDB {
  // Postgres holds far more in one row; a mebibyte is what this adapter promises, as the other
  // in-tree adapters do, and more than most servers accept in one request.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a vault under a budget: a vault is as many bytes as the database lets it grow.
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes: number

  private readonly client: PostgresClient
  private readonly userId: string | null
  private readonly listen: PostgresListen | undefined

  constructor(client: PostgresClient, userId: string | null, listen: PostgresListen | undefined, maxLockboxes: number) {
    super()
    this.client = client
    this.userId = userId
    this.listen = listen
    this.maxLockboxes = maxLockboxes
  }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ReadBundleSql, scopeParams(scope))
    return rows.length === 0 ? null : Columns.recordOf(rows[0], BundleColumns)
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    this.mustReach(bundle)
    const { rows } = await this.client.query(CreateBundleSql, Columns.paramsOf(bundle, BundleColumns))
    return Columns.recordOf(rows[0], BundleColumns)
  }

  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    this.mustReach(bundle)
    const params = [...Columns.paramsOf(bundle, BundleColumns), expected.vault_id, expected.unlock_epoch]
    return landed(await this.client.query(UpdateBundleSql, params))
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ReadBoxSql, [...scopeParams(scope), boxlabel])
    return rows.length === 0 ? null : Columns.recordOf(rows[0], LockboxColumns)
  }

  protected async doListBoxes(scope: VaultScope): Promise<unknown[]> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ListBoxesSql, scopeParams(scope))
    return rows.map((row) => Columns.recordOf(row, ListedLockboxColumns))
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    this.mustReach(scope)
    const boxParams = Columns.paramsOf(lockbox, LockboxColumns)
    if (expected.revision_id !== null) {
      const params = [...scopeParams(scope), expected.vault_id, expected.revision_id, ...boxParams]
      return landed(await this.client.query(ReplaceBoxSql, params))
    }
    const { rows } = await this.client.query(InsertBoxSql, [...scopeParams(scope), expected.vault_id, this.maxLockboxes, ...boxParams])
    const outcome = rows[0] as { landed: boolean, full: boolean }
    if (! outcome.full) { return outcome.landed }
    // A vault that holds this boxlabel after all, has room again, or is gone: the writer missed a
    // lockbox it would replace (never refused for the count), or its vault moved under it, and it
    // is only stale.
    const { rows: stillFull } = await this.client.query(StillFullSql, [...scopeParams(scope), lockbox.boxlabel, expected.vault_id, this.maxLockboxes])
    if (stillFull.length === 0) { return false }
    throw new VaultError('vault_full', `This vault already holds the ${String(this.maxLockboxes)} lockboxes its storage keeps in one vault: erase one before storing another.`)
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    this.mustReach(scope)
    return landed(await this.client.query(EraseBoxSql, [...scopeParams(scope), boxlabel, expected.vault_id]))
  }

  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    this.mustReach(scope)
    return landed(await this.client.query(EraseVaultSql, [...scopeParams(scope), expected.vault_id]))
  }

  async listBoxRecords(scope: VaultScope): Promise<unknown[]> {
    const checked = VaultScope.safeParse(scope)
    if (! checked.success) {
      throw new VaultError('bad_label', 'A vault scope is an applabel and a vaultlabel that meet the label rules, and a non-empty user_id.')
    }
    try {
      return await this.doListBoxes(checked.data)
    } catch (err) {
      if (err instanceof VaultError) { throw err }
      throw new VaultError('storage_unavailable', "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause.", { cause: err })
    }
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    this.mustReach(scope)
    if (! this.listen) { return noUnsubscribing }
    let listening = true
    const heard = (payload: string) => {
      if (listening && namesScope(payload, scope)) { onChange() }
    }
    const unlistening = settled(this.listen(VaultChangeChannel, heard))
    return () => {
      if (! listening) { return }
      listening = false
      void endListen(unlistening)
    }
  }

  /** Refuses unless the signed-in user is the one `scope` names. */
  private mustReach(scope: Pick<VaultScope, 'user_id'>): void {
    if (this.userId === null) {
      throw new VaultError('not_permitted', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')
    }
    if (scope.user_id !== this.userId) {
      throw new VaultError('not_permitted', 'This vault belongs to another user: a signed-in user reaches only their own vaults.')
    }
  }
}

const scopeParams = (scope: VaultScope): string[] => [scope.applabel, scope.user_id, scope.vaultlabel]

/** True when a write's `RETURNING` or `SELECT` says it landed: one row back. */
const landed = ({ rows }: { rows: unknown[] }): boolean => rows.length > 0

/**
 * True when a notification's payload names `scope`, or names nothing readable: an empty payload
 * (a scope too long for one), or one in an unexpected shape, costs a spurious refresh at worst.
 */
const namesScope = (payload: string, scope: VaultScope): boolean => {
  const named = VaultScope.safeParse(jsonOrNull(payload))
  if (! named.success) { return true }
  return named.data.applabel === scope.applabel && named.data.user_id === scope.user_id && named.data.vaultlabel === scope.vaultlabel
}

const jsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * What a {@link PostgresListen} hands back, once it has: the unlisten, or null when the listen
 * failed. A listen that rejects has nobody to throw to, and its subscriber hears nothing more, as
 * without a listen.
 */
const settled = async (unlisten: PostgresUnlisten | Promise<PostgresUnlisten>): Promise<PostgresUnlisten | null> => {
  try {
    return await unlisten
  } catch {
    return null
  }
}

/**
 * Ends a listen once it has begun -- at once, or as it arrives -- with anything the unlisten
 * throws or rejects with ignored: there is nobody to tell, and the subscriber already hears nothing.
 */
const endListen = async (unlistening: Promise<PostgresUnlisten | null>): Promise<void> => {
  const unlisten = await unlistening
  if (! unlisten) { return }
  try {
    await unlisten()
  } catch {
    // The listen is as ended as this side can make it.
  }
}

const noUnsubscribing = (): void => undefined
