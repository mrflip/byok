import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, localVaultDB } from '../src/vault-db'
import { VaultError } from '../src/errors'
import type { Lockbox, VaultBundle, VaultScope } from '../src/types'
import { boxOf, bundleOf, scopeOf } from './helpers'

describe("localVaultDB", () => {
  it("has no bundle until one is written, then reads it back whole", async () => {
    const vaultDB = localVaultDB(memoryStore())
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    await vaultDB.writeBundle(bundleOf('u1'))
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
  })

  it("round-trips a lockbox, and reads null where none exists", async () => {
    const vaultDB = localVaultDB(memoryStore())
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
  })

  it("lists summaries sorted by label, with both ciphered fields stripped", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('openai', 'two'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    const summaries = await vaultDB.listBoxes(scopeOf('u1'))
    expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    expect(summaries[0]).to.not.have.property('whisper_ciphered')
    expect(summaries[0]).to.not.have.property('lockbox_key_wrapped')
  })

  it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    await vaultDB.writeBox(scopeOf('u2'), boxOf('anthropic', 'two'))
    const oneBox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
    const twoBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
    expect(oneBox?.revision_id).to.eq('rev-one')
    expect(twoBox?.revision_id).to.eq('rev-two')
    expect(await vaultDB.listBoxes(scopeOf('u2'))).to.have.lengthOf(1)
  })

  it("erases one box without touching its neighbours", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('openai', 'two'))
    await vaultDB.eraseBox(scopeOf('u1'), 'anthropic')
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
  })

  it("eraseVault removes the bundle and every box of that scope, and nothing else", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBundle(bundleOf('u1'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    await vaultDB.writeBundle(bundleOf('u2'))
    await vaultDB.writeBox(scopeOf('u2'), boxOf('anthropic', 'two'))
    await vaultDB.eraseVault(scopeOf('u1'))
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    expect(await vaultDB.readBundle(scopeOf('u2'))).to.not.be.null
    expect(await vaultDB.readBox(scopeOf('u2'), 'anthropic')).to.not.be.null
  })

  it("refuses a mangled row with kind 'corrupt_record', quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write('vault:acme:u1:main', '{"format":"not-a-vault","shhh":"SUPERSECRET"}')
    let refusal: unknown = null
    try { await vaultDB.readBundle(scopeOf('u1')) } catch (err) { refusal = err }
    expect(refusal).to.be.instanceOf(VaultError)
    expect((refusal as VaultError).kind).to.eq('corrupt_record')
    expect((refusal as VaultError).message).to.not.include('SUPERSECRET')
  })

  it("refuses a record that names a scope or label other than the one asked for", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    // A u2 bundle smuggled into u1's slot, and a lockbox row moved under another label.
    store.write('vault:acme:u1:main', JSON.stringify(bundleOf('u2')))
    await expect(vaultDB.readBundle(scopeOf('u1'))).rejects.toThrow(/different app, user, or vault/)
    store.write('box:acme:u1:main:other_box', JSON.stringify(boxOf('anthropic', 'one')))
    await expect(vaultDB.readBox(scopeOf('u1'), 'other_box')).rejects.toThrow(/different boxlabel/)
  })
})

/**
 * The smallest honest adapter: a Map of records and nothing else. What an adapter author writes;
 * the compound verbs below come from the base class.
 */
class MapVaultDB extends VaultDB {
  readonly bundles = new Map<string, VaultBundle>()
  readonly lockboxes = new Map<string, Lockbox>()
  private path(scope: VaultScope) { return `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}` }

  protected fetchBundle(scope: VaultScope) { return Promise.resolve(this.bundles.get(this.path(scope)) ?? null) }
  protected saveBundle(bundle: VaultBundle) { this.bundles.set(this.path(bundle), bundle); return Promise.resolve() }
  protected trashBundle(scope: VaultScope) { this.bundles.delete(this.path(scope)); return Promise.resolve() }
  protected fetchBox(scope: VaultScope, boxlabel: string) { return Promise.resolve(this.lockboxes.get(`${this.path(scope)}:${boxlabel}`) ?? null) }
  protected saveBox(scope: VaultScope, lockbox: Lockbox) { this.lockboxes.set(`${this.path(scope)}:${lockbox.boxlabel}`, lockbox); return Promise.resolve() }
  protected trashBox(scope: VaultScope, boxlabel: string) { this.lockboxes.delete(`${this.path(scope)}:${boxlabel}`); return Promise.resolve() }
  protected fetchBoxes(scope: VaultScope) {
    return Promise.resolve([...this.lockboxes].filter(([ckey]) => ckey.startsWith(`${this.path(scope)}:`)).map(([, lockbox]) => lockbox))
  }
}

describe("the abstract VaultDB, over seven primitives", () => {
  it("composes listBoxes and eraseVault from the primitives alone", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.writeBundle(bundleOf('u1'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('openai', 'two'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'one'))
    const summaries = await vaultDB.listBoxes(scopeOf('u1'))
    expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    await vaultDB.eraseVault(scopeOf('u1'))
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    expect(vaultDB.lockboxes.size).to.eq(0)
  })

  it("createBundle creates against emptiness, and yields to a bundle already standing", async () => {
    const vaultDB = new MapVaultDB()
    const first = bundleOf('u1')
    const second = { ...bundleOf('u1'), vault_id: 'the-second-arrival' }
    expect(await vaultDB.createBundle(first)).to.deep.equal(first)
    // A second creation (another device racing) gets the standing bundle back, not its own.
    expect(await vaultDB.createBundle(second)).to.deep.equal(first)
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(first)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", () => {
    const vaultDB = new MapVaultDB()
    const unsubscribe = vaultDB.subscribe(scopeOf('u1'), () => { throw new Error('never rings') })
    expect(unsubscribe).to.be.a('function')
    unsubscribe()
  })

  it("validates what the primitives return: a wrong-shaped record is refused, not repaired", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.bundles.set('acme:u1:main', { format: 'not-a-vault' } as unknown as VaultBundle)
    let refusal: unknown = null
    try { await vaultDB.readBundle(scopeOf('u1')) } catch (err) { refusal = err }
    expect(refusal).to.be.instanceOf(VaultError)
    expect((refusal as VaultError).kind).to.eq('corrupt_record')
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.bundles.size).to.eq(1)
  })
})
