import { entries, get, promisifyRequest } from 'idb-keyval'
import { VaultDB } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, VaultBundle, VaultScope } from 'safebyok'
import { onBell, ringBell } from './bell'
import { boxCkey, bundleCkey, isBoxCkeyOf } from './ckeys'
import { bundleMeetsExpectation, lockboxMeetsExpectation, vaultMeetsExpectation } from './expectations'
import { parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, shelfOf } from './shelf'

/**
 * safebyok's storage in this browser's IndexedDB: a VaultDB for an app with no backend, keeping
 * everything a synced backend would hold on this device instead, so its whispers are encrypted
 * at rest all the same. Nothing syncs, but the rows are exactly what a backend would store, and
 * every secret field in them is ciphertext.
 *
 * * **Every verb is one IndexedDB transaction**: a write lands only while what it expects still
 *   stands, even with another tab writing at the same moment, and refuses with kind
 *   `stale_write` otherwise.
 * * **Other tabs' writes** ring `subscribe`, over a BroadcastChannel.
 * * **No limits of its own**: IndexedDB sets none per record or per vault, so `maxRecordBytes`,
 *   `maxVaultBytes` and `maxLockboxes` are `Infinity`; the origin's storage quota bounds the
 *   whole database.
 *
 * Browser storage is best-effort: the browser may evict it under pressure, and "clear site data"
 * removes it. An app keeping its vaults here should call `navigator.storage.persist()`, and say
 * plainly that the vault lives only in this browser.
 *
 * @param opts - Where to keep the records: `dbName`, default 'safebyok'.
 * @returns The VaultDB, to hand `openVault`. Kind 'bad_option' for a `dbName` that is not
 *   non-empty text. Nothing is opened until the first read or write.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB: idbVaultDB({ dbName: 'acme' }), ...browserOpts({ dbName: 'acme' }) })
 */
export const idbVaultDB = (opts?: IdbVaultDBOpts): VaultDB => new IdbVaultDB(parseDbName(opts, 'idbVaultDB'))

class IdbVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = Infinity

  private readonly dbName: string

  constructor(dbName: string) {
    super()
    this.dbName = dbName
  }

  private get shelf() { return shelfOf(this.dbName) }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    return (await get(bundleCkey(scope), this.shelf)) ?? null
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    const { standing, created } = await inOneTransaction(this.shelf, async (store) => {
      const already = await rowAt(store, bundleCkey(bundle))
      if (already !== undefined) { return { standing: already, created: false } }
      store.put(bundle, bundleCkey(bundle))
      return { standing: bundle, created: true }
    })
    if (created) { this.ring() }
    return standing
  }

  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, bundleCkey(bundle))
      if (! bundleMeetsExpectation(standing, expected)) { return false }
      store.put(bundle, bundleCkey(bundle))
      return true
    }))
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return (await get(boxCkey(scope, boxlabel), this.shelf)) ?? null
  }

  protected async doListBoxes(scope: VaultScope): Promise<unknown[]> {
    const rows = await entries(this.shelf)
    return rows
      .filter(([ckey]) => isBoxCkeyOf(scope, ckey))
      .map(([, row]) => row as unknown)
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const [standingBundle, standingBox] = await Promise.all([rowAt(store, bundleCkey(scope)), rowAt(store, boxCkey(scope, lockbox.boxlabel))])
      if (! lockboxMeetsExpectation(standingBundle, standingBox, expected)) { return false }
      store.put(lockbox, boxCkey(scope, lockbox.boxlabel))
      return true
    }))
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, bundleCkey(scope))
      if (! vaultMeetsExpectation(standing, expected)) { return false }
      store.delete(boxCkey(scope, boxlabel))
      return true
    }))
  }

  // The look at the bundle, the listing and every deletion are one transaction: a lockbox another
  // tab writes waits for the erase and then finds no bundle, so no lockbox outlives its vault.
  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, bundleCkey(scope))
      if (! vaultMeetsExpectation(standing, expected)) { return false }
      const ckeys = await promisifyRequest(store.getAllKeys())
      const doomed = ckeys.filter((ckey) => isBoxCkeyOf(scope, ckey))
      for (const ckey of [...doomed, bundleCkey(scope)]) { store.delete(ckey) }
      return true
    }))
  }

  // Rings on every write to the shelf, not only ones in scope: a spurious refresh is harmless.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return onBell(this.dbName, onChange)
  }

  private ring() { ringBell(this.dbName) }

  private ringIfLanded(landed: boolean): boolean {
    if (landed) { this.ring() }
    return landed
  }
}

/** The row standing at `ckey`, read within the transaction `store` belongs to: undefined for none. */
const rowAt = (store: IDBObjectStore, ckey: string): Promise<unknown> => promisifyRequest<unknown>(store.get(ckey))
