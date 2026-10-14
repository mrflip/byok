import { describe, expect, it } from 'vitest'
import { memoryStore } from '../../src/byok/string-store'
import { createAuth } from '../../src/scaffold/auth'

const makeWorld = () => {
  const dbStore = memoryStore()
  const deviceStore = memoryStore()
  const auth = createAuth({ applabel: 'acme', dbStore, deviceStore })
  return { dbStore, deviceStore, auth }
}

describe("createAuth", () => {
  it("starts signed out", () => {
    const { auth } = makeWorld()
    expect(auth.getSnapshot()).to.be.null
  })

  it("signing in creates the account on first sight and starts a session", async () => {
    const { auth, dbStore } = makeWorld()
    const session = await auth.signIn('margo')
    expect(session.userlabel).to.eq('margo')
    expect(session.userId).to.match(/^user_[0-9a-f]{16}$/)
    expect(auth.getSnapshot()).to.eq(session)
    expect(dbStore.read('account:acme:margo')).to.not.be.null
  })

  it("the same userlabel signs back into the same account", async () => {
    const { auth } = makeWorld()
    const first = await auth.signIn('margo')
    auth.signOut()
    const again = await auth.signIn('margo')
    expect(again.userId).to.eq(first.userId)
  })

  it("different userlabels are different accounts", async () => {
    const { auth } = makeWorld()
    const margo = await auth.signIn('margo')
    const nikos = await auth.signIn('nikos')
    expect(nikos.userId).to.not.eq(margo.userId)
  })

  it("refuses a userlabel that is not a Label", async () => {
    const { auth } = makeWorld()
    await expect(auth.signIn('not a label')).rejects.toThrow()
    expect(auth.getSnapshot()).to.be.null
  })

  it("the session survives in device storage, as a page reload would see it", async () => {
    const { auth, dbStore, deviceStore } = makeWorld()
    const session = await auth.signIn('margo')
    const reloaded = createAuth({ applabel: 'acme', dbStore, deviceStore })
    expect(reloaded.getSnapshot()).to.deep.equal(session)
  })

  it("signing out ends the session on this device but keeps the account", async () => {
    const { auth, dbStore, deviceStore } = makeWorld()
    await auth.signIn('margo')
    auth.signOut()
    expect(auth.getSnapshot()).to.be.null
    expect(deviceStore.read('session:acme')).to.be.null
    expect(dbStore.read('account:acme:margo')).to.not.be.null
  })

  it("deleting the account removes its row and the session", async () => {
    const { auth, dbStore } = makeWorld()
    await auth.signIn('margo')
    await auth.deleteAccount()
    expect(auth.getSnapshot()).to.be.null
    expect(dbStore.read('account:acme:margo')).to.be.null
  })

  it("a mangled device session reads as signed out, not as a crash", () => {
    const { dbStore, deviceStore } = makeWorld()
    deviceStore.write('session:acme', 'not even json')
    const reloaded = createAuth({ applabel: 'acme', dbStore, deviceStore })
    expect(reloaded.getSnapshot()).to.be.null
    expect(deviceStore.read('session:acme')).to.be.null
  })

  it("tells listeners about sign-in and sign-out", async () => {
    const { auth } = makeWorld()
    let heardCount = 0
    auth.subscribe(() => { heardCount += 1 })
    await auth.signIn('margo')
    auth.signOut()
    expect(heardCount).to.eq(2)
  })
})
