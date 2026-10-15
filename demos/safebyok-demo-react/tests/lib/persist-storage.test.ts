import { describe, expect, it } from 'vitest'
import { keepStorage } from '../../src/lib/persist-storage'

describe("keepStorage", () => {
  it("asks the browser to persist, and reports a grant", async () => {
    let asked = 0
    const granted = await keepStorage({ persist: () => { asked += 1; return Promise.resolve(true) } })
    expect(granted).to.be.true
    expect(asked).to.eq(1)
  })

  it("reports a refusal as false, not an error", async () => {
    expect(await keepStorage({ persist: () => Promise.resolve(false) })).to.be.false
  })

  it("reports false when persist() rejects", async () => {
    expect(await keepStorage({ persist: () => Promise.reject(new Error('nope')) })).to.be.false
  })

  it("reports false when the browser has no StorageManager", async () => {
    expect(await keepStorage(null)).to.be.false
  })
})
