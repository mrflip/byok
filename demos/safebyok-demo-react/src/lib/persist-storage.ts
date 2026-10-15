/**
 * Asks the browser not to evict this origin's storage under pressure, as `safebyok/idb`'s doc
 * block says a host leaning on the IndexedDB adapters should. Resolves true when storage is (or
 * already was made) persistent, false when the browser declines or has no such API: the vault
 * works either way, so a refusal is never an error.
 *
 * @example
 *   await keepStorage()  // true in a browser that grants it
 *   await keepStorage(null)  // false: no StorageManager to ask
 */
export const keepStorage = async (
  storageManager: Pick<StorageManager, 'persist'> | null = typeof navigator === 'undefined' ? null : navigator.storage,
): Promise<boolean> => {
  if (typeof storageManager?.persist !== 'function') { return false }
  try {
    return await storageManager.persist()
  } catch {
    return false
  }
}
