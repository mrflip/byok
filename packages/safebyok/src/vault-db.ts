import * as Z from 'zod/mini'
import { Label, Lockbox, LockboxSummary, VaultBundle, VaultScope } from './types'
import { VaultError } from './errors'
import type { StringStore } from './string-store'

/**
 * What a bundle update was proven against: the vault and the passphrase epoch of the bundle the
 * writer read. The update lands only while the standing bundle still has both. Plain JSON, so it
 * crosses any wire as-is.
 *
 * @example { vault_id: standing.vault_id, passphrase_epoch: standing.passphrase_epoch }
 */
export type BundleExpectation = Z.infer<typeof BundleExpectation>
const BundleExpectation = Z.object({
  vault_id:         VaultBundle.shape.vault_id,
  passphrase_epoch: VaultBundle.shape.passphrase_epoch,
})

/**
 * What a lockbox update was written for and read: the vault whose vaultKey sealed it, and the
 * `revision_id` of the lockbox the writer read under its boxlabel, or null when there was none.
 * The update lands only while the scope's standing bundle has that `vault_id` and the standing
 * lockbox has that `revision_id` -- or, for null, while there is no lockbox there at all. Plain
 * JSON, so it crosses any wire as-is.
 *
 * @example { vault_id: bundle.vault_id, revision_id: prev?.revision_id ?? null }
 */
export type LockboxExpectation = Z.infer<typeof LockboxExpectation>
const LockboxExpectation = Z.object({
  vault_id:    VaultBundle.shape.vault_id,
  revision_id: Z.nullable(Lockbox.shape.revision_id),
})

/**
 * What an erase was aimed at: the vault whose lockbox, or whole self, the eraser means to remove.
 * The erase lands only while the scope's standing bundle has that `vault_id`, so a device that
 * missed a vault being destroyed and made anew never erases the successor. It names no revision:
 * an erase wins over any write. Plain JSON, so it crosses any wire as-is.
 *
 * @example { vault_id: bundle.vault_id }
 */
export type EraseExpectation = Z.infer<typeof EraseExpectation>
const EraseExpectation = Z.object({
  vault_id: VaultBundle.shape.vault_id,
})

/**
 * Remote storage for vault records, as the host application plugs it in: extend this class and
 * implement its `do*` methods against your backend, one for each verb safebyok calls. That is the
 * whole job -- you are a shelf, not a safe:
 *
 *  * **Store what you are handed, return what you stored.** Every record is plain JSON (binary
 *    fields are base64url text), so any backend that can hold JSON can hold a vault, as-is.
 *  * **Never look inside.** Every secret field arrives encrypted; nothing you hold can open a
 *    vault, and nothing safebyok does ever needs you to understand a record -- only to compare a
 *    few public fields (`vault_id`, `passphrase_epoch`, `revision_id`) before a write.
 *  * **Write only as expected.** Every update and erase carries an expectation of what stands in
 *    storage, and writes only if it still does: check and write in one atomic step (a
 *    transaction, a conditional write), and resolve `false` when the expectation fails. An
 *    erase's names only the vault, never a revision: within the right vault, an erase wins.
 *  * **Enforce who may reach which rows.** Your backend should let a signed-in user reach only
 *    their own records: safebyok's encryption protects the contents, your authorization decides
 *    who may fetch or overwrite them at all. Refuse with a VaultError of kind `not_permitted`.
 *  * **Don't repair.** Return a record exactly as stored, or null when there is none. safebyok
 *    validates everything it reads back; a damaged record is safebyok's to refuse, never yours to
 *    fix or quietly drop.
 *
 * The public verbs -- `readBundle`, `updateBox` and the rest -- wrap your `do*` methods with the
 * checks every adapter owes: labels, scope, records and expectations on the way in, the shape of
 * every record on the way out, `stale_write` for a failed expectation, and `storage_unavailable`
 * (your own error as its `cause`) for anything you throw that is not already a VaultError.
 * Implement the `do*` methods; never override the public verbs.
 */
export abstract class VaultDB {
  /**
   * The most this backend holds in one record, in bytes: a plain fact about the backend, or
   * `Infinity` when it sets no per-record limit. A vault refuses to open with a `maxWhisperBytes`
   * over half of it, leaving room for encoding and the record's other fields.
   */
  abstract readonly maxRecordBytes: number

  /**
   * The most this backend holds of one vault in all, in bytes as stored -- every lockbox
   * together -- or `Infinity` when it sets no such limit. Declare what the backend can still
   * list and erase whole: a backend that reads a vault in one transaction under a read budget
   * declares the share of that budget its heaviest verb leaves. A vault refuses to open when its
   * `maxLockboxes` lockboxes might not fit in it, each counted at twice `maxWhisperBytes` (room
   * for encoding and for the backend's own counting) and 2 KiB for its other fields, which covers
   * them at their largest while the scope's `user_id` is at most 512 bytes; nothing bounds a
   * `user_id`, so a longer one draws on the room the doubled whisper leaves. A backend that also
   * enforces a limit of its own sets it above what this admits, and refuses a lockbox write past it with a
   * VaultError of kind `vault_full`. A backend that does not hold to the limit it declares, or
   * a vault opened with limits that disagree with its backend's, is undefined behaviour: not a
   * bug we will fix, and not one whose outcome we promise.
   */
  abstract readonly maxVaultBytes: number

  // ------------------------------------------------------------------- the verbs safebyok calls

  /** The vault's bundle, validated, or null when the vault has never been created. */
  async readBundle(scope: VaultScope): Promise<VaultBundle | null> {
    const asked = checkScope(scope)
    const raw = await fromStorage(() => this.doReadBundle(asked))
    if (raw === null || raw === undefined) { return null }
    return checkBundle(raw, asked)
  }

  /**
   * Store `bundle` only if its scope holds none, and return whichever bundle stands there after:
   * the given one, or the one another device got in first with.
   */
  async createBundle(bundle: VaultBundle): Promise<VaultBundle> {
    const asked = checkScope(bundle)
    const outgoing = checkOutgoing(VaultBundle, bundle, 'vault bundle')
    const raw = await fromStorage(() => this.doCreateBundle(outgoing))
    return checkBundle(raw, asked)
  }

  /**
   * Replace the bundle with `bundle`, only while the standing one still has the `vault_id` and
   * `passphrase_epoch` in `expected`. Refuses with kind `stale_write` otherwise -- including when
   * no bundle stands at all -- and writes nothing. A vault's `vault_id` never changes, so `bundle`
   * must carry the one in `expected`: kind 'bad_option' otherwise.
   */
  async updateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<void> {
    checkScope(bundle)
    const outgoing = checkOutgoing(VaultBundle, bundle, 'vault bundle')
    const expectation = checkOutgoing(BundleExpectation, expected, 'bundle expectation')
    if (outgoing.vault_id !== expectation.vault_id) {
      throw new VaultError('bad_option', "updateBundle replaces a vault's bundle within that vault: the bundle's vault_id must be the expected one, as a vault_id never changes.")
    }
    const landed = await fromStorage(() => this.doUpdateBundle(outgoing, expectation))
    if (! landed) {
      throw new VaultError('stale_write', 'The vault changed in storage since this device read it -- its passphrase was changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying.')
    }
  }

  /** One lockbox, validated, or null when there is none under that boxlabel. */
  async readBox(scope: VaultScope, boxlabel: string): Promise<Lockbox | null> {
    const asked = checkScope(scope)
    const label = checkBoxlabel(boxlabel)
    const raw = await fromStorage(() => this.doReadBox(asked, label))
    if (raw === null || raw === undefined) { return null }
    const lockbox = checkRecord(Lockbox, raw, 'lockbox')
    // A record that names some other boxlabel is a record out of place, wherever it came from.
    if (lockbox.boxlabel !== label) {
      throw new VaultError('corrupt_record', 'The stored lockbox names a different boxlabel than the one asked for. It was left as it is.')
    }
    return lockbox
  }

  /**
   * Public faces of every lockbox in the vault -- ciphered fields stripped, `note` null where a
   * lockbox has none, sorted by boxlabel -- valid while locked.
   */
  async listBoxes(scope: VaultScope): Promise<LockboxSummary[]> {
    const asked = checkScope(scope)
    const raws = await fromStorage(() => this.doListBoxes(asked))
    return raws
      .map((raw) => LockboxSummary.parse(checkRecord(ListedLockbox, raw, 'lockbox')))
      .toSorted((one, two) => one.boxlabel.localeCompare(two.boxlabel))
  }

  /**
   * Write `lockbox` under its boxlabel, only while the scope's standing bundle has the
   * `vault_id` in `expected` and the standing lockbox has its `revision_id` (or, for null, there
   * is none). Refuses with kind `stale_write` otherwise -- including when the scope holds no
   * bundle -- and writes nothing. A backend that holds each vault to a limit of its own refuses
   * a write past it with kind `vault_full`, writing nothing.
   */
  async updateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<void> {
    const asked = checkScope(scope)
    checkBoxlabelOf(lockbox)
    const outgoing = checkOutgoing(Lockbox, lockbox, 'lockbox')
    const expectation = checkOutgoing(LockboxExpectation, expected, 'lockbox expectation')
    const landed = await fromStorage(() => this.doUpdateBox(asked, outgoing, expectation))
    if (! landed) {
      throw new VaultError('stale_write', 'That lockbox changed in storage since this device read it -- another device or tab wrote or erased it, or the vault was made anew -- so this write was refused and nothing was written. Read it again before retrying.')
    }
  }

  /**
   * Remove the lockbox under `boxlabel`, whatever revision stands, only while the scope's standing
   * bundle has the `vault_id` in `expected`; quiet when there is no such lockbox. Refuses with
   * kind `stale_write` otherwise -- including when the scope holds no bundle -- and erases
   * nothing.
   */
  async eraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<void> {
    const asked = checkScope(scope)
    const label = checkBoxlabel(boxlabel)
    const expectation = checkOutgoing(EraseExpectation, expected, 'erase expectation')
    const landed = await fromStorage(() => this.doEraseBox(asked, label, expectation))
    if (! landed) { throw staleErase() }
  }

  /**
   * Remove the bundle and every lockbox -- the backend's part of deleting a vault -- only while
   * the standing bundle has the `vault_id` in `expected`. Refuses with kind `stale_write`
   * otherwise -- including when the scope holds no bundle -- and erases nothing.
   */
  async eraseVault(scope: VaultScope, expected: EraseExpectation): Promise<void> {
    const asked = checkScope(scope)
    const expectation = checkOutgoing(EraseExpectation, expected, 'erase expectation')
    const landed = await fromStorage(() => this.doEraseVault(asked, expectation))
    if (! landed) { throw staleErase() }
  }

  /**
   * Calls `onChange` after any write touching `scope`, from this device or another; returns the
   * unsubscribe. A backend without push never calls: safebyok refreshes after its own writes
   * regardless, so all it loses is news of *other* devices' writes.
   */
  subscribe(scope: VaultScope, onChange: () => void): () => void {
    const asked = checkScope(scope)
    checkListener(onChange)
    try {
      return this.doSubscribe(asked, onChange)
    } catch (err) {
      throw asStorageTrouble(err)
    }
  }

  // --------------------------------------------------------------------------- the half you write

  /** The stored bundle record for `scope`, exactly as saved, or null when there is none. */
  protected abstract doReadBundle(scope: VaultScope): Promise<unknown>
  /**
   * Store `bundle` if its scope holds none, then return the bundle standing there, exactly as
   * stored: `bundle` itself, or the one already there. Find and insert in one atomic step where
   * the backend allows, so two devices creating at once settle on one bundle.
   */
  protected abstract doCreateBundle(bundle: VaultBundle): Promise<unknown>
  /**
   * Replace the standing bundle with `bundle` if, and only if, it has `expected.vault_id` and
   * `expected.passphrase_epoch`. True when it was written; false, writing nothing, when the
   * expectation failed or no bundle stands.
   */
  protected abstract doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean>
  /** The stored lockbox record under `boxlabel`, exactly as saved, or null when there is none. */
  protected abstract doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown>
  /**
   * Every lockbox in `scope`, in any order: whole records, or -- where the backend can project --
   * each without its two ciphered fields, `lockbox_key_wrapped` and `whisper_ciphered`. Keep
   * `format` and every other field.
   */
  protected abstract doListBoxes(scope: VaultScope): Promise<unknown[]>
  /**
   * Store `lockbox` under its boxlabel if, and only if, the scope's standing bundle has
   * `expected.vault_id` and the standing lockbox has `expected.revision_id` -- or, when that is
   * null, no lockbox stands there. True when it was written; false, writing nothing, otherwise.
   */
  protected abstract doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean>
  /**
   * Remove the lockbox under `boxlabel` if, and only if, the scope's standing bundle has
   * `expected.vault_id`. True when that bundle stands, whether or not there was a lockbox to
   * remove; false, erasing nothing, otherwise.
   */
  protected abstract doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean>
  /**
   * Remove the bundle and every lockbox of `scope` if, and only if, the standing bundle has
   * `expected.vault_id` -- in one transaction, where the backend has them. True when erased;
   * false, erasing nothing, otherwise.
   */
  protected abstract doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean>
  /**
   * Call `onChange` after any write touching `scope`, and return the unsubscribe. The default
   * never calls; a backend with live queries or push (Convex, a websocket) overrides it.
   */
  protected doSubscribe(_scope: VaultScope, _onChange: () => void): () => void {
    return noUnsubscribing
  }
}

const noUnsubscribing = (): void => undefined

const staleErase = () => new VaultError('stale_write', 'The vault changed in storage since this device read it -- it was deleted, or deleted and made anew, elsewhere -- so this erase was refused and nothing was erased. Read the vault again before retrying.')

/**
 * A lockbox as the list verb's adapter half may hand it back: every field but the two ciphered
 * ones, `format` included, so a backend that projects server-side is validated like one that
 * returns whole records (whose ciphered fields this strips).
 */
const ListedLockbox = Z.omit(Lockbox, { lockbox_key_wrapped: true, whisper_ciphered: true })

/**
 * The adapter's half of a verb, with anything it throws that is not already a VaultError turned
 * into a calm one: a caller branches on `kind`, whatever the backend. The adapter's own error
 * rides along as `cause`, for debugging; adapters hold only ciphertext and public fields.
 */
const fromStorage = async <ValT>(attempt: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await attempt()
  } catch (err) {
    throw asStorageTrouble(err)
  }
}

/** What an adapter threw, as a VaultError: its own VaultError untouched, anything else wrapped. */
const asStorageTrouble = (err: unknown): VaultError => {
  if (err instanceof VaultError) { return err }
  return new VaultError('storage_unavailable', "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause.", { cause: err })
}

const checkScope = (scope: VaultScope): VaultScope => {
  const checked = VaultScope.safeParse(scope)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A vault scope is an applabel and a vaultlabel that meet the label rules, and a non-empty user_id.')
  }
  return checked.data
}

const checkBoxlabel = (boxlabel: string): string => {
  const checked = Label.safeParse(boxlabel)
  if (! checked.success) { throw badBoxlabel() }
  return checked.data
}

const badBoxlabel = () => new VaultError('bad_label', 'A boxlabel is 2-40 lowercase letters and digits, words joined by single underscores, starting with a letter.')

// The label a lockbox is written under, checked as a label before the rest of the record is.
const LabelledBox = Z.object({ boxlabel: Label })
const checkBoxlabelOf = (lockbox: unknown) => {
  if (! LabelledBox.safeParse(lockbox).success) { throw badBoxlabel() }
}

const checkListener = (onChange: unknown) => {
  if (typeof onChange !== 'function') {
    throw new VaultError('bad_option', 'subscribe needs an onChange function to call after each write.')
  }
}

/**
 * A record or expectation a write verb was handed, as this package writes one. One that is not
 * is refused before storage sees it, as misuse, so that nothing is ever written that a read would
 * refuse as corrupt. The refusal names what was refused but never quotes it.
 */
const checkOutgoing = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, candidate: unknown, said: string): RecordT => {
  const checked = recordSchema.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `That ${said} is not one this package writes, so nothing was written: a VaultDB writes only the records and expectations a vault builds.`)
  }
  return checked.data
}

const checkBundle = (raw: unknown, scope: VaultScope): VaultBundle => {
  const bundle = checkRecord(VaultBundle, raw, 'vault bundle')
  // A record that names some other scope is a record out of place, wherever it came from.
  if (bundle.applabel !== scope.applabel || bundle.user_id !== scope.user_id || bundle.vaultlabel !== scope.vaultlabel) {
    throw new VaultError('corrupt_record', 'The stored vault bundle names a different app, user, or vault than the one asked for. It was left as it is.')
  }
  return bundle
}

/**
 * A stored record through its validator, with failure as a calm VaultError: storage is someone
 * else's database, and a record may be damaged or written by another version of this package.
 * The refusal names the record but never quotes it.
 */
const checkRecord = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, raw: unknown, said: string): RecordT => {
  const checked = recordSchema.safeParse(raw)
  if (! checked.success) {
    throw new VaultError('corrupt_record', `A stored ${said} record did not read back in a shape this package knows. It may be damaged, or written by another version of safebyok; it was left as it is.`)
  }
  return checked.data
}

// ---------------------------------------------- localVaultDB's own, not public surface

// Just the fields an expectation compares; a standing row too damaged to show them fails it.
const StandingBundle = Z.object({ vault_id: Z.string(), passphrase_epoch: Z.number() })
const StandingBox = Z.object({ revision_id: Z.string() })

/** True when the bundle row standing in storage is the one `expected` names. */
const bundleMeetsExpectation = (standingBundle: unknown, expected: BundleExpectation): boolean => {
  const standing = StandingBundle.safeParse(standingBundle)
  return standing.success
    && standing.data.vault_id === expected.vault_id
    && standing.data.passphrase_epoch === expected.passphrase_epoch
}

/** True when the bundle row standing in storage belongs to the vault `expected` names. */
const vaultMeetsExpectation = (standingBundle: unknown, expected: { vault_id: string }): boolean => {
  const standing = StandingBundle.safeParse(standingBundle)
  return standing.success && standing.data.vault_id === expected.vault_id
}

/** True when the bundle and lockbox rows standing in storage are the ones `expected` names. */
const lockboxMeetsExpectation = (standingBundle: unknown, standingBox: unknown, expected: LockboxExpectation): boolean => {
  if (! vaultMeetsExpectation(standingBundle, expected)) { return false }
  if (standingBox === null || standingBox === undefined) { return expected.revision_id === null }
  const box = StandingBox.safeParse(standingBox)
  return box.success && box.data.revision_id === expected.revision_id
}

// The ckeys localVaultDB stores rows under, and the device store its unlocks: a stored contract,
// so never reshaped. safebyok-indexeddb keeps a copy of its own.
export const scopePath = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`
const bundleCkey = (scope: VaultScope) => `vault:${scopePath(scope)}`
const boxCkey = (scope: VaultScope, boxlabel: string) => `box:${scopePath(scope)}:${boxlabel}`

/**
 * True for the ckey of a lockbox in `scope`. A prefix alone is not enough: a user_id may hold a
 * colon, so another user's rows can share this scope's prefix -- but never with a bare boxlabel
 * (which holds no colon) after it.
 */
const isBoxCkeyOf = (scope: VaultScope, ckey: unknown): ckey is string => {
  const prefix = `box:${scopePath(scope)}:`
  return typeof ckey === 'string' && ckey.startsWith(prefix) && ! ckey.slice(prefix.length).includes(':')
}

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

/**
 * VaultDB over a {@link StringStore}: rows as JSON text under scope-prefixed ckeys. A host
 * backs one with localStorage, for a vault that lives on this device alone; tests back one with a
 * Map. Every secret field in what it stores is ciphertext; what it lacks is reach -- rows stay
 * on this device instead of syncing through a shared database.
 *
 * @example
 *   const vaultDB = localVaultDB(memoryStore())
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const localVaultDB = (store: StringStore): VaultDB => new StringStoreVaultDB(store)

class StringStoreVaultDB extends VaultDB {
  // localStorage holds about five megabytes per origin, in all: a mebibyte is this adapter's
  // most for any one record.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a whole vault under a budget; the store's own quota refuses a write past it.
  readonly maxVaultBytes = Infinity

  private readonly store: StringStore

  constructor(store: StringStore) {
    super()
    this.store = store
  }

  // Work is deferred into the promise even though the store is synchronous: a storage fault must
  // reject the returned promise, never throw before the caller has one in hand. And each write
  // checks and saves in one synchronous step, so nothing else in this tab runs in between.
  protected doReadBundle(scope: VaultScope): Promise<unknown> {
    return soon(() => readJson(this.store, bundleCkey(scope)))
  }

  protected doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    return soon(() => {
      const standing = readJson(this.store, bundleCkey(bundle))
      if (standing !== null) { return standing }
      this.store.write(bundleCkey(bundle), JSON.stringify(bundle))
      return bundle
    })
  }

  protected doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    return soon(() => {
      if (! bundleMeetsExpectation(readJson(this.store, bundleCkey(bundle)), expected)) { return false }
      this.store.write(bundleCkey(bundle), JSON.stringify(bundle))
      return true
    })
  }

  protected doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return soon(() => readJson(this.store, boxCkey(scope, boxlabel)))
  }

  protected doListBoxes(scope: VaultScope): Promise<unknown[]> {
    return soon(() => (
      this.store.ckeys()
        .filter((ckey) => isBoxCkeyOf(scope, ckey))
        .map((ckey) => readJson(this.store, ckey))
        .filter((raw) => raw !== null)
    ))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    return soon(() => {
      const standingBundle = readJson(this.store, bundleCkey(scope))
      const standingBox = readJson(this.store, boxCkey(scope, lockbox.boxlabel))
      if (! lockboxMeetsExpectation(standingBundle, standingBox, expected)) { return false }
      this.store.write(boxCkey(scope, lockbox.boxlabel), JSON.stringify(lockbox))
      return true
    })
  }

  protected doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    return soon(() => {
      if (! vaultMeetsExpectation(readJson(this.store, bundleCkey(scope)), expected)) { return false }
      this.store.erase(boxCkey(scope, boxlabel))
      return true
    })
  }

  protected doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    return soon(() => {
      if (! vaultMeetsExpectation(readJson(this.store, bundleCkey(scope)), expected)) { return false }
      const doomed = this.store.ckeys().filter((ckey) => isBoxCkeyOf(scope, ckey))
      for (const ckey of [...doomed, bundleCkey(scope)]) { this.store.erase(ckey) }
      return true
    })
  }

  // The store's bell rings on every write, not only ones in scope: a spurious refresh is
  // harmless here, and a real adapter (Convex) subscribes precisely.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
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
