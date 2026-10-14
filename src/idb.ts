import { createStore, del, entries, get, keys, set, clear, type UseStore } from 'idb-keyval'
import { DeviceUnlock, Lockbox, VaultBundle, type VaultScope } from './types'
import { VaultDB } from './vault-db'
import type { DeviceDB } from './device-db'

/**
 * The browser adapters, over IndexedDB (through `idb-keyval`): a vault that lives entirely on
 * this device. `idbDeviceDB` is the real thing -- device storage is exactly what IndexedDB is,
 * and the only browser storage that can hold a non-extractable localUnlockKey. `idbVaultDB` is
 * the no-backend tier: everything a synced backend would hold, kept on this device instead, so a
 * purely client-side app still gets its whispers encrypted at rest.
 *
 * Browser storage is best-effort: the browser may evict it under pressure, and "clear site data"
 * removes it. An app leaning on `idbVaultDB` should call `navigator.storage.persist()` and say
 * plainly that the vault lives only in this browser.
 *
 * This entry point touches IndexedDB only when an adapter is used, so importing it is safe
 * anywhere; the adapters themselves need a browser (or anything else with `indexedDB`).
 */

export type IdbOpts = {
  /** The IndexedDB database to keep records in. Default 'byok'. */
  dbName?: string
}

/** Which of the two byok shelves an IndexedDB database holds records on. */
export type IdbShelf = 'vault_db' | 'device_db'

// One UseStore per (dbName, shelf), shared by adapters and inspectors alike: idb-keyval opens
// the underlying database lazily, so making these is free until something reads or writes.
const shelfStores = new Map<string, UseStore>()
const shelfStore = (dbName: string, shelf: IdbShelf): UseStore => {
  const ckey = `${dbName}:${shelf}`
  const kept = shelfStores.get(ckey)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:${shelf}`, 'records')
  shelfStores.set(ckey, fresh)
  return fresh
}

// Change bells, one per (dbName, shelf): local listeners hear this tab's writes directly, and a
// BroadcastChannel carries them to other tabs (the channel never echoes to its own sender).
const bells = new Map<string, Set<() => void>>()
const channels = new Map<string, BroadcastChannel>()
const bellCkey = (dbName: string, shelf: IdbShelf) => `byok-idb:${dbName}:${shelf}`

const ringBell = (dbName: string, shelf: IdbShelf) => {
  const ckey = bellCkey(dbName, shelf)
  bells.get(ckey)?.forEach((listener) => { listener() })
  channels.get(ckey)?.postMessage('changed')
}

const onBell = (dbName: string, shelf: IdbShelf, listener: () => void): (() => void) => {
  const ckey = bellCkey(dbName, shelf)
  let ringers = bells.get(ckey)
  if (ringers === undefined) {
    ringers = new Set()
    bells.set(ckey, ringers)
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(ckey)
      channel.addEventListener('message', () => { bells.get(ckey)?.forEach((ring) => { ring() }) })
      channels.set(ckey, channel)
    }
  }
  ringers.add(listener)
  return () => { ringers.delete(listener) }
}

const scopePath = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`
const bundleCkey = (scope: VaultScope) => `vault:${scopePath(scope)}`
const boxCkey = (scope: VaultScope, boxlabel: string) => `box:${scopePath(scope)}:${boxlabel}`
const boxPrefix = (scope: VaultScope) => `box:${scopePath(scope)}:`
const unlockCkey = (scope: VaultScope) => `unlock:${scopePath(scope)}`

/**
 * VaultDB over this browser's IndexedDB: the local-only tier. Nothing syncs -- this "backend"
 * never leaves the device -- but every secret field is ciphertext all the same, and the stored
 * rows are exactly what a real backend would hold.
 *
 * @example
 *   const vaultDB = idbVaultDB({ dbName: 'my_app' })
 *   const vault = await openVault({ applabel: 'my_app', userId, vaultlabel: 'main', vaultDB, deviceDB: idbDeviceDB({ dbName: 'my_app' }) })
 */
export const idbVaultDB = (opts: IdbOpts = {}): VaultDB => new IdbVaultDB(opts.dbName ?? 'byok')

class IdbVaultDB extends VaultDB {
  constructor(private readonly dbName: string) { super() }
  private shelf() { return shelfStore(this.dbName, 'vault_db') }
  private ring() { ringBell(this.dbName, 'vault_db') }

  protected async fetchBundle(scope: VaultScope): Promise<unknown> {
    return (await get(bundleCkey(scope), this.shelf())) ?? null
  }

  protected async saveBundle(bundle: VaultBundle): Promise<void> {
    await set(bundleCkey(bundle), bundle, this.shelf())
    this.ring()
  }

  protected async trashBundle(scope: VaultScope): Promise<void> {
    await del(bundleCkey(scope), this.shelf())
    this.ring()
  }

  protected async fetchBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return (await get(boxCkey(scope, boxlabel), this.shelf())) ?? null
  }

  protected async saveBox(scope: VaultScope, lockbox: Lockbox): Promise<void> {
    await set(boxCkey(scope, lockbox.boxlabel), lockbox, this.shelf())
    this.ring()
  }

  protected async trashBox(scope: VaultScope, boxlabel: string): Promise<void> {
    await del(boxCkey(scope, boxlabel), this.shelf())
    this.ring()
  }

  protected async fetchBoxes(scope: VaultScope): Promise<unknown[]> {
    const rows = await entries(this.shelf())
    return rows
      .filter(([ckey]) => typeof ckey === 'string' && ckey.startsWith(boxPrefix(scope)))
      .map(([, row]) => row as unknown)
  }

  // Rings on every write to the shelf, not only ones in scope: a spurious refresh is harmless,
  // and cross-tab news arrives over the BroadcastChannel for free.
  override subscribe(_scope: VaultScope, onChange: () => void): () => void {
    return onBell(this.dbName, 'vault_db', onChange)
  }
}

/**
 * DeviceDB over this browser's IndexedDB: the real device storage. IndexedDB keeps the
 * DeviceUnlock record by structured clone, which is the only way a browser persists the
 * non-extractable localUnlockKey -- as a handle, never as bytes.
 *
 * A record that will not read back (damaged, or written by another version) reads as "no
 * remembered unlock" and is dropped: losing the convenience is the safe failure.
 *
 * @example
 *   const deviceDB = idbDeviceDB()
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const idbDeviceDB = (opts: IdbOpts = {}): DeviceDB => {
  const dbName = opts.dbName ?? 'byok'
  const shelf = () => shelfStore(dbName, 'device_db')
  const ring = () => { ringBell(dbName, 'device_db') }

  return {
    readUnlock: async (scope) => {
      const raw: unknown = await get(unlockCkey(scope), shelf())
      if (raw === undefined || raw === null) { return null }
      const checked = DeviceUnlock.safeParse(raw)
      if (! checked.success) {
        await del(unlockCkey(scope), shelf())
        ring()
        return null
      }
      return checked.data
    },

    writeUnlock: async (unlock) => {
      await set(unlockCkey(unlock), unlock, shelf())
      ring()
    },

    eraseUnlock: async (scope) => {
      await del(unlockCkey(scope), shelf())
      ring()
    },

    eraseAll: async () => {
      const ckeys = await keys(shelf())
      for (const ckey of ckeys) {
        if (typeof ckey === 'string' && ckey.startsWith('unlock:')) { await del(ckey, shelf()) }
      }
      ring()
    },
  }
}

/** One stored row, as {@link inspectIdb} reports it: its ckey and the raw stored value. */
export type IdbRow = { ckey: string, row: unknown }

/**
 * A window onto one byok shelf in IndexedDB, for inspectors and debug panels: the raw rows, a
 * change bell, and a wipe. This is how the demo shows "what the backend sees" without asking the
 * vault's opinion -- what it reports is what is actually stored.
 *
 * @example
 *   const inspector = inspectIdb({ shelf: 'vault_db' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdb = (opts: IdbOpts & { shelf: IdbShelf }) => {
  const dbName = opts.dbName ?? 'byok'
  return {
    /** Every stored row on the shelf, sorted by ckey. */
    rows: async (): Promise<IdbRow[]> => {
      const stored = await entries(shelfStore(dbName, opts.shelf))
      return stored
        .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string')
        .map(([ckey, row]) => ({ ckey, row }))
        .toSorted((one, two) => one.ckey.localeCompare(two.ckey))
    },
    /** Calls `listener` after any write to the shelf, this tab or another; returns the unsubscribe. */
    subscribe: (listener: () => void): (() => void) => onBell(dbName, opts.shelf, listener),
    /** Remove every row on the shelf. */
    wipe: async (): Promise<void> => {
      await clear(shelfStore(dbName, opts.shelf))
      ringBell(dbName, opts.shelf)
    },
  }
}
