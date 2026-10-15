// fake-indexeddb installs a Node-side indexedDB global before the adapters load: these tests
// exercise real IndexedDB semantics (structured clone included) without a browser.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createStore, set } from 'idb-keyval'
import { idbDeviceDB, idbVaultDB, inspectIdb } from '../src/idb'
import { boxOf, bundleOf, scopeOf, unlockOf } from './helpers'
import { describeVaultDB } from './vault-db-suite'

// Each world gets its own database so tests never see each other's rows.
const freshDbName = () => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

describeVaultDB('idbVaultDB', () => idbVaultDB({ dbName: freshDbName() }))

describe("idbVaultDB", () => {
  it("declares no per-record limit: IndexedDB has none", () => {
    expect(idbVaultDB().maxRecordBytes).to.eq(Infinity)
  })

  it("keeps each record as itself, at the ckey it always had", async () => {
    const dbName = freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    await vaultDB.createBundle(bundleOf('u1'))
    await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null })
    expect(await inspectIdb({ dbName, shelf: 'vault_db' }).rows()).to.deep.equal([
      { ckey: 'box:acme:u1:main:anthropic', row: boxOf('anthropic', 'one') },
      { ckey: 'vault:acme:u1:main',         row: bundleOf('u1') },
    ])
  })

  it("reads a vault stored before the storage verbs: the same rows, at the same ckeys", async () => {
    const dbName = freshDbName()
    const shelf = createStore(`${dbName}:vault_db`, 'records')
    await set('vault:acme:u1:main', bundleOf('u1'), shelf)
    await set('box:acme:u1:main:anthropic', boxOf('anthropic', 'one'), shelf)
    const vaultDB = idbVaultDB({ dbName })
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
  })

  it("rings its subscribers on a write, and unsubscribing silences it", async () => {
    const vaultDB = idbVaultDB({ dbName: freshDbName() })
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.createBundle(bundleOf('u1'))
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })
    const heardBefore = heardCount
    unsubscribe()
    await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null })
    expect(heardCount).to.eq(heardBefore)
  })
})

describe("idbDeviceDB", () => {
  it("keeps a DeviceUnlock by structured clone, non-extractable localUnlockKey and all", async () => {
    const deviceDB = idbDeviceDB({ dbName: freshDbName() })
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    const unlock = await unlockOf('u1')
    await deviceDB.writeUnlock(unlock)
    const kept = await deviceDB.readUnlock(scopeOf('u1'))
    expect(kept?.vault_id).to.eq('vault-id-u1')
    expect(kept?.local_unlock_key).to.be.instanceOf(CryptoKey)
    expect(kept?.local_unlock_key.extractable).to.be.false
  })

  it("erases one unlock, and eraseAll forgets every one", async () => {
    const deviceDB = idbDeviceDB({ dbName: freshDbName() })
    await deviceDB.writeUnlock(await unlockOf('u1'))
    await deviceDB.writeUnlock(await unlockOf('u2'))
    await deviceDB.eraseUnlock(scopeOf('u1'))
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(scopeOf('u2'))).to.not.be.null
    await deviceDB.eraseAll()
    expect(await deviceDB.readUnlock(scopeOf('u2'))).to.be.null
  })
})

describe("inspectIdb", () => {
  it("shows the raw rows of a shelf, hears writes, and wipes it clean", async () => {
    const dbName = freshDbName()
    const vaultDB = idbVaultDB({ dbName })
    const inspector = inspectIdb({ dbName, shelf: 'vault_db' })
    let heardCount = 0
    const unsubscribe = inspector.subscribe(() => { heardCount += 1 })

    await vaultDB.createBundle(bundleOf('u1'))
    const rows = await inspector.rows()
    expect(rows).to.have.lengthOf(1)
    expect(rows[0]?.ckey).to.eq('vault:acme:u1:main')
    await vi.waitFor(() => { expect(heardCount).to.be.greaterThan(0) })

    await inspector.wipe()
    expect(await inspector.rows()).to.have.lengthOf(0)
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    unsubscribe()
  })
})
