import * as Z from 'zod'
import { Label, LockboxSummary, type Lockbox, MaxWhisperBytes, SevenDaysMs, VaultBundle, Whisper, wallClock, type Clock, type VaultScope } from './types'
import { VaultError, isVaultError } from './errors'
import { argon2idWebV1Deriver, type KeyDeriver } from './key-deriver'
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
 *  * `unlocked` -- whispers readable until expiresAt or lock()
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
  /** Epoch ms when the current unlock lapses, while unlocked; null otherwise. */
  expiresAt: number | null
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
  /** How long an unlock is remembered on this device. Default: seven days. */
  rememberForMs?: number
  /** Time source for expiry; tests inject one. Default: the wall clock. */
  clock?: Clock
  /**
   * What turns a passphrase into passphraseKey bytes. Default -- and the right answer -- is the
   * pinned Argon2id deriver; see {@link KeyDeriver} for the narrow reasons to substitute.
   */
  keyDeriver?: KeyDeriver
  /**
   * The largest whisper `store()` accepts, in bytes of its JSON. Default: {@link MaxWhisperBytes},
   * 40444. Checked on write only, so lowering it never strands a whisper already stored. At most
   * half the vaultDB's `maxRecordBytes`: openVault refuses more with kind 'bad_option'.
   */
  maxWhisperBytes?: number
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
  getSnapshot(): VaultSnapshot
  /** Calls `listener` after every snapshot change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void

  /**
   * Open the vault with its passphrase, remembering the unlock on this device for
   * `rememberForMs`. On an `absent` vault this first unlock creates it, with this passphrase.
   * A wrong passphrase throws kind 'wrong_passphrase' and changes nothing -- learned from the
   * vaultKey envelope refusing to decrypt, never from a comparison.
   */
  unlock(passphrase: string): Promise<void>
  /** Forget the unlock, in memory and on this device: back to `locked`. */
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
   */
  changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void>

  /**
   * Write a whisper into the lockbox `boxlabel`, creating or replacing it. Requires unlocked;
   * kind 'whisper_too_large' when its JSON is over the vault's `maxWhisperBytes`.
   *
   * The write lands only if storage still holds what this device last read: the same vault, and
   * the same revision of this lockbox (or still none). Otherwise nothing is written and the call
   * throws kind 'stale_write', after catching up with storage: another device's write to the box
   * now shows in the snapshot, and a vault destroyed or made anew elsewhere relocks this device
   * -- a stale session never writes into a vault reborn under new keys. Retrying a stale write
   * replaces what the other device wrote.
   */
  store(boxlabel: string, whisper: Whisper, opts?: { note?: string }): Promise<void>
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
 *   const vault = await openVault({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, deviceDB })
 *   vault.getSnapshot().state  // 'absent' | 'locked' | 'unlocked'
 */
export const openVault = async (opts: OpenVaultOpts): Promise<Vault> => {
  const applabel   = parseLabel(opts.applabel)
  const vaultlabel = parseLabel(opts.vaultlabel)
  if (! opts.userId) { throw new VaultError('bad_label', 'A vault needs the signed-in user: pass the userId from your auth layer.') }
  const scope: VaultScope = { applabel, user_id: opts.userId, vaultlabel }
  const { vaultDB, deviceDB } = opts
  const rememberForMs = opts.rememberForMs ?? SevenDaysMs
  const clock = opts.clock ?? wallClock
  const keyDeriver = opts.keyDeriver ?? argon2idWebV1Deriver
  const whisperByteLimit = parseMaxWhisperBytes(opts.maxWhisperBytes)
  if (whisperByteLimit > vaultDB.maxRecordBytes * WhisperShareOfRecord) {
    throw new VaultError('bad_option', `maxWhisperBytes is over half of the ${String(vaultDB.maxRecordBytes)} bytes this storage adapter holds in one record, so a whisper that large might not store: pass a smaller maxWhisperBytes.`)
  }

  let bundle: VaultBundle | null | typeof UnreadBundle = UnreadBundle
  let boxes: readonly LockboxSummary[] = []
  let expiresAt: number | null = null
  let vaultKey: CryptoKey | null = null
  let closed = false

  const listeners = new Set<() => void>()
  const vaultState = (): VaultState => {
    if (bundle === UnreadBundle) { return 'opening' }
    if (bundle === null) { return 'absent' }
    if (vaultKey !== null && expiresAt !== null && expiresAt > clock.now()) { return 'unlocked' }
    return 'locked'
  }
  let snapshot: VaultSnapshot = { state: vaultState(), scope, boxes, expiresAt }
  // The snapshot keeps its identity until something really changed: useSyncExternalStore's
  // contract, and what spares React a render when a background refresh found nothing new.
  const bump = () => {
    const state = vaultState()
    const next: VaultSnapshot = { state, scope, boxes, expiresAt: state === 'unlocked' ? expiresAt : null }
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
      expiresAt = null
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
    if (vaultKey !== null && expiresAt !== null && expiresAt > clock.now()) { return vaultKey }
    vaultKey = null
    expiresAt = null
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

  /** The vaultKey for an unlock: creating the vault when absent, proving the passphrase when not. */
  const settleUnlock = async (passphrase: string): Promise<VaultKeyPair> => {
    if (bundle === null || bundle === UnreadBundle) {
      const { draft, transientKey, sessionKey } = await draftBundle(passphrase)
      const settled = await vaultDB.createBundle(draft)
      bundle = settled
      if (settled.vault_id === draft.vault_id) { return { transientKey, sessionKey } }
      // Another device created the vault between our look and our write: the settled bundle is
      // theirs, and this passphrase must prove itself against it like any other.
      return await unwrapWithPassphrase(settled, passphrase)
    }
    return await unwrapWithPassphrase(bundle, passphrase)
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

  /** Pick up a remembered unlock, if this device holds one that still fits and still opens. */
  const rememberedUnlock = async () => {
    if (bundle === UnreadBundle || bundle === null) { return }
    const remembered = await deviceDB.readUnlock(scope)
    if (remembered === null) { return }
    const fits = remembered.vault_id === bundle.vault_id
      && remembered.passphrase_epoch === bundle.passphrase_epoch
      && remembered.expires_at > clock.now()
    if (! fits) {
      await deviceDB.eraseUnlock(scope)
      return
    }
    try {
      // Nothing on the remembered path ever re-wraps the vaultKey, so no extractable handle
      // exists on it at all.
      vaultKey = await unwrapKeyUnder(
        remembered.local_unlock_key,
        remembered.vault_key_local_wrapped,
        bundleBinding(bundle.vault_id, bundle.passphrase_epoch, 'vault_key_local_wrapped'),
        { extractable: false, usage: ['wrapKey', 'unwrapKey'] },
      )
      expiresAt = remembered.expires_at
    } catch {
      // A record that no longer opens reads as "no remembered unlock": the safe failure.
      await deviceDB.eraseUnlock(scope)
    }
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
      // Sync with the backend first: the passphrase proves itself against the bundle as it
      // stands there now, not against a cached one a destroy or recreate may have outdated.
      await refresh()
      const unlocked = await settleUnlock(passphrase)
      expiresAt = clock.now() + rememberForMs
      // The transient's last act: wrapped into this device's remembered unlock, then dropped.
      await rememberDevice(unlocked.transientKey, currentBundle(), expiresAt)
      vaultKey = unlocked.sessionKey
      bump()
    },

    lock: async () => {
      ensureOpen()
      vaultKey = null
      expiresAt = null
      await deviceDB.eraseUnlock(scope)
      bump()
    },

    changePassphrase: async (oldPassphrase, newPassphrase) => {
      ensureOpen()
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
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
      expiresAt = clock.now() + rememberForMs
      await rememberDevice(proven.transientKey, next, expiresAt)
      vaultKey = proven.sessionKey
      bump()
    },

    store: async (boxlabel, whisper, storeOpts) => {
      ensureUnlocked()
      const label = parseLabel(boxlabel)
      const checked = Whisper.safeParse(whisper)
      // The refusal never quotes its input: a whisper stays out of error messages.
      if (! checked.success) {
        throw new VaultError('bad_whisper', 'A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a lockbox, erase it. (null inside an array or object is fine.)')
      }
      const whisperBytes = new TextEncoder().encode(stableJsonify(checked.data))
      if (whisperBytes.length > whisperByteLimit) {
        throw new VaultError('whisper_too_large', `That whisper is over this vault's limit of ${String(whisperByteLimit)} bytes of JSON: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to openVault.`)
      }
      const prev = await vaultDB.readBox(scope, label)
      // The key and the vault it belongs to, taken together after the last look at storage.
      const unlockedKey = ensureUnlocked()
      const vaultId = currentBundle().vault_id
      const revisionId = randomId()
      const lockboxKey = await makeLockboxKey()
      const now = new Date(clock.now()).toISOString()
      // Lands only in the vault this whisper is sealed for, over the revision just read: a vault
      // reborn elsewhere, or a box written meanwhile by another device, refuses it.
      const expected = { vault_id: vaultId, revision_id: prev?.revision_id ?? null }
      const lockbox: Lockbox = {
        format:              'safebyok-lockbox-v1',
        boxlabel:            label,
        revision_id:         revisionId,
        lockbox_key_wrapped: await wrapKeyUnder(unlockedKey, lockboxKey, boxBinding(vaultId, label, revisionId, 'lockbox_key_wrapped')),
        whisper_ciphered:    await cipherBytes(lockboxKey, whisperBytes, boxBinding(vaultId, label, revisionId, 'whisper_ciphered')),
        note:                storeOpts?.note ?? prev?.note,
        created_at:          prev?.created_at ?? now,
        updated_at:          now,
      }
      await refreshOnStale(vaultDB.updateBox(scope, lockbox, expected))
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
      // a vault destroyed and made anew elsewhere refuses it.
      await refreshOnStale(vaultDB.eraseBox(scope, label, { vault_id: currentBundle().vault_id }))
      await refresh()
    },

    destroy: async () => {
      ensureOpen()
      // Only the vault this handle had read when called: one destroyed and made anew since
      // refuses, even if a background refresh brings it in while this awaits.
      const doomed = bundle
      vaultKey = null
      expiresAt = null
      await deviceDB.eraseUnlock(scope)
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

const parseLabel = (candidate: string): string => {
  const checked = Label.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A label is 2-40 lowercase letters and digits, words joined by single underscores, starting with a letter.')
  }
  return checked.data
}

/**
 * The share of an adapter's maxRecordBytes a whisper may claim. Stored, a whisper's ciphertext is
 * base64, a third larger than the whisper; the record's other fields, and each backend's own way
 * of counting bytes, need the rest.
 */
const WhisperShareOfRecord = 0.5

const maxWhisperBytes = Z.number().int().positive().default(MaxWhisperBytes)

const parseMaxWhisperBytes = (candidate: number | undefined): number => {
  const checked = maxWhisperBytes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxWhisperBytes is a whole number of bytes, greater than zero.')
  }
  return checked.data
}

/** JSON text parsed, or null on text that is not JSON -- which Whisper's validator then refuses. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
