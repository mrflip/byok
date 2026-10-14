import { DeviceUnlock, type VaultScope } from './types'
import type { StringStore } from './string-store'

/**
 * Device-local storage for remembered unlocks: what lets "enter your passphrase once, keep it for
 * seven days" survive a page reload. In the real package this holds the vault key wrapped under a
 * non-extractable device key; nothing here ever goes to the backend.
 */
export interface DeviceDB {
  /** The remembered unlock for one vault, or null when there is none. Expiry is the vault's call. */
  readUnlock(scope: VaultScope): Promise<DeviceUnlock | null>
  writeUnlock(unlock: DeviceUnlock): Promise<void>
  eraseUnlock(scope: VaultScope): Promise<void>
  /** Remove every remembered unlock on this device: the device's part of a full reset. */
  eraseAll(): Promise<void>
}

const unlockCkey = (scope: VaultScope) => `unlock:${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

/**
 * ⚠️ STUB DeviceDB over a StringStore. A malformed row (edited by hand, written by an older
 * version) reads as "no remembered unlock" rather than an error: losing the convenience is the
 * safe failure.
 *
 * @example
 *   const deviceDB = localDeviceDB(domStore(localStorage, 'byok-demo:device:'))
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const localDeviceDB = (store: StringStore): DeviceDB => ({
  readUnlock: (scope) => {
    const text = store.read(unlockCkey(scope))
    if (text === null) { return Promise.resolve(null) }
    try {
      return Promise.resolve(DeviceUnlock.parse(JSON.parse(text)))
    } catch {
      store.erase(unlockCkey(scope))
      return Promise.resolve(null)
    }
  },

  writeUnlock: (unlock) => {
    store.write(unlockCkey(unlock), JSON.stringify(unlock))
    return Promise.resolve()
  },

  eraseUnlock: (scope) => {
    store.erase(unlockCkey(scope))
    return Promise.resolve()
  },

  eraseAll: () => {
    store.ckeys()
      .filter((ckey) => ckey.startsWith('unlock:'))
      .forEach((ckey) => { store.erase(ckey) })
    return Promise.resolve()
  },
})
