import { DeviceUnlock, type VaultScope } from './types'
import * as Ckeys from './ckeys'

/**
 * Device-local storage for remembered unlocks: what lets "enter your passphrase once, keep it for
 * seven days" survive a page reload. A {@link DeviceUnlock} record holds this browser's
 * localUnlockKey -- a non-extractable CryptoKey handle, which has no JSON form -- so an adapter
 * must keep records by structured clone (IndexedDB: see `safebyok/idb`) or in memory; nothing here
 * ever goes to the backend.
 *
 * An adapter may answer a damaged or unreadable record with null rather than an error: losing a
 * remembered unlock only means asking for the passphrase again, and that is the safe failure.
 * The vault checks whatever `readUnlock` hands back all the same, and erases a record that does
 * not pass, so an adapter that returns a record exactly as it stored it is never trusted blindly.
 */
export interface DeviceDB {
  /** The remembered unlock for one vault, or null when there is none. Expiry is the vault's call. */
  readUnlock(scope: VaultScope): Promise<DeviceUnlock | null>
  writeUnlock(unlock: DeviceUnlock): Promise<void>
  eraseUnlock(scope: VaultScope): Promise<void>
  /** Remove every remembered unlock on this device: the device's part of a full reset. */
  eraseAll(): Promise<void>
}

/**
 * DeviceDB over a Map: what the tests use, and the fallback anywhere without IndexedDB. Remembered
 * unlocks last exactly as long as the page -- which is to say, it remembers nothing, safely.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const memoryDeviceDB = (): DeviceDB => {
  const unlocks = new Map<string, DeviceUnlock>()
  return {
    readUnlock: (scope) => {
      const kept = unlocks.get(Ckeys.unlock(scope))
      if (kept === undefined) { return Promise.resolve(null) }
      const checked = DeviceUnlock.safeParse(kept)
      // A malformed record reads as "no remembered unlock": losing the convenience is the safe failure.
      if (! checked.success) {
        unlocks.delete(Ckeys.unlock(scope))
        return Promise.resolve(null)
      }
      return Promise.resolve(checked.data)
    },

    writeUnlock: (unlock) => {
      unlocks.set(Ckeys.unlock(unlock), unlock)
      return Promise.resolve()
    },

    eraseUnlock: (scope) => {
      unlocks.delete(Ckeys.unlock(scope))
      return Promise.resolve()
    },

    eraseAll: () => {
      unlocks.clear()
      return Promise.resolve()
    },
  }
}
