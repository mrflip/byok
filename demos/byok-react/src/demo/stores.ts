import { domStore, localDeviceDB, localVaultDB, memoryStore, type StringStore } from '../byok'

/**
 * DEMO JANK: concrete storage wiring. Both "places" live in this browser's localStorage, under
 * prefixes that keep them separate, because the demo has no real backend:
 *
 *  * `byok-demo:db:`     stands in for the remote database a backend would hold
 *  * `byok-demo:device:` is genuinely device-local, as it would be in production
 *
 * The inspector at the bottom of the page renders each store raw, so you can watch what lands
 * where. A real app replaces dbStore/vaultDB with a Convex (or REST) adapter and keeps deviceDB
 * local.
 */

export const Applabel = 'byok_demo'

const storage = typeof localStorage === 'undefined' ? null : localStorage

/** The pretend-remote database: everything a backend would see. */
export const dbStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'byok-demo:db:')

/** This device's own storage: sessions and remembered unlocks; never leaves the browser. */
export const deviceStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'byok-demo:device:')

export const vaultDB = localVaultDB(dbStore)
export const deviceDB = localDeviceDB(deviceStore)
