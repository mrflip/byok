import { domStore, memoryStore, type StringStore } from 'byok'
import { idbDeviceDB, idbVaultDB, inspectIdb } from 'byok/idb'

/**
 * DEMO JANK: concrete storage wiring. The vault's records live in this browser's IndexedDB,
 * through the real byok/idb adapters:
 *
 *  * the `vault_db` shelf stands in for the remote database a backend would hold -- rows of
 *    ciphertext that never open without your passphrase
 *  * the `device_db` shelf is genuinely device-local, exactly as it would be in production: the
 *    remembered unlock, around a key handle that cannot leave this browser
 *
 * The fake auth keeps its scaffolding rows in localStorage: accounts beside the pretend backend,
 * the session standing in for a cookie. The inspectors at the bottom of the page render every
 * shelf raw, so you can watch what lands where. A real app replaces vaultDB with a Convex (or
 * REST) adapter and keeps deviceDB exactly as it is here.
 */

export const Applabel = 'byok_demo'

const storage = typeof localStorage === 'undefined' ? null : localStorage

/** The fake auth's account rows: pretend-backend scaffolding, beside the real vault shelf. */
export const dbStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'byok-demo:db:')

/** The fake auth's session: stands in for a cookie; never leaves the browser. */
export const deviceStore: StringStore = storage === null ? memoryStore() : domStore(storage, 'byok-demo:device:')

export const vaultDB = idbVaultDB({ dbName: Applabel })
export const deviceDB = idbDeviceDB({ dbName: Applabel })

/** Raw windows onto the two IndexedDB shelves, for the inspection panels. */
export const vaultDbInspector = inspectIdb({ dbName: Applabel, shelf: 'vault_db' })
export const deviceDbInspector = inspectIdb({ dbName: Applabel, shelf: 'device_db' })
