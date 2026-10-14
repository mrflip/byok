import type * as Z from 'zod'
import { Lockbox, LockboxSummary, VaultBundle, type VaultScope } from './types'
import { VaultError } from './errors'
import type { StringStore } from './string-store'

/**
 * Remote storage for vault records, as the host application plugs it in: extend this class and
 * implement the seven `fetch`/`save`/`trash` primitives against your backend. That is the whole
 * job -- you are a shelf, not a safe:
 *
 *  * **Store what you are handed, return what you stored.** Every record is plain JSON (binary
 *    fields are base64url text), so any backend that can hold JSON can hold a vault, as-is.
 *  * **Never look inside.** Every secret field arrives encrypted; nothing you hold can open a
 *    vault, and nothing byok does ever needs you to understand a record.
 *  * **Enforce who may reach which rows.** Your backend should let a signed-in user reach only
 *    their own records: byok's encryption protects the contents, your authorization decides who
 *    may fetch or overwrite them at all.
 *  * **Don't repair.** Return a record exactly as stored, or null when there is none. byok
 *    validates everything it reads back; a damaged record is byok's to refuse, never yours to fix
 *    or quietly drop.
 *
 * The verbs the vault actually calls -- `readBundle`, `listBoxes`, `eraseVault` and the rest --
 * are built for you on top of your primitives, validation included. Each compound verb documents
 * the default composition; a backend that can do better (a transactional delete, a projected
 * list, a push subscription) overrides that one method and leaves the rest.
 */
export abstract class VaultDB {
  /**
   * The most this backend holds in one record, in bytes: a plain fact about the backend, or
   * `Infinity` when it sets no per-record limit. A vault refuses to open with a `maxWhisperBytes`
   * over half of it, leaving room for encoding and the record's other fields.
   */
  abstract readonly maxRecordBytes: number

  // ------------------------------------------------------------------ the primitives you write

  /** The stored bundle record for `scope`, exactly as saved, or null when there is none. */
  protected abstract fetchBundle(scope: VaultScope): Promise<unknown>
  /** Store `bundle`, replacing any bundle already under its scope. */
  protected abstract saveBundle(bundle: VaultBundle): Promise<void>
  /** Remove the bundle record for `scope`; succeed quietly when there is none. */
  protected abstract trashBundle(scope: VaultScope): Promise<void>
  /** The stored lockbox record under `boxlabel`, exactly as saved, or null when there is none. */
  protected abstract fetchBox(scope: VaultScope, boxlabel: string): Promise<unknown>
  /** Store `lockbox`, replacing any lockbox already under its boxlabel. */
  protected abstract saveBox(scope: VaultScope, lockbox: Lockbox): Promise<void>
  /** Remove the lockbox record under `boxlabel`; succeed quietly when there is none. */
  protected abstract trashBox(scope: VaultScope, boxlabel: string): Promise<void>
  /** Every stored lockbox record in `scope`, in any order. */
  protected abstract fetchBoxes(scope: VaultScope): Promise<unknown[]>

  // --------------------------------------------------- the verbs byok calls, built on top

  /** The vault's bundle, validated, or null when the vault has never been created. */
  async readBundle(scope: VaultScope): Promise<VaultBundle | null> {
    const raw = await this.fetchBundle(scope)
    if (raw === null || raw === undefined) { return null }
    const bundle = checkRecord(VaultBundle, raw, 'vault bundle')
    // A record that names some other scope is a record out of place, wherever it came from.
    if (bundle.applabel !== scope.applabel || bundle.user_id !== scope.user_id || bundle.vaultlabel !== scope.vaultlabel) {
      throw new VaultError('corrupt_record', 'The stored vault bundle names a different app, user, or vault than the one asked for. It was left as it is.')
    }
    return bundle
  }

  /** Store `bundle`, replacing whatever bundle its scope held. */
  async writeBundle(bundle: VaultBundle): Promise<void> {
    await this.saveBundle(bundle)
  }

  /**
   * Store `bundle` only if its scope holds none, and return whichever bundle ends up there: the
   * given one, or the one another device got in first with.
   *
   * Default composition: a fetch, then a save -- two devices creating at the same instant can
   * still race between those steps. A backend with an atomic create should override this with
   * one, and resolve the race for real.
   */
  async createBundle(bundle: VaultBundle): Promise<VaultBundle> {
    const scope: VaultScope = { applabel: bundle.applabel, user_id: bundle.user_id, vaultlabel: bundle.vaultlabel }
    const standing = await this.readBundle(scope)
    if (standing !== null) { return standing }
    await this.saveBundle(bundle)
    return bundle
  }

  /** One lockbox record, validated, or null when there is none under that label. */
  async readBox(scope: VaultScope, boxlabel: string): Promise<Lockbox | null> {
    const raw = await this.fetchBox(scope, boxlabel)
    if (raw === null || raw === undefined) { return null }
    const lockbox = checkRecord(Lockbox, raw, 'lockbox')
    // A record that names some other boxlabel is a record out of place, wherever it came from.
    if (lockbox.boxlabel !== boxlabel) {
      throw new VaultError('corrupt_record', 'The stored lockbox names a different boxlabel than the one asked for. It was left as it is.')
    }
    return lockbox
  }

  /** Store `lockbox`, replacing whatever its boxlabel held. */
  async writeBox(scope: VaultScope, lockbox: Lockbox): Promise<void> {
    await this.saveBox(scope, lockbox)
  }

  /** Remove the lockbox under `boxlabel`. */
  async eraseBox(scope: VaultScope, boxlabel: string): Promise<void> {
    await this.trashBox(scope, boxlabel)
  }

  /**
   * Public faces of every lockbox in the vault -- ciphered fields stripped, sorted by boxlabel --
   * valid while locked.
   *
   * Default composition: fetch every full record and strip it here. A backend that can project
   * away the ciphered fields server-side should override this and skip hauling them.
   */
  async listBoxes(scope: VaultScope): Promise<LockboxSummary[]> {
    const raws = await this.fetchBoxes(scope)
    return raws
      .map((raw) => checkRecord(Lockbox, raw, 'lockbox'))
      .map((lockbox) => LockboxSummary.parse(lockbox))
      .toSorted((one, two) => one.boxlabel.localeCompare(two.boxlabel))
  }

  /**
   * Remove the bundle and every lockbox: the backend's part of deleting a vault.
   *
   * Default composition: trash each lockbox, then the bundle -- an interruption can strand some
   * rows, though never usable ones. A backend with a transaction or batch delete should override
   * this with one.
   */
  async eraseVault(scope: VaultScope): Promise<void> {
    const summaries = await this.listBoxes(scope)
    for (const summary of summaries) { await this.trashBox(scope, summary.boxlabel) }
    await this.trashBundle(scope)
  }

  /**
   * Calls `onChange` after any write touching `scope`, from this device or another; returns the
   * unsubscribe. The default never calls: byok refreshes after its own writes regardless, so all
   * a silent backend loses is news of *other* devices' writes. A backend with live queries or
   * push (Convex, a websocket) should override this and ring the bell.
   */
  subscribe(_scope: VaultScope, _onChange: () => void): () => void {
    return noUnsubscribing
  }
}

const noUnsubscribing = (): void => undefined

/**
 * A stored record through its validator, with failure as a calm VaultError: storage is someone
 * else's database, and a record may be damaged or written by another version of this package.
 * The refusal names the record but never quotes it.
 */
const checkRecord = <RecordT>(recordSchema: Z.ZodType<RecordT>, raw: unknown, said: string): RecordT => {
  const checked = recordSchema.safeParse(raw)
  if (! checked.success) {
    throw new VaultError('corrupt_record', `A stored ${said} record did not read back in a shape this package knows. It may be damaged, or written by a newer version of byok; it was left as it is.`)
  }
  return checked.data
}

const scopePath = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`
const bundleCkey = (scope: VaultScope) => `vault:${scopePath(scope)}`
const boxCkey = (scope: VaultScope, boxlabel: string) => `box:${scopePath(scope)}:${boxlabel}`
const boxPrefix = (scope: VaultScope) => `box:${scopePath(scope)}:`

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

/**
 * VaultDB over a {@link StringStore}: rows as JSON text under scope-prefixed ckeys. The demo
 * backs one with localStorage to stand in for a real backend; tests back one with a Map. Every
 * secret field in what it stores is ciphertext, so the only thing pretend about it is reach --
 * rows stay on this device instead of syncing through a shared database.
 *
 * @example
 *   const vaultDB = localVaultDB(memoryStore())
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const localVaultDB = (store: StringStore): VaultDB => new StringStoreVaultDB(store)

class StringStoreVaultDB extends VaultDB {
  // localStorage holds about five megabytes per origin, in all: a mebibyte is this stand-in's
  // most for any one record.
  readonly maxRecordBytes = 1024 * 1024

  constructor(private readonly store: StringStore) { super() }

  // Work is deferred into the promise even though the store is synchronous: a storage fault must
  // reject the returned promise, never throw before the caller has one in hand.
  protected fetchBundle(scope: VaultScope): Promise<unknown> {
    return soon(() => readJson(this.store, bundleCkey(scope)))
  }

  protected saveBundle(bundle: VaultBundle): Promise<void> {
    return soon(() => { this.store.write(bundleCkey(bundle), JSON.stringify(bundle)) })
  }

  protected trashBundle(scope: VaultScope): Promise<void> {
    return soon(() => { this.store.erase(bundleCkey(scope)) })
  }

  protected fetchBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return soon(() => readJson(this.store, boxCkey(scope, boxlabel)))
  }

  protected saveBox(scope: VaultScope, lockbox: Lockbox): Promise<void> {
    return soon(() => { this.store.write(boxCkey(scope, lockbox.boxlabel), JSON.stringify(lockbox)) })
  }

  protected trashBox(scope: VaultScope, boxlabel: string): Promise<void> {
    return soon(() => { this.store.erase(boxCkey(scope, boxlabel)) })
  }

  protected fetchBoxes(scope: VaultScope): Promise<unknown[]> {
    return soon(() => (
      this.store.ckeys()
        .filter((ckey) => ckey.startsWith(boxPrefix(scope)))
        .map((ckey) => readJson(this.store, ckey))
        .filter((raw) => raw !== null)
    ))
  }

  // The store's bell rings on every write, not only ones in scope: a spurious refresh is
  // harmless here, and a real adapter (Convex) overrides this to subscribe precisely.
  override subscribe(_scope: VaultScope, onChange: () => void): () => void {
    return this.store.subscribe(onChange)
  }
}

const readJson = (store: StringStore, ckey: string): unknown => {
  const text = store.read(ckey)
  if (text === null) { return null }
  try {
    return JSON.parse(text)
  } catch {
    throw new VaultError('corrupt_record', 'A stored record did not read back as JSON. It may be damaged; it was left as it is.')
  }
}
