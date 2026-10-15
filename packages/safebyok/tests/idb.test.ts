// fake-indexeddb installs a Node-side indexedDB global before the adapters load: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createStore, set } from 'idb-keyval'
import { idbDeviceDB, idbVaultDB, inspectIdb, type IdbOpts } from '../src/idb'
import { VaultError } from '../src/errors'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'

// Each test gets its own database, so tests never see each other's rows.
TH.describeVaultDB('idbVaultDB', () => idbVaultDB({ dbName: TH.freshDbName() }))
TH.describeDeviceDB('idbDeviceDB', () => idbDeviceDB({ dbName: TH.freshDbName() }))

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

  it("keeps each record as itself, under the JSON of its kind and scope", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    expect(await inspectIdb({ dbName, shelf: 'vault_db' }).rows()).to.deep.equal([
      { ckey: '["box","acme","u1","main","anthropic"]', row: TH.boxOf('anthropic', 'one') },
      { ckey: '["vault","acme","u1","main"]',            row: TH.bundleOf('u1') },
    ])
  })

  it("reads rows filed under the colon-joined ckeys of 0.2 and before as absent, and leaves them be", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:vault_db`, 'records')
    await set('vault:acme:u1:main', TH.bundleOf('u1'), shelf)
    await set('box:acme:u1:main:anthropic', TH.boxOf('anthropic', 'one'), shelf)
    const vaultDB = idbVaultDB({ dbName })
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(await inspectIdb({ dbName, shelf: 'vault_db' }).rows()).to.have.lengthOf(2)
  })

  it("lists a row that is no lockbox as damaged, under the boxlabel it is stored under", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:vault_db`, 'records')
    await set(Ckeys.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'), shelf)
    await set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), 'not a lockbox', shelf)
    await set(Ckeys.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'), shelf)
    const listed = await idbVaultDB({ dbName }).listBoxes(TH.scopeOf('u1'))
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
    expect(listed[1]).to.include({ boxlabel: 'openai', damaged: false })
  })

  it("rings its subscribers on a write, and unsubscribing silences it", async () => {
    const vaultDB = idbVaultDB({ dbName: TH.freshDbName() })
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })
    const heardBefore = heardCount
    unsubscribe()
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    expect(heardCount).to.eq(heardBefore)
  })
})

describe("idbDeviceDB", () => {
  it("sweeps an unlock filed under an earlier version's ckey at the first read, never reading it", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    await set(['unlock', 'acme', 'u1', 'main'], await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    const gets = vi.spyOn(IDBObjectStore.prototype, 'get')
    const getAlls = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const cursors = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    try {
      expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
      expect(gets.mock.calls.map(([ckey]) => ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u1'))])
      expect(getAlls).to.have.callCount(0)
      expect(cursors).to.have.callCount(0)
    } finally {
      vi.restoreAllMocks()
    }
    const rows = await inspectIdb({ dbName, shelf: 'device_db' }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u2'))])
  })

  it("sweeps them at an erase too, keeping every unlock it filed", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    await deviceDB.eraseUnlock(TH.scopeOf('u3'))
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.not.be.null
    const rows = await inspectIdb({ dbName, shelf: 'device_db' }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal([Ckeys.unlock(TH.scopeOf('u2'))])
  })

  it("rings the device shelf's bell when a read sweeps, so an inspector stops showing the swept rows", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspectIdb({ dbName, shelf: 'device_db' }).subscribe(() => { heardCount += 1 })
    await deviceDB.readUnlock(TH.scopeOf('u2'))
    expect(heardCount).to.equal(1)
    await deviceDB.readUnlock(TH.scopeOf('u2'))
    expect(heardCount).to.equal(1)
    unsubscribe()
  })

  it("forgets the scope's own unlock at an erase even when the sweep fails", async () => {
    const dbName = TH.freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u1'))
    vi.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(() => { throw new Error('the shelf will not list') })
    try {
      await expect(deviceDB.eraseUnlock(TH.scopeOf('u1'))).rejects.toThrow('the shelf will not list')
    } finally {
      vi.restoreAllMocks()
    }
    expect(await inspectIdb({ dbName, shelf: 'device_db' }).rows()).to.have.lengthOf(0)
  })

  it("clears the whole shelf at eraseAll, an unlock filed under the colon-joined ckey of 0.2 and before included", async () => {
    const dbName = TH.freshDbName()
    const shelf = createStore(`${dbName}:device_db`, 'records')
    await set('unlock:acme:u1:main', await TH.unlockOf('u1'), shelf)
    const deviceDB = idbDeviceDB({ dbName })
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    await deviceDB.eraseAll()
    expect(await inspectIdb({ dbName, shelf: 'device_db' }).rows()).to.have.lengthOf(0)
  })
})

describe("inspectIdb", () => {
  it("shows the raw rows of a shelf, hears writes, and wipes it clean", async () => {
    const dbName = TH.freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const inspector = inspectIdb({ dbName, shelf: 'vault_db' })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await vaultDB.createBundle(TH.bundleOf('u1'))
    const rows = await inspector.rows()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]?.ckey).to.eq('["vault","acme","u1","main"]')
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
    const dbName = TH.freshDbName()
    const inspector = inspectIdb({ dbName, shelf: 'vault_db' })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await idbVaultDB({ dbName }).createBundle(TH.bundleOf('u1'))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
