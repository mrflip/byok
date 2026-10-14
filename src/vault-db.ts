import { Lockbox, LockboxSummary, VaultBundle, type VaultScope } from './types'
import type { StringStore } from './string-store'

/**
 * Remote storage for vault records, as the host application plugs it in. The real package speaks
 * to this interface and nothing else about the backend; a Convex adapter, a REST adapter and this
 * demo's localStorage adapter are all the same shape.
 *
 * The adapter is expected to enforce account-level authorization (a signed-in user reaches only
 * their own rows). In the real package every secret field it carries is ciphertext; possessing
 * the database does not open a vault.
 */
export interface VaultDB {
  /** The vault's bundle, or null when the vault has never been initialized. */
  readBundle(scope: VaultScope): Promise<VaultBundle | null>
  writeBundle(bundle: VaultBundle): Promise<void>
  /** Public faces of every lockbox in the vault, whispers excluded: valid while locked. */
  listBoxes(scope: VaultScope): Promise<LockboxSummary[]>
  /** One full lockbox record, or null when there is none under that label. */
  readBox(scope: VaultScope, boxlabel: string): Promise<Lockbox | null>
  writeBox(scope: VaultScope, lockbox: Lockbox): Promise<void>
  eraseBox(scope: VaultScope, boxlabel: string): Promise<void>
  /** Remove the bundle and every lockbox: the backend's part of deleting a vault. */
  eraseVault(scope: VaultScope): Promise<void>
  /** Calls `onChange` after any write touching `scope`; returns the unsubscribe. */
  subscribe(scope: VaultScope, onChange: () => void): () => void
}

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

const scopePath = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`
const bundleCkey = (scope: VaultScope) => `vault:${scopePath(scope)}`
const boxCkey = (scope: VaultScope, boxlabel: string) => `box:${scopePath(scope)}:${boxlabel}`
const boxPrefix = (scope: VaultScope) => `box:${scopePath(scope)}:`

/**
 * ⚠️ STUB VaultDB over a StringStore, standing in for the backend while prototyping: rows land as
 * plain JSON, whispers included, so the demo's inspector can show exactly what a backend would
 * hold. The real package hands this layer ciphertext only.
 *
 * Rows read back are validated: storage is someone else's database, and a row may have been
 * written by another version of this code.
 *
 * @example
 *   const vaultDB = localVaultDB(domStore(localStorage, 'byok-demo:db:'))
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const localVaultDB = (store: StringStore): VaultDB => {
  const readRow = <RowT>(ckey: string, rowSchema: { parse: (val: unknown) => RowT }): RowT | null => {
    const text = store.read(ckey)
    if (text === null) { return null }
    return rowSchema.parse(JSON.parse(text))
  }

  // Work is deferred into the promise chain even though the store is synchronous: a storage
  // fault must reject the returned promise, never throw before the caller has one in hand.
  return {
    readBundle: (scope) => soon(() => readRow(bundleCkey(scope), VaultBundle)),

    writeBundle: (bundle) => soon(() => { store.write(bundleCkey(bundle), JSON.stringify(bundle)) }),

    listBoxes: (scope) => soon(() => (
      store.ckeys()
        .filter((ckey) => ckey.startsWith(boxPrefix(scope)))
        .map((ckey) => readRow(ckey, Lockbox))
        .filter((lockbox): lockbox is Lockbox => lockbox !== null)
        .map((lockbox) => LockboxSummary.parse(lockbox))
        .toSorted((one, two) => one.boxlabel.localeCompare(two.boxlabel))
    )),

    readBox: (scope, boxlabel) => soon(() => readRow(boxCkey(scope, boxlabel), Lockbox)),

    writeBox: (scope, lockbox) => soon(() => { store.write(boxCkey(scope, lockbox.boxlabel), JSON.stringify(lockbox)) }),

    eraseBox: (scope, boxlabel) => soon(() => { store.erase(boxCkey(scope, boxlabel)) }),

    eraseVault: (scope) => soon(() => {
      const doomed = store.ckeys()
        .filter((ckey) => ckey === bundleCkey(scope) || ckey.startsWith(boxPrefix(scope)))
      for (const ckey of doomed) { store.erase(ckey) }
    }),

    // The store's bell rings on every write, not only ones in scope: a spurious refresh is
    // harmless in a prototype, and the real adapter (Convex) subscribes precisely.
    subscribe: (_scope, onChange) => store.subscribe(onChange),
  }
}
