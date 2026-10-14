import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'

describe("memoryStore", () => {
  it("reads back what was written, and null where nothing was", () => {
    const store = memoryStore()
    expect(store.read('greeting')).to.be.null
    store.write('greeting', 'hi')
    expect(store.read('greeting')).to.eq('hi')
  })

  it("erases, and erasing what isn't there is quietly fine", () => {
    const store = memoryStore()
    store.write('greeting', 'hi')
    store.erase('greeting')
    store.erase('greeting')
    expect(store.read('greeting')).to.be.null
  })

  it("lists every ckey it holds", () => {
    const store = memoryStore()
    store.write('one', '1')
    store.write('two', '2')
    expect(store.ckeys()).to.have.members(['one', 'two'])
  })

  it("rings subscribers on write and erase, and unsubscribing silences them", () => {
    const store = memoryStore()
    let heardCount = 0
    const unsubscribe = store.subscribe(() => { heardCount += 1 })
    store.write('one', '1')
    store.erase('one')
    expect(heardCount).to.eq(2)
    unsubscribe()
    store.write('two', '2')
    expect(heardCount).to.eq(2)
  })
})
