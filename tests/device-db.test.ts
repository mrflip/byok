import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'
import { localDeviceDB } from '../src/device-db'
import type { DeviceUnlock, VaultScope } from '../src/types'

const scopeOf = (userId: string): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel: 'main' })

const unlockOf = (userId: string): DeviceUnlock => ({
  format:     'byok-stub-unlock-v0',
  ...scopeOf(userId),
  expires_at: 1_900_000_000_000,
})

describe("localDeviceDB", () => {
  it("round-trips a remembered unlock, and reads null where none exists", async () => {
    const deviceDB = localDeviceDB(memoryStore())
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    await deviceDB.writeUnlock(unlockOf('u1'))
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.deep.equal(unlockOf('u1'))
  })

  it("keeps unlocks per user: erasing one leaves the other", async () => {
    const deviceDB = localDeviceDB(memoryStore())
    await deviceDB.writeUnlock(unlockOf('u1'))
    await deviceDB.writeUnlock(unlockOf('u2'))
    await deviceDB.eraseUnlock(scopeOf('u1'))
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(scopeOf('u2'))).to.not.be.null
  })

  it("treats a mangled row as no remembered unlock, and clears it", async () => {
    const store = memoryStore()
    const deviceDB = localDeviceDB(store)
    store.write('unlock:acme:u1:main', 'not even json')
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    expect(store.read('unlock:acme:u1:main')).to.be.null
  })

  it("eraseAll forgets every remembered unlock", async () => {
    const deviceDB = localDeviceDB(memoryStore())
    await deviceDB.writeUnlock(unlockOf('u1'))
    await deviceDB.writeUnlock(unlockOf('u2'))
    await deviceDB.eraseAll()
    expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(scopeOf('u2'))).to.be.null
  })
})
