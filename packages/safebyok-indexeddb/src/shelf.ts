import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'

/**
 * The shelf: the one IndexedDB object store this package keeps its rows in, `records` in the
 * database `<dbName>:vault_db`, opened through `idb-keyval` -- which opens it lazily, on the
 * first read or write, and makes it on first use. The name is a stored contract, like the
 * ckeys: it is where a vault already written is found.
 */

// One UseStore per dbName, shared by every adapter and inspector over it: making one is free
// until something reads or writes.
const shelves = new Map<string, UseStore>()

/**
 * The shelf of the database `dbName`, as `idb-keyval` hands one to its own calls.
 *
 * @example await get(bundleCkey(scope), shelfOf('acme'))
 */
export const shelfOf = (dbName: string): UseStore => {
  const kept = shelves.get(dbName)
  if (kept !== undefined) { return kept }
  const fresh = createStore(`${dbName}:vault_db`, 'records')
  shelves.set(dbName, fresh)
  return fresh
}

/**
 * `work`, run in one readwrite IndexedDB transaction over the shelf: what it reads and what it
 * writes go together, and no other tab's write lands in between, since IndexedDB runs readwrite
 * transactions over one store one after another. Resolves with what `work` resolves with, once
 * the transaction has committed; rejects, writing nothing, when `work` or any request in it
 * fails.
 *
 * `work` must wait only on the store's own requests (through `promisifyRequest`): IndexedDB
 * commits a transaction as soon as it has no request pending, so awaiting anything else -- a
 * timer, a fetch, WebCrypto -- would end it midway, and its next request would throw.
 *
 * @param shelf - The shelf, from {@link shelfOf}.
 * @param work - The reads, the decision and the writes, against the transaction's store.
 *
 * @example
 *   const landed = await inOneTransaction(shelfOf('acme'), async (store) => {
 *     const standing = await promisifyRequest(store.get(ckey))
 *     if (! meetsExpectation(standing)) { return false }
 *     store.put(record, ckey)
 *     return true
 *   })
 */
export const inOneTransaction = <ValT>(shelf: UseStore, work: (store: IDBObjectStore) => Promise<ValT>): Promise<ValT> => (
  shelf('readwrite', async (store) => {
    let outcome: ValT
    try {
      outcome = await work(store)
    } catch (err) {
      abandon(store.transaction)
      throw err
    }
    await promisifyRequest(store.transaction)
    return outcome
  })
)

// Undo every write `work` asked for before it failed: a request it placed would otherwise still
// commit. A transaction that a failed request has already aborted refuses a second abort, and
// has kept nothing either way.
const abandon = (transaction: IDBTransaction) => {
  try {
    transaction.abort()
  } catch {
    // already aborted
  }
}
