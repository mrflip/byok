import * as Z from 'zod'
import { DeviceUnlock, Label, LockboxNote, LockboxSummary, type Lockbox, ForcePassphraseReentryHours, FarFuture, MaxLockboxes, MaxWhisperBytes, VaultBundle, Whisper, wallClock, type Clock, type VaultScope } from './types'
import { VaultError, isVaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import {
  cipherBinding, cipherBytes, decipherBytes, fromB64, importWrappingKeyBytes,
  makeLocalUnlockKey, makeLockboxKey, makeVaultKey, randomBytes, randomId, toB64, wrapKeyUnder, unwrapKeyUnder,
} from './crypto'
import { stableJsonify } from './stable-jsonify'
import type { DeviceDB } from './device-db'
import type { VaultDB } from './vault-db'

/**
 * Where the vault stands, as the UI branches on it:
 *  * `opening`  -- still reading the bundle and device cache; show nothing yet
 *  * `absent`   -- never created; the first unlock() will choose its passphrase
 *  * `locked`   -- exists, summaries readable, whispers not; unlock() opens it
 *  * `unlocked` -- whispers readable until askPassphraseAt or lock()
 */
export type VaultState = 'opening' | 'absent' | 'locked' | 'unlocked'

/**
 * Immutable picture of the vault for rendering, shaped for `useSyncExternalStore`: the object
 * keeps its identity until something changes. Lockbox summaries (labels and public metadata, no
 * whispers) are present even while locked -- that is the point of keeping metadata public.
 */
export type VaultSnapshot = {
  state:     VaultState
  scope:     VaultScope
  boxes:     readonly LockboxSummary[]
  /**
   * Epoch ms from which the vault asks for the passphrase again, while unlocked; null otherwise.
   * The unlock's time plus `forcePassphraseReentryHours`, never later than the last instant a
   * `Date` can hold (8.64e15): with `Infinity` hours, a vault that asks again only after
   * `lock()` reads as that far-future time, and `new Date(askPassphraseAt)` still works.
   */
  askPassphraseAt: number | null
}

export type OpenVaultOpts = {
  /** The host application's namespace: one backend can serve several apps without collision. */
  applabel:   string
  /** Stable identifier of the signed-in user, from the host's auth. Never an email. */
  userId:     string
  /** The vault's own label; an app that keeps one vault per user calls it `main`. */
  vaultlabel: string
  vaultDB:    VaultDB
  deviceDB:   DeviceDB
  /**
   * What turns a passphrase into passphraseKey bytes: in a browser, the pinned Argon2id deriver
   * that `browserOpts()` from `safebyok/browser` supplies. See {@link KeyDeriver} for the narrow
   * reasons to substitute. Asked for outright, so an app that passes another never ships this one.
   */
  keyDeriver: KeyDeriver
  /**
   * How many hours an entered passphrase lasts on this device, remembered across reloads, before
   * the vault asks for it again. Default: {@link ForcePassphraseReentryHours}, 168 (seven days).
   * Any number above zero, fractions too: 0.25 is fifteen minutes. `Infinity` means never on
   * this device: the vault stays unlocked until `lock()` (or the vault changes under it), and
   * `askPassphraseAt` reads as the latest instant a `Date` can hold, however large the number.
   */
  forcePassphraseReentryHours?: number | undefined
  /** Time source for expiry; tests inject one. Default: the wall clock. */
  clock?: Clock | undefined
  /**
   * The largest whisper `store()` accepts, in bytes of its JSON. Default: {@link MaxWhisperBytes},
   * 40444. Checked on write only, so lowering it never strands a whisper already stored. At most
   * half the vaultDB's `maxRecordBytes`: openVault refuses more with kind 'bad_option'.
   */
  maxWhisperBytes?: number | undefined
  /**
   * The most lockboxes the vault holds. Default: {@link MaxLockboxes}, 100. `store()` refuses a
   * new lockbox past it with kind 'vault_full'; replacing one already there is always allowed,
   * and lowering it strands nothing already stored. Raise this or `maxWhisperBytes` freely while
   * the two fit the vaultDB's `maxVaultBytes`: openVault refuses a pair that might not, with kind
   * 'bad_option'.
   */
  maxLockboxes?: number | undefined
}

/**
 * A user's vault of lockboxes. All reading and writing of whispers goes through here; the UI
 * renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * Operations that touch a whisper -- store, read, use, erase -- require the vault unlocked, and
 * throw a VaultError of kind 'vault_locked' otherwise: the host catches that, asks the user for
 * their passphrase, calls unlock(), and retries. Nothing prompts on open.
 */
export type Vault = {
  /** Current snapshot; same object until something changes (useSyncExternalStore-ready). */
  getSnapshot: () => VaultSnapshot
  /** Calls `listener` after every snapshot change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void

  /**
   * Open the vault with its passphrase, remembering the unlock on this device for
   * `forcePassphraseReentryHours`. On an `absent` vault this first unlock creates it, with this passphrase.
   * A wrong passphrase throws kind 'wrong_passphrase' and changes nothing -- learned from the
   * vaultKey envelope refusing to decrypt, never from a comparison.
   *
   * A `lock()` or `destroy()` called while the unlock is still under way wins: the vault stays
   * locked, this device remembers nothing, and the call throws kind 'vault_locked'. A vault the
   * unlock was creating stays created, locked, under this passphrase.
   */
  unlock(passphrase: string): Promise<void>
  /**
   * Forget the unlock, in memory and on this device: back to `locked`. Wins over an `unlock()` or
   * `changePassphrase()` still under way, which then leaves the vault locked.
   */
  lock(): Promise<void>

  /**
   * Re-wrap the vaultKey under a new passphrase. Lockboxes are untouched -- their lockboxKeys
   * stay wrapped under the unchanged vaultKey -- so this is cheap no matter how many there are.
   * Every other device's unlock (remembered or in hand) lapses: the bundle's passphraseEpoch
   * moves, and they fall back to `locked` on their next look.
   *
   * Works locked or unlocked, since the old passphrase is proof enough. A wrong `oldPassphrase`
   * throws kind 'wrong_passphrase' and changes nothing. If another device changes the passphrase
   * (or destroys the vault) between this device's look and its write, nothing is written and
   * the call throws kind 'stale_write', after catching up with storage.
   *
   * Leaves the vault unlocked under the new passphrase -- unless `lock()` or `destroy()` is
   * called while the change is under way, which wins: the passphrase still changes, and the
   * vault stays locked.
   */
  changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void>

  /**
   * Write a whisper into the lockbox `boxlabel`, creating or replacing it. Requires unlocked;
   * kind 'whisper_too_large' when its JSON is over the vault's `maxWhisperBytes`, and kind
   * 'vault_full' when `boxlabel` is new and the vault already holds its `maxLockboxes` -- erase
   * one first. Replacing a lockbox is never refused for room.
   *
   * The write lands only if storage still holds what this device last read: the same vault, and
   * the same revision of this lockbox (or still none). When another device got in first, the
   * store catches up with storage and tries again, over what that device wrote -- the last
   * writer wins -- for three attempts in all, and throws kind 'stale_write' only when the third is
   * refused too, the snapshot showing the box as it now stands. A box that stood when an attempt
   * read it and is gone on the retry was erased elsewhere, and an erase wins: nothing is written,
   * and the call throws kind 'stale_write' at once. A retry that finds the vault destroyed or
   * made anew elsewhere, or its passphrase changed, finds this device relocked instead, and
   * throws kind 'vault_locked' without writing: a stale session never writes into a vault reborn
   * under new keys.
   *
   * `opts.note` is the lockbox's public note, shown while locked: text of at most 256
   * characters, or null for none -- kind 'bad_option' otherwise. Left out, the lockbox keeps the
   * note it has. Never put secret material in a note.
   *
   * @example await vault.store('anthropic_api_key', 'sk-ant-...', { note: 'work account' })
   * @example await vault.store('anthropic_api_key', 'sk-ant-...', { note: null })  // and no note
   */
  store(boxlabel: string, whisper: Whisper, opts?: { note?: string | null | undefined }): Promise<void>
  /** The whisper in `boxlabel`. Requires unlocked; kind 'absent_box' when there is none. */
  read(boxlabel: string): Promise<Whisper>
  /**
   * Hand the whisper to `callback` and return its result: the shape that discourages parking a
   * secret in state. Requires unlocked.
   *
   * @example await vault.use('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  use<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT>
  /**
   * Remove the lockbox `boxlabel` entirely, whatever revision of it stands. Requires unlocked;
   * kind 'absent_box' when absent. The erase lands only in the vault this device last read: if
   * it was destroyed, or destroyed and made anew, elsewhere, nothing is erased and the call
   * throws kind 'stale_write', after catching up with storage -- which relocks this device.
   * Unlike `store()`, an erase is never retried: that is its only expectation, and trying again
   * could not meet it.
   */
  erase(boxlabel: string): Promise<void>

  /**
   * Delete the vault's every stored record, remote and device-local: the vault half of deleting
   * an account. Deliberately does NOT require unlock -- an authenticated owner can always delete
   * their own rows server-side, and pretending otherwise would be false comfort.
   *
   * Deletes the vault this handle last read, and only that one: if it was destroyed, or
   * destroyed and made anew, elsewhere since, storage keeps what stands there now and the call
   * throws kind 'stale_write', after catching up -- a second destroy() then deletes the vault
   * that stands. On a vault this handle has never seen created, only the device-local record goes.
   */
  destroy(): Promise<void>
  /** Release subscriptions and refuse further calls. Forgets nothing stored. */
  close(): void
}

/**
 * What `bundle` holds before the backend's first answer arrives: distinct from null, which is the
 * backend's own answer ("no bundle: this vault was never created"). Symbol.for, not Symbol, so
 * the sentinel stays one value even when the ESM and CJS builds load side by side.
 */
const UnreadBundle = Symbol.for('safebyok.unread_bundle')

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or under a new passphraseKey); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/**
 * Open a handle on one user's vault. Reads the bundle and the device's remembered unlock, then
 * settles into `absent`, `locked`, or (when a remembered unlock is still fresh) `unlocked` --
 * never prompting: asking for a passphrase is the host's job, and only when a whisper is
 * actually wanted.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 *   vault.getSnapshot().state  // 'absent' | 'locked' | 'unlocked'
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, deviceDB, keyDeriver })
 */
export const openVault = async (opts: OpenVaultOpts): Promise<Vault> => {
  const applabel   = parseLabel(opts.applabel)
  const vaultlabel = parseLabel(opts.vaultlabel)
  if (! opts.userId) { throw new VaultError('bad_label', 'A vault needs the signed-in user: pass the userId from your auth layer.') }
  const scope: VaultScope = { applabel, user_id: opts.userId, vaultlabel }
  const { vaultDB, deviceDB } = opts
  const reentryMs = parseForcePassphraseReentryHours(opts.forcePassphraseReentryHours)
  const clock = opts.clock ?? wallClock
  const keyDeriver = parseKeyDeriver(opts.keyDeriver)
  const whisperByteLimit = parseMaxWhisperBytes(opts.maxWhisperBytes)
  const lockboxLimit = parseMaxLockboxes(opts.maxLockboxes)
  ensureLimitsFit(vaultDB, whisperByteLimit, lockboxLimit)

  let bundle: VaultBundle | null | typeof UnreadBundle = UnreadBundle
  let boxes: readonly LockboxSummary[] = []
  let askPassphraseAt: number | null = null
  let vaultKey: CryptoKey | null = null
  let closed = false
  // How many times this handle has shut. An unlock under way notes the number when it starts, and
  // takes nothing up if a shut has moved it meanwhile: the lock wins.
  let shutsSoFar = 0

  const listeners = new Set<() => void>()
  const vaultState = (): VaultState => {
    if (bundle === UnreadBundle) { return 'opening' }
    if (bundle === null) { return 'absent' }
    if (vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > clock.now()) { return 'unlocked' }
    return 'locked'
  }
  let snapshot: VaultSnapshot = { state: vaultState(), scope, boxes, askPassphraseAt }
  // The snapshot keeps its identity until something really changed: useSyncExternalStore's
  // contract, and what spares React a render when a background refresh found nothing new.
  const bump = () => {
    const state = vaultState()
    const next: VaultSnapshot = { state, scope, boxes, askPassphraseAt: state === 'unlocked' ? askPassphraseAt : null }
    if (stableJsonify(next) === stableJsonify(snapshot)) { return }
    snapshot = next
    listeners.forEach((listener) => { listener() })
  }

  // The context each encryption is bound to; see VOCABULARY.md on cipherAdditionalData.
  const bundleBinding = (vaultId: string, epoch: number, purpose: 'vault_key_passphrase_wrapped' | 'vault_key_local_wrapped') => (
    cipherBinding('safebyok-vault-v1', applabel, scope.user_id, vaultlabel, vaultId, epoch, purpose)
  )
  const boxBinding = (vaultId: string, boxlabel: string, revisionId: string, purpose: 'lockbox_key_wrapped' | 'whisper_ciphered') => (
    cipherBinding('safebyok-lockbox-v1', applabel, scope.user_id, vaultlabel, vaultId, boxlabel, revisionId, purpose)
  )

  const refresh = async () => {
    const fresh = await vaultDB.readBundle(scope)
    // A passphrase change elsewhere (new epoch) or a deletion ends this device's unlock: the
    // vaultKey in hand still works on old rows, but pretending to be current invites confusion.
    const outlived = vaultKey !== null && bundle !== UnreadBundle && bundle !== null
      && (fresh?.passphrase_epoch !== bundle.passphrase_epoch || fresh.vault_id !== bundle.vault_id)
    if (outlived) {
      vaultKey = null
      askPassphraseAt = null
      await deviceDB.eraseUnlock(scope)
    }
    bundle = fresh
    boxes = fresh === null ? [] : await vaultDB.listBoxes(scope)
    bump()
  }

  // Secret-touching operations call this first. Expiry is checked at use, not on a timer: a
  // snapshot may briefly say 'unlocked' past the deadline, but no whisper comes out past it.
  const ensureOpen = () => {
    if (closed) { throw new VaultError('vault_closed', 'This vault handle was closed: open the vault again.') }
  }
  const ensureUnlocked = (): CryptoKey => {
    ensureOpen()
    if (vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > clock.now()) { return vaultKey }
    vaultKey = null
    askPassphraseAt = null
    bump()
    throw new VaultError('vault_locked', 'The vault is locked: ask the user for their passphrase and call unlock().')
  }

  const currentBundle = (): VaultBundle => {
    if (bundle === UnreadBundle || bundle === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return bundle
  }

  /** The vaultKey out of a bundle's passphrase envelope; its refusal IS the passphrase check. */
  const unwrapWithPassphrase = async (standing: VaultBundle, passphrase: string): Promise<VaultKeyPair> => {
    if (standing.key_deriver_label !== keyDeriver.key_deriver_label) {
      throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
    }
    const passphraseKeyBytes = await keyDeriver.deriveKeyBytes(passphrase, fromB64(standing.passphrase_salt_b64))
    const passphraseKey = await importWrappingKeyBytes(passphraseKeyBytes)
    const binding = bundleBinding(standing.vault_id, standing.passphrase_epoch, 'vault_key_passphrase_wrapped')
    try {
      // The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty
      // usage list, so it carries the narrowest one.
      const transientKey = await unwrapKeyUnder(passphraseKey, standing.vault_key_passphrase_wrapped, binding, { extractable: true, usage: ['wrapKey'] })
      const sessionKey = await unwrapKeyUnder(passphraseKey, standing.vault_key_passphrase_wrapped, binding, { extractable: false, usage: ['wrapKey', 'unwrapKey'] })
      return { transientKey, sessionKey }
    } catch {
      throw new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again.")
    }
  }

  /** A brand-new bundle around a brand-new vaultKey, wrapped under `passphrase`. */
  const draftBundle = async (passphrase: string): Promise<{ draft: VaultBundle } & VaultKeyPair> => {
    const vaultId = randomId()
    const saltBytes = randomBytes(keyDeriver.salt_bytes)
    const freshKey = await makeVaultKey()
    const passphraseKey = await importWrappingKeyBytes(await keyDeriver.deriveKeyBytes(passphrase, saltBytes))
    const binding = bundleBinding(vaultId, 1, 'vault_key_passphrase_wrapped')
    const envelope = await wrapKeyUnder(passphraseKey, freshKey, binding)
    const sessionKey = await unwrapKeyUnder(passphraseKey, envelope, binding, { extractable: false, usage: ['wrapKey', 'unwrapKey'] })
    const now = new Date(clock.now()).toISOString()
    const draft: VaultBundle = {
      format:              'safebyok-vault-v1',
      ...scope,
      vault_id:            vaultId,
      passphrase_epoch:    1,
      key_deriver_label:   keyDeriver.key_deriver_label,
      passphrase_salt_b64: toB64(saltBytes),
      vault_key_passphrase_wrapped: envelope,
      created_at:          now,
      updated_at:          now,
    }
    return { draft, transientKey: freshKey, sessionKey }
  }

  /**
   * The vaultKey for an unlock, and the bundle it was proven against: creating the vault when
   * absent, proving the passphrase when not.
   */
  const settleUnlock = async (passphrase: string): Promise<{ standing: VaultBundle } & VaultKeyPair> => {
    if (bundle === null || bundle === UnreadBundle) {
      const { draft, transientKey, sessionKey } = await draftBundle(passphrase)
      const settled = await vaultDB.createBundle(draft)
      bundle = settled
      if (settled.vault_id === draft.vault_id) { return { standing: settled, transientKey, sessionKey } }
      // Another device created the vault between our look and our write: the settled bundle is
      // theirs, and this passphrase must prove itself against it like any other.
      return { standing: settled, ...await unwrapWithPassphrase(settled, passphrase) }
    }
    const standing = bundle
    return { standing, ...await unwrapWithPassphrase(standing, passphrase) }
  }

  /**
   * Forget the unlock, in memory and on this device. Every lock goes through here, and whatever
   * unlock is under way when it does loses to it.
   */
  const shut = async () => {
    shutsSoFar += 1
    vaultKey = null
    askPassphraseAt = null
    await deviceDB.eraseUnlock(scope)
  }

  /** True when the vault has shut since `shutsThen` was read from `shutsSoFar`. */
  const shutSince = (shutsThen: number) => shutsSoFar !== shutsThen

  /**
   * Remember an unlock on this device and take up its vaultKey, deadline from now -- unless the
   * vault has shut since `shutsThen`, which wins: then nothing is taken up, and a device record
   * already written is erased again.
   *
   * @returns True when the vault is now unlocked.
   */
  const takeUpUnlock = async (unlocked: VaultKeyPair, standing: VaultBundle, shutsThen: number): Promise<boolean> => {
    if (shutSince(shutsThen)) { return false }
    const until = deadlineAfter(clock.now(), reentryMs)
    // The transient's last act: wrapped into this device's remembered unlock, then dropped.
    await rememberDevice(unlocked.transientKey, standing, until)
    if (shutSince(shutsThen)) {
      // The shut's own erase may have run before this record landed.
      await deviceDB.eraseUnlock(scope)
      return false
    }
    vaultKey = unlocked.sessionKey
    askPassphraseAt = until
    return true
  }

  /** Mint a fresh localUnlockKey, wrap the vaultKey under it, and remember the unlock on this device. */
  const rememberDevice = async (unlockedKey: CryptoKey, standing: VaultBundle, until: number) => {
    const localUnlockKey = await makeLocalUnlockKey()
    const wrapped = await wrapKeyUnder(localUnlockKey, unlockedKey, bundleBinding(standing.vault_id, standing.passphrase_epoch, 'vault_key_local_wrapped'))
    await deviceDB.writeUnlock({
      format:                  'safebyok-unlock-v1',
      ...scope,
      vault_id:                standing.vault_id,
      passphrase_epoch:        standing.passphrase_epoch,
      local_unlock_key:        localUnlockKey,
      vault_key_local_wrapped: wrapped,
      expires_at:              until,
    })
  }

  /**
   * Pick up a remembered unlock, if this device holds one that still fits and still opens. The
   * deviceDB may be the host's own, so what it hands back is checked here, whoever wrote it: a
   * record that does not pass reads as "no remembered unlock", the safe failure.
   */
  const rememberedUnlock = async () => {
    if (bundle === UnreadBundle || bundle === null) { return }
    const kept = await deviceDB.readUnlock(scope)
    if (kept === null) { return }
    const checked = DeviceUnlock.safeParse(kept)
    const fits = checked.success
      && checked.data.vault_id === bundle.vault_id
      && checked.data.passphrase_epoch === bundle.passphrase_epoch
      && checked.data.expires_at > clock.now()
    if (! fits) {
      await deviceDB.eraseUnlock(scope)
      return
    }
    const remembered = checked.data
    try {
      // Nothing on the remembered path ever re-wraps the vaultKey, so no extractable handle
      // exists on it at all.
      vaultKey = await unwrapKeyUnder(
        remembered.local_unlock_key,
        remembered.vault_key_local_wrapped,
        bundleBinding(bundle.vault_id, bundle.passphrase_epoch, 'vault_key_local_wrapped'),
        { extractable: false, usage: ['wrapKey', 'unwrapKey'] },
      )
      // Older records, or a host's own deviceDB, may hold a finite deadline past what a Date can.
      askPassphraseAt = Math.min(remembered.expires_at, FarFuture)
    } catch {
      // A record that no longer opens reads as "no remembered unlock": the safe failure.
      await deviceDB.eraseUnlock(scope)
    }
  }

  /**
   * Refuse a new lockbox while the vault holds its limit. Counted from the snapshot's boxes, which
   * every write and every change pushed from storage refreshes, so a store costs no extra read of
   * the whole vault; a vault that looks full is caught up with storage before it is refused.
   */
  const ensureRoomFor = async (boxlabel: string) => {
    const othersCount = () => boxes.filter((summary) => summary.boxlabel !== boxlabel).length
    if (othersCount() < lockboxLimit) { return }
    await refresh()
    if (othersCount() < lockboxLimit) { return }
    throw new VaultError('vault_full', `This vault already holds its limit of ${String(lockboxLimit)} lockboxes: erase one before storing another. If the vault really is meant to hold more, pass a larger maxLockboxes to openVault.`)
  }

  const readBoxOrThrow = async (boxlabel: string) => {
    const lockbox = await vaultDB.readBox(scope, parseLabel(boxlabel))
    if (lockbox === null) { throw new VaultError('absent_box', `No lockbox is labelled '${boxlabel}' in this vault.`) }
    return lockbox
  }

  /** Unwrap a lockbox's lockboxKey, decipher its whisper, and hand it back validated. */
  const openBox = async (boxlabel: string): Promise<Whisper> => {
    const unlockedKey = ensureUnlocked()
    const lockbox = await readBoxOrThrow(boxlabel)
    const vaultId = currentBundle().vault_id
    let whisperBytes: Uint8Array
    try {
      const lockboxKey = await unwrapKeyUnder(
        unlockedKey,
        lockbox.lockbox_key_wrapped,
        boxBinding(vaultId, lockbox.boxlabel, lockbox.revision_id, 'lockbox_key_wrapped'),
        { extractable: false, usage: ['decrypt'] },
      )
      whisperBytes = await decipherBytes(lockboxKey, lockbox.whisper_ciphered, boxBinding(vaultId, lockbox.boxlabel, lockbox.revision_id, 'whisper_ciphered'))
    } catch {
      throw new VaultError('corrupt_record', 'The lockbox would not open: its stored record failed verification, as if damaged or moved from somewhere else. It was left as it is.')
    }
    const checked = Whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
    if (! checked.success) {
      throw new VaultError('corrupt_record', 'The lockbox opened, but what was inside is not a whisper this package knows. It was left as it is.')
    }
    return checked.data
  }

  const vault: Vault = {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    unlock: async (passphrase) => {
      ensureOpen()
      if (! passphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const shutsThen = shutsSoFar
      // Sync with the backend first: the passphrase proves itself against the bundle as it
      // stands there now, not against a cached one a destroy or recreate may have outdated.
      await refresh()
      const unlocked = shutSince(shutsThen) ? null : await settleUnlock(passphrase)
      const tookUp = unlocked !== null && await takeUpUnlock(unlocked, unlocked.standing, shutsThen)
      bump()
      if (! tookUp) {
        throw new VaultError('vault_locked', 'The vault was locked (or destroyed) while this unlock was under way, and that wins: nothing was unlocked, and this device remembers nothing. Unlock again if that was not meant.')
      }
    },

    lock: async () => {
      ensureOpen()
      await shut()
      bump()
    },

    changePassphrase: async (oldPassphrase, newPassphrase) => {
      ensureOpen()
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const shutsThen = shutsSoFar
      // The old passphrase proves itself against the bundle as the backend holds it now: a
      // cached bundle could bury one written elsewhere under a different vault_id entirely.
      await refresh()
      const standing = currentBundle()
      const proven = await unwrapWithPassphrase(standing, oldPassphrase)
      const saltBytes = randomBytes(keyDeriver.salt_bytes)
      const epoch = standing.passphrase_epoch + 1
      const passphraseKey = await importWrappingKeyBytes(await keyDeriver.deriveKeyBytes(newPassphrase, saltBytes))
      const next: VaultBundle = {
        ...standing,
        passphrase_epoch:    epoch,
        passphrase_salt_b64: toB64(saltBytes),
        vault_key_passphrase_wrapped: await wrapKeyUnder(passphraseKey, proven.transientKey, bundleBinding(standing.vault_id, epoch, 'vault_key_passphrase_wrapped')),
        updated_at:          new Date(clock.now()).toISOString(),
      }
      await refreshOnStale(vaultDB.updateBundle(next, { vault_id: standing.vault_id, passphrase_epoch: standing.passphrase_epoch }))
      bundle = next
      // The change has landed, whatever happens now: a shut meanwhile leaves only its unlock untaken.
      await takeUpUnlock(proven, next, shutsThen)
      bump()
    },

    store: async (boxlabel, whisper, storeOpts) => {
      ensureUnlocked()
      const label = parseLabel(boxlabel)
      const givenNote = parseNote(storeOpts?.note)
      const checked = Whisper.safeParse(whisper)
      // The refusal never quotes its input: a whisper stays out of error messages.
      if (! checked.success) {
        throw new VaultError('bad_whisper', 'A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a lockbox, erase it. (null inside an array or object is fine.)')
      }
      const whisperBytes = new TextEncoder().encode(stableJsonify(checked.data))
      if (whisperBytes.length > whisperByteLimit) {
        throw new VaultError('whisper_too_large', `That whisper is over this vault's limit of ${String(whisperByteLimit)} bytes of JSON: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to openVault.`)
      }
      // Each attempt reads the box afresh and seals the whisper anew, under a lockboxKey and a
      // revision of its own; only the write that follows is ever repeated.
      let boxStood = false
      const outcome = await retryStale(async () => {
        // A refusal as stale has just caught this device up with storage, which may have relocked
        // it (a vault reborn, or its passphrase changed, elsewhere): then the retry ends here.
        ensureUnlocked()
        const prev = await vaultDB.readBox(scope, label)
        // Erase wins: a box this store began over, and now finds gone, was erased elsewhere, and
        // a retry would silently undo that. The erase is already in the snapshot.
        if (prev === null && boxStood) { return 'erased' }
        boxStood ||= prev !== null
        if (prev === null) { await ensureRoomFor(label) }
        // The key and the vault it belongs to, taken together after the last look at storage.
        const unlockedKey = ensureUnlocked()
        const vaultId = currentBundle().vault_id
        const revisionId = randomId()
        const lockboxKey = await makeLockboxKey()
        const now = new Date(clock.now()).toISOString()
        // Lands only in the vault this whisper is sealed for, over the revision just read: a vault
        // reborn elsewhere, or a box written meanwhile by another device, refuses it.
        const expected = { vault_id: vaultId, revision_id: prev?.revision_id ?? null }
        const note = noteToStore(givenNote, prev)
        const lockbox: Lockbox = {
          format:              'safebyok-lockbox-v1',
          boxlabel:            label,
          revision_id:         revisionId,
          lockbox_key_wrapped: await wrapKeyUnder(unlockedKey, lockboxKey, boxBinding(vaultId, label, revisionId, 'lockbox_key_wrapped')),
          whisper_ciphered:    await cipherBytes(lockboxKey, whisperBytes, boxBinding(vaultId, label, revisionId, 'whisper_ciphered')),
          // A box with no note is stored with no note field: never a null or undefined one.
          ...(note !== null && { note }),
          created_at:          prev?.created_at ?? now,
          updated_at:          now,
        }
        await refreshOnStale(vaultDB.updateBox(scope, lockbox, expected))
        return 'written'
      })
      if (outcome === 'erased') {
        throw new VaultError('stale_write', 'That lockbox was erased on another device while this one was storing into it, so nothing was written: an erase wins. Store it again if it should exist after all.')
      }
      await refresh()
    },

    read: async (boxlabel) => await openBox(boxlabel),

    use: async (boxlabel, callback) => {
      const whisper = await openBox(boxlabel)
      return await callback(whisper)
    },

    erase: async (boxlabel) => {
      ensureUnlocked()
      const label = parseLabel(boxlabel)
      await readBoxOrThrow(label)
      ensureUnlocked()
      // Lands only in the vault this device holds keys for, whatever revision of the box stands:
      // a vault destroyed and made anew elsewhere refuses it. That is its only expectation, and
      // trying again could not change it: a stale erase is thrown at once, never retried.
      await refreshOnStale(vaultDB.eraseBox(scope, label, { vault_id: currentBundle().vault_id }))
      await refresh()
    },

    destroy: async () => {
      ensureOpen()
      // Only the vault this handle had read when called: one destroyed and made anew since
      // refuses, even if a background refresh brings it in while this awaits.
      const doomed = bundle
      await shut()
      if (doomed !== null && doomed !== UnreadBundle) {
        await refreshOnStale(vaultDB.eraseVault(scope, { vault_id: doomed.vault_id }))
      }
      await refresh()
    },

    close: () => {
      closed = true
      unsubscribeDB()
      listeners.clear()
    },
  }

  /**
   * `write`, with a refusal as stale catching this device up with storage before it is thrown:
   * the snapshot then shows what beat the write, and a reborn vault relocks this device.
   */
  const refreshOnStale = async (write: Promise<void>): Promise<void> => {
    try {
      await write
    } catch (err) {
      if (isVaultError(err, 'stale_write')) { await quietRefresh() }
      throw err
    }
  }

  // Watch the backend so lockboxes written elsewhere (another tab, the inspector's reset button)
  // show up without a manual refresh. A failing background refresh has nobody to throw to, so it
  // leaves the snapshot standing; the next foreground operation surfaces the trouble itself.
  const quietRefresh = async () => {
    try {
      await refresh()
    } catch {
      // nobody to throw to: see above
    }
  }
  const unsubscribeDB = vaultDB.subscribe(scope, () => { void quietRefresh() })

  await refresh()
  await rememberedUnlock()
  bump()
  return vault
}

/**
 * How many times `store()` tries its versioned write before it lets a `stale_write` through: this
 * many attempts in all, the first one included, so three means one try and two retries. Small,
 * because a box that three reads in a row find changed again is being written in earnest by
 * someone else, and the caller should hear of it.
 */
const MaxWriteAttempts = 3

/**
 * Run `attempt`, and run it again when storage refuses it as stale, up to `attemptsLeft` attempts
 * in all; any other refusal, and the last stale one, is thrown as it came. The attempt must do its
 * own reading, for each try to be made from what storage holds now.
 */
const retryStale = async <ResultT>(attempt: () => Promise<ResultT>, attemptsLeft = MaxWriteAttempts): Promise<ResultT> => {
  try {
    return await attempt()
  } catch (err) {
    if (attemptsLeft <= 1 || ! isVaultError(err, 'stale_write')) { throw err }
    return await retryStale(attempt, attemptsLeft - 1)
  }
}

/** A note as `store()` is handed one: some text, null for none, or undefined to keep the note standing. */
const noteOption = LockboxNote.nullable().optional()

const parseNote = (candidate: string | null | undefined): string | null | undefined => {
  const checked = noteOption.safeParse(candidate)
  // The refusal never quotes its input: a note is public, but a mistaken one may not be.
  if (! checked.success) {
    throw new VaultError('bad_option', "A lockbox's note is text of at most 256 characters, or null for none. It is shown while the vault is locked: never put secret material in it.")
  }
  return checked.data
}

/** The note a store writes: the one given, or -- given none -- the one `prev` stands with; null for none. */
const noteToStore = (given: string | null | undefined, prev: Lockbox | null): string | null => (
  given === undefined ? prev?.note ?? null : given
)

const parseLabel = (candidate: string): string => {
  const checked = Label.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A label is 2-40 lowercase letters and digits, words joined by single underscores, starting with a letter.')
  }
  return checked.data
}

/**
 * The share of an adapter's limits a vault's whispers may claim: of its maxRecordBytes, one
 * whisper; of its maxVaultBytes, every lockbox at its largest. Stored, a whisper's ciphertext is
 * base64, a third larger than the whisper; the records' other fields, and each backend's own way
 * of counting bytes, need the rest.
 */
const WhisperShareOfStorage = 0.5

/**
 * Room for a lockbox's fields besides its whisper -- its boxlabel, note, wrapped lockboxKey,
 * revision and timestamps, and the scope a backend files it under -- counted as whisper bytes
 * are, against {@link WhisperShareOfStorage}. A vault of many small whispers is mostly these.
 */
const LockboxFieldsBytes = 1024

const maxWhisperBytes = Z.number().int().positive().default(MaxWhisperBytes)
const maxLockboxes = Z.number().int().positive().default(MaxLockboxes)
/** A limit as an adapter declares one: some bytes, or none at all. */
const declaredBytes = Z.union([Z.number().positive(), Z.literal(Infinity)])

const MsPerHour = 60 * 60 * 1000

/** Hours, as the host thinks of them, to whole milliseconds, as every time inside is kept. */
const forcePassphraseReentryHours = Z.union([Z.number().positive(), Z.literal(Infinity)]).default(ForcePassphraseReentryHours)
  .transform((hours) => Math.round(hours * MsPerHour))
  .pipe(Z.union([Z.number().min(1), Z.literal(Infinity)]))

/** The deadline for a passphrase entered at `nowMs`: `reentryMs` later, but never past what a Date holds. */
const deadlineAfter = (nowMs: number, reentryMs: number): number => Math.min(nowMs + reentryMs, FarFuture)

const parseForcePassphraseReentryHours = (candidate: number | undefined): number => {
  const checked = forcePassphraseReentryHours.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'forcePassphraseReentryHours is a number of hours greater than zero; fractions are fine (0.25 is fifteen minutes), and Infinity means never.')
  }
  return checked.data
}

const parseMaxWhisperBytes = (candidate: number | undefined): number => {
  const checked = maxWhisperBytes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxWhisperBytes is a whole number of bytes, greater than zero.')
  }
  return checked.data
}

const parseMaxLockboxes = (candidate: number | undefined): number => {
  const checked = maxLockboxes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxLockboxes is a whole number of lockboxes, greater than zero.')
  }
  return checked.data
}

/** What a KeyDeriver must carry. Checked only: openVault keeps the deriver it was handed, prototype and all. */
const keyDeriverShape = Z.object({
  key_deriver_label: Z.string().min(1),
  salt_bytes:        Z.number().int().positive(),
  deriveKeyBytes:    Z.custom<KeyDeriver['deriveKeyBytes']>((candidate) => typeof candidate === 'function'),
})

const parseKeyDeriver = (candidate: KeyDeriver | undefined): KeyDeriver => {
  if (candidate === undefined) {
    throw new VaultError('bad_option', "openVault needs a keyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into its options.")
  }
  if (! keyDeriverShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'keyDeriver is not a KeyDeriver: it needs a key_deriver_label, a salt_bytes and a deriveKeyBytes function.')
  }
  return candidate
}

/**
 * Refuse limits the storage adapter might not honour: a whisper too large for one of its records,
 * or a vault too large for it to hold, list and erase whole.
 */
const ensureLimitsFit = (vaultDB: VaultDB, whisperByteLimit: number, lockboxLimit: number) => {
  // An adapter that declares no limit, or one written before a limit existed, is refused: never guessed.
  for (const limitname of ['maxRecordBytes', 'maxVaultBytes'] as const) {
    if (! declaredBytes.safeParse(vaultDB[limitname]).success) {
      throw new VaultError('bad_option', `This storage adapter does not declare ${limitname}, a limit every adapter states: update the adapter, or ask its author to.`)
    }
  }
  if (whisperByteLimit > vaultDB.maxRecordBytes * WhisperShareOfStorage) {
    throw new VaultError('bad_option', `maxWhisperBytes is over half of the ${String(vaultDB.maxRecordBytes)} bytes this storage adapter holds in one record, so a whisper that large might not store: pass a smaller maxWhisperBytes.`)
  }
  const vaultBudget = vaultDB.maxVaultBytes * WhisperShareOfStorage
  const lockboxBytes = whisperByteLimit + LockboxFieldsBytes
  if (lockboxLimit * lockboxBytes <= vaultBudget) { return }
  const fitting = Math.floor(vaultBudget / lockboxBytes)
  const outcome = fitting === 0
    ? 'At that maxWhisperBytes, not even one lockbox fits: pass a smaller maxWhisperBytes.'
    : `At that maxWhisperBytes, at most ${String(fitting)} lockboxes fit: pass a smaller maxLockboxes or maxWhisperBytes.`
  throw new VaultError('bad_option', `${String(lockboxLimit)} lockboxes (maxLockboxes) of up to ${String(whisperByteLimit)} bytes of whisper each (maxWhisperBytes) might not fit in the ${String(vaultDB.maxVaultBytes)} bytes this storage adapter holds of one vault (its maxVaultBytes), with room for each lockbox's other fields. ${outcome}`)
}

/** JSON text parsed, or null on text that is not JSON -- which Whisper's validator then refuses. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
