import { describe, expect, it } from 'vitest'
import { memoryDeviceDB } from '../src/device-db'
import type { DeviceUnlock } from '../src/types'
import * as TH from './test-helpers'

describe("memoryDeviceDB", () => {
  it("round-trips a remembered unlock -- localUnlockKey handle included -- and reads null where none exists", async () => {
    const deviceDB = memoryDeviceDB()
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    const unlock = await TH.unlockOf('u1')
    await deviceDB.writeUnlock(unlock)
    const kept = await deviceDB.readUnlock(TH.scopeOf('u1'))
    expect(kept).to.deep.equal(unlock)
    expect(kept?.local_unlock_key).to.be.instanceOf(CryptoKey)
    expect(kept?.local_unlock_key.extractable).to.be.false
  })

  it("keeps unlocks per user: erasing one leaves the other", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.writeUnlock(await TH.unlockOf('u1'))
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    await deviceDB.eraseUnlock(TH.scopeOf('u1'))
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.not.be.null
  })

  it("treats a mangled record as no remembered unlock, and clears it", async () => {
    const deviceDB = memoryDeviceDB()
    const mangled = { ...(await TH.unlockOf('u1')), local_unlock_key: 'not a key handle' }
    await deviceDB.writeUnlock(mangled as unknown as DeviceUnlock)
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("eraseAll forgets every remembered unlock", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.writeUnlock(await TH.unlockOf('u1'))
    await deviceDB.writeUnlock(await TH.unlockOf('u2'))
    await deviceDB.eraseAll()
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(TH.scopeOf('u2'))).to.be.null
  })
})
