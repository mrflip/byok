// fake-indexeddb installs a Node-side indexedDB global before the store loads: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { idbDeviceDB, inspectIdbDeviceDB, type IdbOpts } from '../src/idb'
import * as Entry from '../src/idb'
import { VaultError } from '../src/errors'
import * as TH from './test-helpers'

// Each world gets its own database so tests never see each other's rows.
const freshDbName = () => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

describe("safebyok/idb", () => {
  it("exports the device store and its inspector, and no vault store: that is safebyok-indexeddb's", () => {
    expect(Object.keys(Entry)).to.have.members(['idbDeviceDB', 'inspectIdbDeviceDB'])
  })
})

/** Option bags no IndexedDB adapter takes: each refused as it is made, before a database opens. */
const BadIdbOpts = [
  [{ dbName: "" },                             'an empty dbName'],
  [{ dbName: 42 },                             'a dbName that is not text'],
  [{ dbName: null },                           'a null dbName'],
  ["acme",                                     'a dbName passed bare, not in a bag'],
] as const

describe("the IndexedDB device store's options", () => {
  const Makers = [
    ['idbDeviceDB',        (opts: IdbOpts) => idbDeviceDB(opts)],
    ['inspectIdbDeviceDB', (opts: IdbOpts) => inspectIdbDeviceDB(opts)],
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

describe("inspectIdbDeviceDB", () => {
  it("shows the raw rows of the device shelf, hears writes, and wipes it clean", async () => {
    const dbName = freshDbName()
    const deviceDB = idbDeviceDB({ dbName })
    const inspector = inspectIdbDeviceDB({ dbName })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await deviceDB.writeUnlock(await TH.unlockOf('u1'))
    const rows = await inspector.rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['unlock:acme:u1:main'])
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    unsubscribe()
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", async () => {
    const dbName = freshDbName()
    const inspector = inspectIdbDeviceDB({ dbName })
    expect(() => inspector.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await idbDeviceDB({ dbName }).writeUnlock(await TH.unlockOf('u1'))
    expect(await inspector.rows()).to.have.lengthOf(1)
  })
})
