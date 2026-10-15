import { describe, expect, it } from 'vitest'
import { isVaultError, localVaultDB, memoryStore } from 'safebyok'
import * as TH from 'safebyok/testing'
import { OutageVaultDB, makeOutage } from '../../src/lib/outage'

const scope = TH.scopeOf('u1')
const bundle = TH.bundleOf('u1')

/** An OutageVaultDB over a fresh in-memory adapter, with its switch. */
const downOver = () => {
  const outage = makeOutage()
  const vaultDB = new OutageVaultDB(localVaultDB(memoryStore()), outage)
  return { outage, vaultDB }
}

describe("makeOutage", () => {
  it("starts up, and flips down and back", () => {
    const outage = makeOutage()
    expect(outage.isDown()).to.be.false
    outage.setDown(true)
    expect(outage.isDown()).to.be.true
    outage.setDown(false)
    expect(outage.isDown()).to.be.false
  })

  it("tells its listeners of each flip, and not of a setting that changes nothing", () => {
    const outage = makeOutage()
    let heard = 0
    const unsubscribe = outage.subscribe(() => { heard += 1 })
    outage.setDown(true)
    outage.setDown(true)
    outage.setDown(false)
    expect(heard).to.eq(2)
    unsubscribe()
    outage.setDown(true)
    expect(heard).to.eq(2)
  })
})

// While the switch is up, it is an adapter like any other, and owes the suite every adapter owes.
TH.describeVaultDB('OutageVaultDB, while up', () => new OutageVaultDB(localVaultDB(memoryStore()), makeOutage()))

// Each refusal is checked against the host's own copy of the package too: the provider branches
// on isVaultError, which goes by class.
describe("OutageVaultDB, while down", () => {
  it("refuses a read as storage_unavailable, as a real adapter whose backend is down", async () => {
    const { outage, vaultDB } = downOver()
    outage.setDown(true)
    expect(await TH.expectRefusal(vaultDB.readBundle(scope), 'storage_unavailable')).to.satisfy(isVaultError)
    expect(await TH.expectRefusal(vaultDB.listBoxes(scope), 'storage_unavailable')).to.satisfy(isVaultError)
  })

  it("refuses a write, and writes nothing", async () => {
    const { outage, vaultDB } = downOver()
    outage.setDown(true)
    expect(await TH.expectRefusal(vaultDB.createBundle(bundle), 'storage_unavailable')).to.satisfy(isVaultError)
    outage.setDown(false)
    expect(await vaultDB.readBundle(scope)).to.be.null
  })

  it("serves again once the switch is back up", async () => {
    const { outage, vaultDB } = downOver()
    await vaultDB.createBundle(bundle)
    outage.setDown(true)
    expect(await TH.expectRefusal(vaultDB.readBundle(scope), 'storage_unavailable')).to.satisfy(isVaultError)
    outage.setDown(false)
    expect(await vaultDB.readBundle(scope)).to.deep.equal(bundle)
  })

  it("keeps watching through the outage", async () => {
    const { outage, vaultDB } = downOver()
    let heard = 0
    outage.setDown(true)
    const unsubscribe = vaultDB.subscribe(scope, () => { heard += 1 })
    outage.setDown(false)
    await vaultDB.createBundle(bundle)
    expect(heard).to.be.greaterThan(0)
    unsubscribe()
  })

  it("states its inner adapter's limits as its own", () => {
    const inner = localVaultDB(memoryStore())
    const vaultDB = new OutageVaultDB(inner, makeOutage())
    expect(vaultDB.maxRecordBytes).to.eq(inner.maxRecordBytes)
    expect(vaultDB.maxVaultBytes).to.eq(inner.maxVaultBytes)
  })
})
