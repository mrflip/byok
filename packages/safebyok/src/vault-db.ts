import * as Z from 'zod/mini'
import { Lockbox, LockboxSummary, VaultBundle, VaultScope, type DamagedLockbox } from './types'
import { VaultError } from './errors'
import * as Names from './names'
import type { VaultValidators } from './validators'
import type { StringStore } from './string-store'
import * as Ckeys from './ckeys'

/**
 * What a bundle update was proven against: the vault and the unlock epoch of the bundle the
 * writer read. The update lands only while the standing bundle still has both. Plain JSON, so it
 * crosses any wire as-is.
 *
 * @example { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }
 */
export type BundleExpectation = Z.infer<typeof BundleExpectation>
const BundleExpectation = Z.object({
  vault_id:         VaultBundle.shape.vault_id,
  unlock_epoch:     VaultBundle.shape.unlock_epoch,
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
 * One lockbox as a VaultDB's `doListBoxes` hands it up: the boxlabel it is stored under -- the
 * one `doReadBox` and `doEraseBox` reach it by -- and its record exactly as stored, damaged or
 * not. The listing checks the record; the boxlabel is what lets a damaged one still be named, and
 * so erased or overwritten.
 *
 * @example { boxlabel: 'anthropic', lockbox: storedRecord }
 */
export type StoredLockbox = { boxlabel: string, lockbox: unknown }

/**
 * Remote storage for vault records, as the host application plugs it in: extend this class and
 * implement its `do*` methods against your backend, one for each verb safebyok calls. That is the
 * whole job -- you are a shelf, not a safe:
 *
 *  * **Store what you are handed, return what you stored.** Every record is plain JSON (binary
 *    fields are base64url text), so any backend that can hold JSON can hold a vault, as-is.
 *  * **Never look inside.** Every secret field arrives encrypted; nothing you hold can open a
 *    vault, and nothing safebyok does ever needs you to understand a record -- only to compare a
 *    few public fields (`vault_id`, `unlock_epoch`, `revision_id`) before a write.
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
 * checks every adapter owes: names, scope, records and expectations on the way in, the shape of
 * every record on the way out, `stale_write` for a failed expectation, and `storage_unavailable`
 * (your own error as its `cause`) for anything you throw that is not already a VaultError.
 * Implement the `do*` methods; never override the public verbs.
 *
 * Each public verb takes the vault's `validators` last, as openVault was given them, and checks
 * every name and note with them, going in and coming back; left out, it checks with ours
 * (`DefaultValidators`). Your `do*` methods never see them: they take any text as a name. One
 * that hands each call on to another VaultDB's public verbs passes them `AnyTextValidators`, as
 * its own verbs have checked every name already.
 */
export abstract class VaultDB {
  /**
   * The most this backend holds in one record, in bytes: a plain fact about the backend, or
   * `Infinity` when it sets no per-record limit. A vault refuses to open with a `maxWhisperBytes`
   * over half of it, leaving room for encoding and the record's other fields; and `updateBox`
   * refuses, with kind `lockbox_too_large`, a lockbox that with its scope weighs more than this
   * as the UTF-8 bytes of its JSON -- a long note or long names can make one so.
   */
  abstract readonly maxRecordBytes: number

  /**
   * The most this backend holds of one vault in all, in bytes as stored -- every lockbox
   * together -- or `Infinity` when it sets no such limit. Declare what the backend can still
   * list and erase whole: a backend that reads a vault in one transaction under a read budget
   * declares the share of that budget its heaviest verb leaves. A vault refuses to open when its
   * `maxLockboxes` lockboxes might not fit in it, each counted at twice `maxWhisperBytes` (room
   * for encoding and for the backend's own counting) and 2 KiB for its other fields, which covers
   * them at their largest under the default validators. And since a host's validators may admit
   * names and notes of any length, each `store()` measures them: it refuses, with kind
   * `vault_full`, a write that would take the vault past this limit, each lockbox counted at
   * twice `maxWhisperBytes` and the UTF-8 bytes of its scope, boxlabel and note as JSON, with a
   * little more for its fixed-size fields. A backend that also
   * enforces a limit of its own sets it above what this admits, and refuses a lockbox write past it with a
   * VaultError of kind `vault_full`. A backend that does not hold to the limit it declares, or
   * a vault opened with limits that disagree with its backend's, is undefined behaviour: not a
   * bug we will fix, and not one whose outcome we promise.
   */
  abstract readonly maxVaultBytes: number

  /**
   * The most lockboxes this backend holds in one vault, a whole number, or `Infinity` when it sets
   * no such limit: each backend sets its own, and one whose limit crosses a wire or is stored,
   * where `Infinity` cannot go, sets a large whole number instead. A vault refuses to open with a
   * `maxLockboxes` above it, with kind `bad_option`, and given none opens with the smaller of this
   * and `MaxLockboxes`. A backend that enforces its limit refuses a new lockbox past it with
   * a VaultError of kind `vault_full`, checked in the same atomic step as the write, and never
   * refuses for the count a lockbox that replaces one already there.
   */
  abstract readonly maxLockboxes: number

  // ------------------------------------------------------------------- the verbs safebyok calls

  /** The vault's bundle, validated, or null when the vault has never been created. */
  async readBundle(scope: VaultScope, validators?: VaultValidators): Promise<VaultBundle | null> {
    const asked = Names.checkScope(Names.rulesOf(validators), scope)
    const raw = await fromStorage(() => this.doReadBundle(asked))
    if (raw === null || raw === undefined) { return null }
    return checkBundle(raw, asked)
  }

  /**
   * Store `bundle` only if its scope holds none, and return whichever bundle stands there after:
   * the given one, or the one another device got in first with.
   */
  async createBundle(bundle: VaultBundle, validators?: VaultValidators): Promise<VaultBundle> {
    const asked = Names.checkScope(Names.rulesOf(validators), bundle)
    const outgoing = checkOutgoing(VaultBundle, bundle, 'vault bundle')
    const raw = await fromStorage(() => this.doCreateBundle(outgoing))
    return checkBundle(raw, asked)
  }

  /**
   * Replace the bundle with `bundle`, only while the standing one still has the `vault_id` and
   * `unlock_epoch` in `expected`. Refuses with kind `stale_write` otherwise -- including when
   * no bundle stands at all -- and writes nothing. A vault's `vault_id` never changes, so `bundle`
   * must carry the one in `expected`: kind 'bad_option' otherwise.
   */
  async updateBundle(bundle: VaultBundle, expected: BundleExpectation, validators?: VaultValidators): Promise<void> {
    Names.checkScope(Names.rulesOf(validators), bundle)
    const outgoing = checkOutgoing(VaultBundle, bundle, 'vault bundle')
    const expectation = checkOutgoing(BundleExpectation, expected, 'bundle expectation')
    if (outgoing.vault_id !== expectation.vault_id) {
      throw new VaultError('bad_option', "updateBundle replaces a vault's bundle within that vault: the bundle's vault_id must be the expected one, as a vault_id never changes.")
    }
    const landed = await fromStorage(() => this.doUpdateBundle(outgoing, expectation))
    if (! landed) {
      throw new VaultError('stale_write', 'The vault changed in storage since this device read it -- its ways in were changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying.')
    }
  }

  /** One lockbox, validated, or null when there is none under that boxlabel. */
  async readBox(scope: VaultScope, boxlabel: string, validators?: VaultValidators): Promise<Lockbox | null> {
    const rules = Names.rulesOf(validators)
    const asked = Names.checkScope(rules, scope)
    const label = Names.check(rules, 'boxlabel', boxlabel)
    const raw = await fromStorage(() => this.doReadBox(asked, label))
    if (raw === null || raw === undefined) { return null }
    const lockbox = checkStoredBox(rules, Lockbox, raw)
    // A record that names some other boxlabel is a record out of place, wherever it came from.
    if (lockbox.boxlabel !== label) {
      throw new VaultError('corrupt_record', 'The stored lockbox names a different boxlabel than the one asked for. It was left as it is.')
    }
    return lockbox
  }

  /**
   * Public faces of every lockbox in the vault -- ciphered fields stripped, `note` null where a
   * lockbox has none, sorted by boxlabel -- valid while locked. A lockbox whose record does not
   * read back as one, names another boxlabel than it is stored under, or is stored under a
   * boxlabel or with a note `validators` refuse (written under other checks), is listed as a
   * {@link DamagedLockbox} rather than refused, so one bad record never hides the rest.
   */
  async listBoxes(scope: VaultScope, validators?: VaultValidators): Promise<(LockboxSummary | DamagedLockbox)[]> {
    const rules = Names.rulesOf(validators)
    const asked = Names.checkScope(rules, scope)
    const stored = await fromStorage(() => this.doListBoxes(asked))
    return stored
      .filter((entry) => isNameable(entry))
      .map((entry) => listedOrDamaged(rules, entry))
      .toSorted((one, two) => one.boxlabel.localeCompare(two.boxlabel))
  }

  /**
   * Write `lockbox` under its boxlabel, only while the scope's standing bundle has the
   * `vault_id` in `expected` and the standing lockbox has its `revision_id` (or, for null, there
   * is none). Refuses with kind `stale_write` otherwise -- including when the scope holds no
   * bundle -- and writes nothing. A backend that holds each vault to a limit of its own refuses
   * a write past it with kind `vault_full`, writing nothing. A lockbox heavier than the
   * backend's `maxRecordBytes` is refused with kind `lockbox_too_large` before storage sees it.
   */
  async updateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation, validators?: VaultValidators): Promise<void> {
    const rules = Names.rulesOf(validators)
    const asked = Names.checkScope(rules, scope)
    Names.check(rules, 'boxlabel', LabelledBox.safeParse(lockbox).data?.boxlabel)
    const outgoing = checkOutgoing(Lockbox, lockbox, 'lockbox')
    if (outgoing.note !== undefined) { Names.check(rules, 'note', outgoing.note) }
    const expectation = checkOutgoing(LockboxExpectation, expected, 'lockbox expectation')
    const recordBytes = jsonBytes({ ...asked, ...outgoing })
    if (recordBytes > this.maxRecordBytes) {
      throw new VaultError('lockbox_too_large', `That lockbox weighs ${String(recordBytes)} bytes, over the ${String(this.maxRecordBytes)} its storage holds in one record, so nothing was written: store a smaller whisper, or a shorter note or boxlabel.`)
    }
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
  async eraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation, validators?: VaultValidators): Promise<void> {
    const rules = Names.rulesOf(validators)
    const asked = Names.checkScope(rules, scope)
    const label = Names.check(rules, 'boxlabel', boxlabel)
    const expectation = checkOutgoing(EraseExpectation, expected, 'erase expectation')
    const landed = await fromStorage(() => this.doEraseBox(asked, label, expectation))
    if (! landed) { throw staleErase() }
  }

  /**
   * Remove the bundle and every lockbox -- the backend's part of deleting a vault -- only while
   * the standing bundle has the `vault_id` in `expected`. Refuses with kind `stale_write`
   * otherwise -- including when the scope holds no bundle -- and erases nothing.
   */
  async eraseVault(scope: VaultScope, expected: EraseExpectation, validators?: VaultValidators): Promise<void> {
    const asked = Names.checkScope(Names.rulesOf(validators), scope)
    const expectation = checkOutgoing(EraseExpectation, expected, 'erase expectation')
    const landed = await fromStorage(() => this.doEraseVault(asked, expectation))
    if (! landed) { throw staleErase() }
  }

  /**
   * Calls `onChange` after any write touching `scope`, from this device or another; returns the
   * unsubscribe. A backend without push never calls: safebyok refreshes after its own writes
   * regardless, so all it loses is news of *other* devices' writes.
   */
  subscribe(scope: VaultScope, onChange: () => void, validators?: VaultValidators): () => void {
    const asked = Names.checkScope(Names.rulesOf(validators), scope)
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
   * `expected.unlock_epoch`. True when it was written; false, writing nothing, when the
   * expectation failed or no bundle stands.
   */
  protected abstract doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean>
  /** The stored lockbox record under `boxlabel`, exactly as saved, or null when there is none. */
  protected abstract doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown>
  /**
   * Every lockbox in `scope`, in any order, each as a {@link StoredLockbox}: the boxlabel it is
   * stored under, and its record exactly as stored -- whole, or, where the backend can project,
   * without its two ciphered fields, `lockbox_key_wrapped` and `whisper_ciphered`. Keep `format`
   * and every other field, and hand up a record that looks damaged as it is: the listing marks it.
   */
  protected abstract doListBoxes(scope: VaultScope): Promise<StoredLockbox[]>
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
 * True when a listed lockbox is stored under text, which reaches it whatever the vault's checks:
 * a vault erases a box by the name it was stored under, even one its boxlabel check now refuses.
 */
const isNameable = (stored: StoredLockbox): boolean => typeof (stored as { boxlabel?: unknown }).boxlabel === 'string'

/**
 * One nameable stored lockbox as the listing shows it: its summary, or -- when its record fails
 * the check, names another boxlabel than it is stored under, or is stored under a boxlabel or
 * with a note the vault's checks refuse, as `readBox` would refuse it -- a
 * {@link DamagedLockbox} under the boxlabel it is stored under.
 */
const listedOrDamaged = (rules: Names.NameRules, { boxlabel, lockbox }: StoredLockbox): LockboxSummary | DamagedLockbox => {
  const checked = ListedLockbox.safeParse(lockbox)
  const sound = checked.success && checked.data.boxlabel === boxlabel && Names.admits(rules, 'boxlabel', boxlabel)
    && (checked.data.note === undefined || Names.admits(rules, 'note', checked.data.note))
  return sound ? LockboxSummary.parse(checked.data) : { boxlabel, damaged: true }
}

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

// The label a lockbox is written under, checked as a name before the rest of the record is.
const LabelledBox = Z.object({ boxlabel: Z.string() })

/**
 * A stored lockbox, whole or as listed, through its record's validator and then the vault's
 * checks for its boxlabel and note: a record that fails either is refused as 'corrupt_record'.
 */
const checkStoredBox = <RecordT extends { boxlabel: string, note?: string | undefined }>(rules: Names.NameRules, recordSchema: Z.ZodMiniType<RecordT>, raw: unknown): RecordT => {
  const lockbox = checkRecord(recordSchema, raw, 'lockbox')
  const named = Names.admits(rules, 'boxlabel', lockbox.boxlabel) && (lockbox.note === undefined || Names.admits(rules, 'note', lockbox.note))
  if (! named) {
    throw new VaultError('corrupt_record', "A stored lockbox's boxlabel or note does not pass the vault's validators. It may be damaged, or stored under other validators than these; it was left as it is.")
  }
  return lockbox
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
const StandingBundle = Z.object({ vault_id: Z.string(), unlock_epoch: Z.number() })
const StandingBox = Z.object({ revision_id: Z.string() })

/** True when the bundle row standing in storage is the one `expected` names. */
const bundleMeetsExpectation = (standingBundle: unknown, expected: BundleExpectation): boolean => {
  const standing = StandingBundle.safeParse(standingBundle)
  return standing.success
    && standing.data.vault_id === expected.vault_id
    && standing.data.unlock_epoch === expected.unlock_epoch
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

/**
 * What `val` weighs as the UTF-8 bytes of its JSON: how the vault measures a record against its
 * storage's limits. Every in-tree backend counts a record as no heavier.
 */
export const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

/**
 * VaultDB over a {@link StringStore}: rows as JSON text under the ckeys `Ckeys` gives. A host
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
  // Nor does it count lockboxes: the vault's own maxLockboxes is the only limit.
  readonly maxLockboxes = Infinity

  private readonly store: StringStore

  constructor(store: StringStore) {
    super()
    this.store = store
  }

  // Work is deferred into the promise even though the store is synchronous: a storage fault must
  // reject the returned promise, never throw before the caller has one in hand. And each write
  // checks and saves in one synchronous step, so nothing else in this tab runs in between.
  protected doReadBundle(scope: VaultScope): Promise<unknown> {
    return soon(() => readJson(this.store, Ckeys.bundle(scope)))
  }

  protected doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    return soon(() => {
      const standing = readJson(this.store, Ckeys.bundle(bundle))
      if (standing !== null) { return standing }
      this.store.write(Ckeys.bundle(bundle), JSON.stringify(bundle))
      return bundle
    })
  }

  protected doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    return soon(() => {
      if (! bundleMeetsExpectation(readJson(this.store, Ckeys.bundle(bundle)), expected)) { return false }
      this.store.write(Ckeys.bundle(bundle), JSON.stringify(bundle))
      return true
    })
  }

  protected doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return soon(() => readJson(this.store, Ckeys.box(scope, boxlabel)))
  }

  protected doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    return soon(() => (
      this.store.ckeys()
        .filter(Ckeys.isBoxIn(scope))
        .map((ckey) => ({ boxlabel: Ckeys.boxlabelOf(ckey), text: this.store.read(ckey) }))
        // A row erased since the ckeys were read is gone; one that is not JSON goes up as its text.
        .filter((row): row is { boxlabel: string, text: string } => row.boxlabel !== null && row.text !== null)
        .map(({ boxlabel, text }) => ({ boxlabel, lockbox: jsonOrText(text) }))
    ))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    return soon(() => {
      const standingBundle = readJson(this.store, Ckeys.bundle(scope))
      const standingBox = readJson(this.store, Ckeys.box(scope, lockbox.boxlabel))
      if (! lockboxMeetsExpectation(standingBundle, standingBox, expected)) { return false }
      this.store.write(Ckeys.box(scope, lockbox.boxlabel), JSON.stringify(lockbox))
      return true
    })
  }

  protected doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    return soon(() => {
      if (! vaultMeetsExpectation(readJson(this.store, Ckeys.bundle(scope)), expected)) { return false }
      this.store.erase(Ckeys.box(scope, boxlabel))
      return true
    })
  }

  protected doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    return soon(() => {
      if (! vaultMeetsExpectation(readJson(this.store, Ckeys.bundle(scope)), expected)) { return false }
      const doomed = this.store.ckeys().filter(Ckeys.isBoxIn(scope))
      for (const ckey of [...doomed, Ckeys.bundle(scope)]) { this.store.erase(ckey) }
      return true
    })
  }

  // The store's bell rings on every write, not only ones in scope: a spurious refresh is
  // harmless here, and a real adapter (Convex) subscribes precisely.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return this.store.subscribe(onChange)
  }
}

/** Stored text as the JSON it holds, or as itself when it holds none: a damaged row, for the listing to mark. */
const jsonOrText = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
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
