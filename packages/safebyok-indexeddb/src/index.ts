/**
 * safebyok-indexeddb: safebyok's storage in this browser's IndexedDB. {@link idbVaultDB} is the
 * VaultDB for an app with no backend, every verb one IndexedDB transaction; {@link
 * inspectIdbVaultDB} shows the rows it keeps, raw. It is also the template for a key-value
 * backend of your own: the README says what to copy and where to type.
 */
export { idbVaultDB } from './idb-vault-db'
export type { IdbVaultDBOpts } from './idb-opts'
export { inspectIdbVaultDB } from './inspect-idb-vault-db'
export type { IdbRow, IdbVaultInspector } from './inspect-idb-vault-db'
