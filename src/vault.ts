import { Label, LockboxSummary, SevenDaysMs, VaultBundle, Whisper, wallClock, type Clock, type VaultScope } from './types'
import { VaultError } from './errors'
import { stableJsonify } from './stable-jsonify'
import type { DeviceDB } from './device-db'
import type { VaultDB } from './vault-db'

/**
 * Where the vault stands, as the UI branches on it:
 *  * `opening`  -- still reading the bundle and device cache; show nothing yet
 *  * `absent`   -- never initialized; the first unlock() will choose its passphrase
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
   * A wrong passphrase throws kind 'wrong_passphrase' and changes nothing.
   */
  unlock(passphrase: string): Promise<void>
  /** Forget the unlock, in memory and on this device: back to `locked`. */
  lock(): Promise<void>

  /** Write a whisper into the lockbox `boxlabel`, creating or replacing it. Requires unlocked. */
  store(boxlabel: string, whisper: Whisper, opts?: { note?: string }): Promise<void>
  /** The whisper in `boxlabel`. Requires unlocked; kind 'absent_box' when there is none. */
  read(boxlabel: string): Promise<Whisper>
  /**
   * Hand the whisper to `callback` and return its result: the shape that discourages parking a
   * secret in state. Requires unlocked.
   *
   * @example await vault.use('ANTHROPIC_API_KEY', (whisper) => callAnthropic(whisper))
   */
  use<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT>
  /** Remove the lockbox `boxlabel` entirely. Requires unlocked; kind 'absent_box' when absent. */
  erase(boxlabel: string): Promise<void>

  /**
   * Delete the vault's every stored record, remote and device-local: the vault half of deleting
   * an account. Deliberately does NOT require unlock -- an authenticated owner can always delete
   * their own rows server-side, and pretending otherwise would be false comfort.
   */
  destroy(): Promise<void>
  /** Release subscriptions and refuse further calls. Forgets nothing stored. */
  close(): void
}

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

  let bundle: VaultBundle | null = null
  let boxes: readonly LockboxSummary[] = []
  let expiresAt: number | null = null
  let closed = false
  let snapshot: VaultSnapshot = { state: 'opening', scope, boxes, expiresAt }

  const listeners = new Set<() => void>()
  const vaultState = (): VaultState => {
    if (bundle === null) { return 'absent' }
    if (expiresAt !== null && expiresAt > clock.now()) { return 'unlocked' }
    return 'locked'
  }
  // The snapshot keeps its identity until something really changed: useSyncExternalStore's
  // contract, and what spares React a render when a background refresh found nothing new.
  const bump = () => {
    const state = vaultState()
    const next: VaultSnapshot = { state, scope, boxes, expiresAt: state === 'unlocked' ? expiresAt : null }
    if (stableJsonify(next) === stableJsonify(snapshot)) { return }
    snapshot = next
    listeners.forEach((listener) => { listener() })
  }

  const refresh = async () => {
    bundle = await vaultDB.readBundle(scope)
    boxes = await vaultDB.listBoxes(scope)
    bump()
  }

  // Secret-touching operations call this first. Expiry is checked at use, not on a timer: a
  // snapshot may briefly say 'unlocked' past the deadline, but no whisper comes out past it.
  const ensureOpen = () => {
    if (closed) { throw new VaultError('vault_closed', 'This vault handle was closed: open the vault again.') }
  }
  const ensureUnlocked = () => {
    ensureOpen()
    if (expiresAt !== null && expiresAt > clock.now()) { return }
    expiresAt = null
    bump()
    throw new VaultError('vault_locked', 'The vault is locked: ask the user for their passphrase and call unlock().')
  }

  const readBoxOrThrow = async (boxlabel: string) => {
    const lockbox = await vaultDB.readBox(scope, parseLabel(boxlabel))
    if (lockbox === null) { throw new VaultError('absent_box', `No lockbox is labelled '${boxlabel}' in this vault.`) }
    return lockbox
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
      if (bundle === null) {
        bundle = {
          format:          'byok-stub-vault-v0',
          ...scope,
          stub_passphrase: passphrase,
          created_at:      new Date(clock.now()).toISOString(),
        }
        await vaultDB.writeBundle(bundle)
      } else if (bundle.stub_passphrase !== passphrase) {
        // The real package learns this from an AEAD unwrap failure, never from a comparison.
        throw new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again.")
      }
      expiresAt = clock.now() + rememberForMs
      await deviceDB.writeUnlock({ format: 'byok-stub-unlock-v0', ...scope, expires_at: expiresAt })
      bump()
    },

    lock: async () => {
      ensureOpen()
      expiresAt = null
      await deviceDB.eraseUnlock(scope)
      bump()
    },

    store: async (boxlabel, whisper, storeOpts) => {
      ensureUnlocked()
      const label = parseLabel(boxlabel)
      const checked = Whisper.safeParse(whisper)
      // The refusal never quotes its input: a whisper stays out of error messages.
      if (! checked.success) {
        throw new VaultError('bad_whisper', 'A whisper must be a JSON value: a string, number, boolean, null, array, or plain object.')
      }
      const now = new Date(clock.now()).toISOString()
      const prev = await vaultDB.readBox(scope, label)
      await vaultDB.writeBox(scope, {
        boxlabel:   label,
        whisper:    checked.data,
        note:       storeOpts?.note ?? prev?.note,
        created_at: prev?.created_at ?? now,
        updated_at: now,
      })
      await refresh()
    },

    read: async (boxlabel) => {
      ensureUnlocked()
      const { whisper } = await readBoxOrThrow(boxlabel)
      return whisper
    },

    use: async (boxlabel, callback) => {
      ensureUnlocked()
      const { whisper } = await readBoxOrThrow(boxlabel)
      return await callback(whisper)
    },

    erase: async (boxlabel) => {
      ensureUnlocked()
      await readBoxOrThrow(boxlabel)
      await vaultDB.eraseBox(scope, parseLabel(boxlabel))
      await refresh()
    },

    destroy: async () => {
      ensureOpen()
      expiresAt = null
      await deviceDB.eraseUnlock(scope)
      await vaultDB.eraseVault(scope)
      await refresh()
    },

    close: () => {
      closed = true
      unsubscribeDB()
      listeners.clear()
    },
  }

  // Watch the backend so lockboxes written elsewhere (another tab, the inspector's reset button)
  // show up without a manual refresh.
  const unsubscribeDB = vaultDB.subscribe(scope, () => { void refresh() })

  const remembered = await deviceDB.readUnlock(scope)
  if (remembered !== null && remembered.expires_at > clock.now()) { expiresAt = remembered.expires_at }
  await refresh()
  return vault
}

const parseLabel = (candidate: string): string => {
  const checked = Label.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A label is 2-40 lowercase letters and digits, words joined by single underscores, starting with a letter.')
  }
  return checked.data
}
