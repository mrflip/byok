import { describe, expect, it, vi } from 'vitest'
import { onBell, ringBell } from '../src/bell'
import * as TH from './test-helpers'

describe("the change bell", () => {
  it("calls every listener of the database rung, and only that database's", async () => {
    const dbName = TH.freshDbName()
    const heard: string[] = []
    const stops = [
      onBell(dbName, () => { heard.push('one') }),
      onBell(dbName, () => { heard.push('two') }),
      onBell(TH.freshDbName(), () => { heard.push('elsewhere') }),
    ]
    ringBell(dbName)
    await vi.waitFor(() => { expect(heard).to.have.members(['one', 'two']) })
    await TH.wakeupAtNextTick()
    expect(heard).to.have.members(['one', 'two'])
    for (const stop of stops) { stop() }
  })

  it("calls listeners after the ringing code has run on, never during it", () => {
    const dbName = TH.freshDbName()
    let heardCount = 0
    const stop = onBell(dbName, () => { heardCount += 1 })
    ringBell(dbName)
    expect(heardCount).to.eq(0)
    stop()
  })

  it("stops calling a listener once it is unsubscribed, and keeps calling the rest", async () => {
    const dbName = TH.freshDbName()
    const heard: string[] = []
    const stopOne = onBell(dbName, () => { heard.push('one') })
    const stopTwo = onBell(dbName, () => { heard.push('two') })
    stopOne()
    ringBell(dbName)
    await vi.waitFor(() => { expect(heard).to.deep.equal(['two']) })
    stopTwo()
  })

  it("calls no listener unsubscribed after the ring but before its turn came", async () => {
    const dbName = TH.freshDbName()
    const heard: string[] = []
    const stopOne = onBell(dbName, () => { heard.push('one') })
    const stopTwo = onBell(dbName, () => { heard.push('two') })
    ringBell(dbName)
    stopOne()
    await vi.waitFor(() => { expect(heard).to.deep.equal(['two']) })
    await TH.wakeupAtNextTick()
    expect(heard).to.deep.equal(['two'])
    stopTwo()
  })

  it("carries a ring between two tabs' channels, never back to the tab that rang", async () => {
    const dbName = TH.freshDbName()
    const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:vault_db`)
    const otherHeard: unknown[] = []
    otherTab.addEventListener('message', (event) => { otherHeard.push(event.data) })
    let heardHere = 0
    const stop = onBell(dbName, () => { heardHere += 1 })
    ringBell(dbName)
    await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    await TH.wakeupAtNextTick()
    expect(heardHere).to.eq(1)
    stop()
    otherTab.close()
  })

  it("rings this tab's listeners alone where the platform has no BroadcastChannel", async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      const dbName = TH.freshDbName()
      let heardCount = 0
      const stop = onBell(dbName, () => { heardCount += 1 })
      ringBell(dbName)
      await vi.waitFor(() => { expect(heardCount).to.eq(1) })
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
