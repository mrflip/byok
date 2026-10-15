// fake-indexeddb installs a Node-side indexedDB global before the adapters load: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createStore, set } from 'idb-keyval'
import { idbDeviceDB, idbVaultDB, inspectIdb, type IdbOpts } from '../src/idb'
import { VaultError } from '../src/errors'
import * as TH from './test-helpers'

// Each world gets its own database so tests never see each other's rows.
const freshDbName = () => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

TH.describeVaultDB('idbVaultDB', () => idbVaultDB({ dbName: freshDbName() }))

/** Option bags no IndexedDB adapter takes: each refused as it is made, before a database opens. */
const BadIdbOpts = [
  [{ dbName: "" },                             'an empty dbName'],
  [{ dbName: 42 },                             'a dbName that is not text'],
  [{ dbName: null },                           'a null dbName'],
  ["acme",                                     'a dbName passed bare, not in a bag'],
] as const

describe("the IndexedDB adapters' options", () => {
  const Makers = [
    ['idbVaultDB',  (opts: IdbOpts) => idbVaultDB(opts)],
    ['idbDeviceDB', (opts: IdbOpts) => idbDeviceDB(opts)],
  ] as const
  for (const [makerTitle, make] of Makers) {
    for (const [opts, blurb] of BadIdbOpts) {
      it(`${makerTitle} refuses ${blurb} with kind 'bad_option'`, () => {
        expect(() => make(opts as unknown as IdbOpts)).to.throw(VaultError, /dbName/).with.property('kind', 'bad_option')
      })
    }
    it(`${makerTitle} keeps its records in 'safebyok' given no options, or no dbName`, () => {
      expect(() => make(undefined as unknown as IdbOpts)).to.not.throw()
      expect(() => make({ dbName: undefined })).to.not.throw()
    })
  }
})

describe("idbVaultDB", () => {
  it("declares no per-record limit: IndexedDB has none", () => {
    expect(idbVaultDB().maxRecordBytes).to.eq(Infinity)
  })

  it("declares no per-vault limit: it never reads a vault under a budget", () => {
    expect(idbVaultDB().maxVaultBytes).to.eq(Infinity)
  })

  it("keeps each record as itself, at the ckey it always had", async () => {
    const dbName = freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null })
    expect(await inspectIdb({ dbName, shelf: 'vault_db' }).rows()).to.deep.equal([
      { ckey: 'box:acme:u1:main:anthropic', row: TH.boxOf('anthropic', 'one') },
      { ckey: 'vault:acme:u1:main',         row: TH.bundleOf('u1') },
    ])
  })

  it("reads a vault stored before the storage verbs: the same rows, at the same ckeys", async () => {
    const dbName = freshDbName()
    const shelf = createStore(`${dbName}:vault_db`, 'records')
    await set('vault:acme:u1:main', TH.bundleOf('u1'), shelf)
    await set('box:acme:u1:main:anthropic', TH.boxOf('anthropic', 'one'), shelf)
    const vaultDB = idbVaultDB({ dbName })
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("rings its subscribers on a write, and unsubscribing silences it", async () => {
    const vaultDB = idbVaultDB({ dbName: freshDbName() })
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })
    const heardBefore = heardCount
    unsubscribe()
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null })
    expect(heardCount).to.eq(heardBefore)
  })
})

describe("idbDeviceDB", () => {
  it("keeps a DeviceUnlock by structured clone, non-extractable localUnlockKey and all", async () => {
    const deviceDB = idbDeviceDB({ dbName: freshDbName() })
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    const unlock = await TH.unlockOf('u1')
    await deviceDB.writeUnlock(unlock)
    const kept = await deviceDB.readUnlock(TH.scopeOf('u1'))
    expect(kept?.vault_id).to.eq('vault-id-u1')
    expect(kept?.local_unlock_key).to.be.instanceOf(CryptoKey)
    expect(kept?.local_unlock_key.extractable).to.be.false
  })

  it("erases one unlock, and eraseAll forgets every one", async () => {
    const deviceDB = idbDeviceDB({ dbName: freshDbName() })
    await deviceDB.writeUnlock(await TH.unlockOf('u1'))
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    await deviceDB.eraseUnlock(TH.scopeOf('u1'))
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.not.be.null
    await deviceDB.eraseAll()
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.be.null
  })
})

describe("inspectIdb", () => {
  it("shows the raw rows of a shelf, hears writes, and wipes it clean", async () => {
    const dbName = freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const inspector = inspectIdb({ dbName, shelf: 'vault_db' })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await vaultDB.createBundle(TH.bundleOf('u1'))
    const rows = await inspector.rows()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]?.ckey).to.eq('vault:acme:u1:main')
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    unsubscribe()
  })

  it("refuses a shelf it does not know, or a bad dbName, with kind 'bad_option'", () => {
    expect(() => inspectIdb({ shelf: 'vault_rows' as unknown as 'vault_db' })).to.throw(VaultError, /shelf/).with.property('kind', 'bad_option')
    expect(() => inspectIdb({ dbName: '', shelf: 'vault_db' })).to.throw(VaultError, /dbName/).with.property('kind', 'bad_option')
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = freshDbName()
    const inspector = inspectIdb({ dbName, shelf: 'vault_db' })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await idbVaultDB({ dbName }).createBundle(TH.bundleOf('u1'))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
