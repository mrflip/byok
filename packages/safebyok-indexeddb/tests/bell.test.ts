import { spawnSync } from 'node:child_process'
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

  it("calls the other listeners when one throws, and lets nothing escape as an uncaught error", async () => {
    const dbName = TH.freshDbName()
    const heard: string[] = []
    const stops = [
      onBell(dbName, () => {
        heard.push('one')
        throw new Error('a listener that throws')
      }),
      onBell(dbName, () => { heard.push('two') }),
    ]
    ringBell(dbName)
    await vi.waitFor(() => { expect(heard).to.deep.equal(['one', 'two']) })
    await TH.wakeupAtNextTick()
    for (const stop of stops) { stop() }
  })

  it("closes its channel when its database's last listener leaves, and opens it afresh for the next", async () => {
    const dbName = TH.freshDbName()
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      const stopOne = onBell(dbName, () => undefined)
      const stopTwo = onBell(dbName, () => undefined)
      stopOne()
      expect(closing).not.toHaveBeenCalled()
      stopTwo()
      expect(closing).toHaveBeenCalledTimes(1)
      const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:vault_db`)
      let heardCount = 0
      const stopThree = onBell(dbName, () => { heardCount += 1 })
      otherTab.postMessage('changed')
      await vi.waitFor(() => { expect(heardCount).to.eq(1) })
      stopThree()
      otherTab.close()
    } finally {
      closing.mockRestore()
    }
  })

  it("rings other tabs for a write nothing here listens to, then closes the channel it opened", async () => {
    const dbName = TH.freshDbName()
    const otherTab = new BroadcastChannel(`safebyok-idb:${dbName}:vault_db`)
    const otherHeard: unknown[] = []
    otherTab.addEventListener('message', (event) => { otherHeard.push(event.data) })
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      ringBell(dbName)
      expect(closing).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    } finally {
      closing.mockRestore()
      otherTab.close()
    }
  })

  it("unrefs its channel where the platform's has unref, so it never holds a process open", () => {
    const unrefs = vi.fn()
    class NodeLikeChannel extends EventTarget {
      postMessage = vi.fn()
      close = vi.fn()
      unref = unrefs
    }
    vi.stubGlobal('BroadcastChannel', NodeLikeChannel)
    try {
      const stop = onBell(TH.freshDbName(), () => undefined)
      ringBell(TH.freshDbName())
      expect(unrefs).toHaveBeenCalledTimes(2)
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lets a Node process that rang it exit on its own, a throwing listener and all", () => {
    const bellUrl = new URL('../src/bell.ts', import.meta.url).href
    const script = `
      const { onBell, ringBell } = await import(${JSON.stringify(bellUrl)})
      onBell('exits', () => { throw new Error('a listener that throws') })
      ringBell('exits')
    `
    const ran = spawnSync(process.execPath, ['--input-type=module', '--no-warnings', '--eval', script], { encoding: 'utf8', timeout: 10_000 })
    expect(ran.signal, 'the process was still running after ten seconds').to.be.null
    expect(ran.stderr).to.eq('')
    expect(ran.status).to.eq(0)
  })
})
