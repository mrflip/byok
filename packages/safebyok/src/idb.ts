import { createStore, del, entries, get, set, clear, type UseStore } from 'idb-keyval'
import { DeviceUnlock } from './types'
import * as Ckeys from './ckeys'
import type { DeviceDB } from './device-db'
import { parseDbName, type IdbOpts } from './idb-opts'
import { VaultError } from './errors'

export type { IdbOpts } from './idb-opts'

/**
 * The device store over this browser's IndexedDB (through `idb-keyval`), as an entry point of its
 * own, `safebyok/idb`: device storage is exactly what IndexedDB is, and the only browser storage
 * that can hold a non-extractable localUnlockKey. Where a vault itself lives is a backend choice,
 * not a fact about the device, so the IndexedDB vault store is a package of its own,
 * `safebyok-indexeddb`.
 *
 * This entry point touches IndexedDB only when the store is used, so importing it is safe
 * anywhere; the store itself needs a browser (or anything else with `indexedDB`).
 */

// One UseStore per dbName, shared by stores and inspectors alike: idb-keyval opens the
// underlying database lazily, so making these is free until something reads or writes.
const shelfStores = new Map<string, UseStore>()
const shelfStore = (dbName: string): UseStore => {
  const kept = shelfStores.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:device_db`, 'records')
  shelfStores.set(dbName, fresh)
  return fresh
}

// Change bells, one per dbName: local listeners hear this tab's writes directly, and a
// BroadcastChannel carries them to other tabs (the channel never echoes to its own sender).
const bells = new Map<string, Set<() => void>>()
const channels = new Map<string, BroadcastChannel>()
const bellCkey = (dbName: string) => `safebyok-idb:${dbName}:device_db`

const ringBell = (dbName: string) => {
  bells.get(dbName)?.forEach((listener) => { listener() })
  channels.get(dbName)?.postMessage('changed')
}

const onBell = (dbName: string, listener: () => void): (() => void) => {
  let ringers = bells.get(dbName)
  if (ringers === undefined) {
    ringers = new Set()
    bells.set(dbName, ringers)
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(bellCkey(dbName))
      channel.addEventListener('message', () => { bells.get(dbName)?.forEach((ring) => { ring() }) })
      channels.set(dbName, channel)
    }
  }
  ringers.add(listener)
  return () => { ringers.delete(listener) }
}

/**
 * DeviceDB over this browser's IndexedDB: the real device storage. IndexedDB keeps the
 * DeviceUnlock record by structured clone, which is the only way a browser persists the
 * non-extractable localUnlockKey -- as a handle, never as bytes.
 *
 * A record that will not read back (damaged, or written by another version) reads as "no
 * remembered unlock" and is dropped: losing the convenience is the safe failure. Kind
 * 'bad_option' for a `dbName` that is not non-empty text.
 *
 * @example
 *   const deviceDB = idbDeviceDB()
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const idbDeviceDB = (opts?: IdbOpts): DeviceDB => {
  const dbName = parseDbName(opts, 'idbDeviceDB')
  const shelf = () => shelfStore(dbName)
  const ring = () => { ringBell(dbName) }

  return {
    readUnlock: async (scope) => {
      const raw: unknown = await get(Ckeys.unlock(scope), shelf())
      if (raw === undefined || raw === null) { return null }
      const checked = DeviceUnlock.safeParse(raw)
      if (! checked.success) {
        await del(Ckeys.unlock(scope), shelf())
        ring()
        return null
      }
      return checked.data
    },

    writeUnlock: async (unlock) => {
      await set(Ckeys.unlock(unlock), unlock, shelf())
      ring()
    },

    eraseUnlock: async (scope) => {
      await del(Ckeys.unlock(scope), shelf())
      ring()
    },

    // The shelf holds remembered unlocks and nothing else, so forgetting them all is clearing it:
    // any row an earlier version filed under another ckey goes too.
    eraseAll: async () => {
      await clear(shelf())
      ring()
    },
  }
}

/** One stored row, as {@link inspectIdbDeviceDB} reports it: its ckey and the raw stored value. */
export type IdbRow = { ckey: string, row: unknown }

/**
 * A window onto the rows {@link idbDeviceDB} keeps, for inspectors and debug panels: the raw
 * rows, a change bell, and a wipe. This is how the demo shows what this device remembers without
 * asking the vault's opinion -- what it reports is what is actually stored. The vault store's
 * own rows have their window beside it, `inspectIdbVaultDB` from `safebyok-indexeddb`.
 *
 * @param opts - The database to look at: `dbName`, default 'safebyok'.
 * @returns The inspector. Kind 'bad_option' for a `dbName` that is not non-empty text, and from
 *   its `subscribe`, for a listener that is not a function.
 *
 * @example
 *   const inspector = inspectIdbDeviceDB({ dbName: 'acme' })
 *   const rows = await inspector.rows()
 *   const stop = inspector.subscribe(() => { void inspector.rows().then(render) })
 */
export const inspectIdbDeviceDB = (opts?: IdbOpts) => {
  const dbName = parseDbName(opts, 'inspectIdbDeviceDB')
  return {
    /** Every stored row on the shelf, sorted by ckey. */
    rows: async (): Promise<IdbRow[]> => {
      const stored = await entries(shelfStore(dbName))
      return stored
        .filter((pair): pair is [string, unknown] => typeof pair[0] === 'string')
        .map(([ckey, row]) => ({ ckey, row }))
        .toSorted((one, two) => one.ckey.localeCompare(two.ckey))
    },
    /** Calls `listener` after any write to the shelf, this tab or another; returns the unsubscribe. */
    subscribe: (listener: () => void): (() => void) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each write.') }
      return onBell(dbName, listener)
    },
    /** Remove every row on the shelf: every remembered unlock in this database. */
    wipe: async (): Promise<void> => {
      await clear(shelfStore(dbName))
      ringBell(dbName)
    },
  }
}
