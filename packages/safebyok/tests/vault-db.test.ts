import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, localVaultDB, type BundleExpectation, type EraseExpectation, type LockboxExpectation } from '../src/vault-db'
import { VaultError } from '../src/errors'
import type { Lockbox, VaultBundle, VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'

/**
 * The smallest honest adapter: a Map of records, each check-and-write in one synchronous step.
 * What an adapter author writes; the validation around it comes from the base class.
 */
class MapVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = Infinity
  readonly rows = new Map<string, unknown>()
  private standingBundle(scope: VaultScope) { return this.rows.get(Ckeys.bundle(scope)) as VaultBundle | undefined }

  protected doReadBundle(scope: VaultScope): Promise<unknown> { return Promise.resolve(this.rows.get(Ckeys.bundle(scope)) ?? null) }

  protected doCreateBundle(bundle: VaultBundle) {
    if (! this.rows.has(Ckeys.bundle(bundle))) { this.rows.set(Ckeys.bundle(bundle), bundle) }
    return Promise.resolve(this.rows.get(Ckeys.bundle(bundle)))
  }

  protected doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation) {
    const standing = this.standingBundle(bundle)
    if (standing?.vault_id !== expected.vault_id || standing.unlock_epoch !== expected.unlock_epoch) { return Promise.resolve(false) }
    this.rows.set(Ckeys.bundle(bundle), bundle)
    return Promise.resolve(true)
  }

  protected doReadBox(scope: VaultScope, boxlabel: string) { return Promise.resolve(this.rows.get(Ckeys.box(scope, boxlabel)) ?? null) }

  protected doListBoxes(scope: VaultScope) {
    const isBox = Ckeys.isBoxIn(scope)
    return Promise.resolve([...this.rows].filter(([ckey]) => isBox(ckey)).map(([, row]) => row))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) {
    const standingBox = this.rows.get(Ckeys.box(scope, lockbox.boxlabel)) as Lockbox | undefined
    if (this.standingBundle(scope)?.vault_id !== expected.vault_id || (standingBox?.revision_id ?? null) !== expected.revision_id) {
      return Promise.resolve(false)
    }
    this.rows.set(Ckeys.box(scope, lockbox.boxlabel), lockbox)
    return Promise.resolve(true)
  }

  protected doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation) {
    if (this.standingBundle(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(false) }
    this.rows.delete(Ckeys.box(scope, boxlabel))
    return Promise.resolve(true)
  }

  protected doEraseVault(scope: VaultScope, expected: EraseExpectation) {
    if (this.standingBundle(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(false) }
    const doomed = [...this.rows].map(([ckey]) => ckey).filter(Ckeys.isBoxIn(scope))
    for (const ckey of [...doomed, Ckeys.bundle(scope)]) { this.rows.delete(ckey) }
    return Promise.resolve(true)
  }
}

/**
 * A MapVaultDB in trouble: reading the bundle and subscribing fail as `failure` does; updating a
 * box rejects.
 */
class TroubledVaultDB extends MapVaultDB {
  private readonly failure: () => never

  constructor(failure: () => never) {
    super()
    this.failure = failure
  }

  protected override doReadBundle(): Promise<unknown> { this.failure() }
  protected override doSubscribe(): () => void { this.failure() }
  protected override doUpdateBox(): Promise<boolean> { return Promise.reject(new Error('the backend dropped the connection')) }
}

const unheard = (): void => undefined

TH.describeVaultDB('localVaultDB', () => localVaultDB(memoryStore()))
TH.describeVaultDB('the smallest honest adapter', () => new MapVaultDB())

// The ckeys u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1BundleCkey = '["vault","acme","u1","main"]'
const u1BoxCkey = (boxlabel: string) => `["box","acme","u1","main","${boxlabel}"]`

describe("localVaultDB", () => {
  it("holds a mebibyte in one record, and sets no limit on a vault, in bytes or in lockboxes", () => {
    const vaultDB = localVaultDB(memoryStore())
    expect(vaultDB.maxRecordBytes).to.eq(1_048_576)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(Infinity)
  })

  it("reads rows filed under the colon-joined ckeys of 0.2 and before as absent, and leaves them be", async () => {
    const store = memoryStore()
    store.write('vault:acme:u1:main', JSON.stringify(TH.bundleOf('u1')))
    store.write('box:acme:u1:main:anthropic', JSON.stringify(TH.boxOf('anthropic', 'one')))
    const vaultDB = localVaultDB(store)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(store.ckeys()).to.have.members(['vault:acme:u1:main', 'box:acme:u1:main:anthropic'])
  })

  it("reads lockboxes as written today, with a note and without one, and writes them back the same", async () => {
    // A stored vault is a contract: these rows are byte for byte what store() writes today.
    const store = memoryStore()
    const { note: _note, ...noteless } = TH.boxOf('openai', 'two')
    const notedRow = JSON.stringify(TH.boxOf('anthropic', 'one'))
    const notelessRow = JSON.stringify(noteless)
    expect(notelessRow).to.not.include('note')
    store.write(u1BundleCkey, JSON.stringify(TH.bundleOf('u1')))
    store.write(u1BoxCkey('anthropic'), notedRow)
    store.write(u1BoxCkey('openai'), notelessRow)
    const vaultDB = localVaultDB(store)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((summary) => summary.note)).to.deep.equal(['a test box', null])
    const prev = await vaultDB.readBox(TH.scopeOf('u1'), 'openai')
    expect(prev).to.deep.equal(noteless)
    await vaultDB.updateBox(TH.scopeOf('u1'), noteless, { vault_id: 'vault-id-u1', revision_id: 'rev-two' })
    expect(store.read(u1BoxCkey('openai'))).to.eq(notelessRow)
  })

  it("stores each record as its JSON, under the JSON of its kind and scope", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    expect(store.read(u1BundleCkey)).to.eq(JSON.stringify(TH.bundleOf('u1')))
    expect(store.read(u1BoxCkey('anthropic'))).to.eq(JSON.stringify(TH.boxOf('anthropic', 'one')))
    expect(store.ckeys()).to.have.members([u1BundleCkey, u1BoxCkey('anthropic')])
  })

  it("refuses a mangled row with kind 'corrupt_record', quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write(u1BundleCkey, '{"format":"not-a-vault","shhh":"SUPERSECRET"}')
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.not.include('SUPERSECRET')
  })

  it("refuses a row that is not JSON at all, quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write(u1BoxCkey('anthropic'), 'SUPERSECRET{')
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).rejects.toThrow(/did not read back as JSON/)
  })

  it("refuses a record that names a scope or label other than the one asked for", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    // A u2 bundle smuggled into u1's slot, and a lockbox row moved under another label.
    store.write(u1BundleCkey, JSON.stringify(TH.bundleOf('u2')))
    await expect(vaultDB.readBundle(TH.scopeOf('u1'))).rejects.toThrow(/different app, user, or vault/)
    store.write(u1BoxCkey('other_box'), JSON.stringify(TH.boxOf('anthropic', 'one')))
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'other_box')).rejects.toThrow(/different boxlabel/)
  })

  it("keeps a user whose user_id holds a colon out of another user's listing and erasure", async () => {
    const vaultDB = localVaultDB(memoryStore())
    // User 'u1:main' with vault 'other' stores its rows under the prefix of user 'u1', vault 'main'.
    const colonScope = { applabel: 'acme', user_id: 'u1:main', vaultlabel: 'other' }
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), ...colonScope, vault_id: 'vault-id-colon' })
    await vaultDB.updateBox(colonScope, TH.boxOf('anthropic', 'colon'), { vault_id: 'vault-id-colon', revision_id: null })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    await vaultDB.eraseVault(TH.scopeOf('u1'), TH.thisVault)
    const theirs = await vaultDB.readBox(colonScope, 'anthropic')
    expect(theirs?.revision_id).to.eq('rev-colon')
  })
})

describe("the abstract VaultDB, around an adapter's half", () => {
  it("validates what the adapter returns: a wrong-shaped record is refused, not repaired", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.bundle(TH.scopeOf('u1')), { format: 'not-a-vault' })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("lists a lockbox an earlier version kept with an undefined note, as IndexedDB does, with a null note", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), note: undefined })
    const [summary] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summary).to.have.property('note')
    expect(summary?.note).to.be.null
  })

  it("accepts a listing projected server-side, without ciphered fields, so long as it keeps format", async () => {
    const vaultDB = new MapVaultDB()
    const projected = omit(TH.boxOf('anthropic', 'one'), ['lockbox_key_wrapped', 'whisper_ciphered'])
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), projected)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries[0]?.revision_id).to.eq('rev-one')
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), omit(projected, ['format']))
    await expect(vaultDB.listBoxes(TH.scopeOf('u1'))).rejects.toThrow(/did not read back in a shape/)
  })

  it("turns an adapter's own failure into kind 'storage_unavailable', keeping it as the cause", async () => {
    const outage = new Error('the backend is down')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.cause).to.eq(outage)
    await expect(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet))
      .rejects.toThrow(/could not be reached/)
  })

  it("passes an adapter's own VaultError through untouched: not_permitted stays not_permitted", async () => {
    const forbidden = new VaultError('not_permitted', 'This backend does not let the signed-in user reach that vault.')
    const vaultDB = new TroubledVaultDB(() => { throw forbidden })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'not_permitted')
    expect(refusal).to.eq(forbidden)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", async () => {
    const vaultDB = new MapVaultDB()
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    expect(heardCount).to.eq(0)
    unsubscribe()
  })

  it("turns an adapter's failure to subscribe into kind 'storage_unavailable' as well, keeping it as the cause", () => {
    const outage = new Error('the backend is not connected')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    let refusal: unknown = null
    try { vaultDB.subscribe(TH.scopeOf('u1'), unheard) } catch (err) { refusal = err }
    expect(refusal).to.be.instanceOf(VaultError)
    expect((refusal as VaultError).kind).to.eq('storage_unavailable')
    expect((refusal as VaultError).cause).to.eq(outage)
  })

  it("refuses to subscribe to a malformed scope", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe({ ...TH.scopeOf('u1'), applabel: 'Acme' }, unheard)).to.throw(/vault scope/)
  })

  it("refuses an onChange that is not a function, so no later write meets it", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe(TH.scopeOf('u1'), 'not a listener' as unknown as () => void))
      .to.throw(VaultError, /onChange function/).with.property('kind', 'bad_option')
  })
})

/** Writes a VaultDB refuses before its adapter's half sees them: none is one a vault builds. */
const RefusedWrites = [
  // the records:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), unlock_epoch: 1.5 }),                              'a bundle with a fractional unlock_epoch'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), unlocks: [omit(TH.envelopeOf('passphrase'), ['vault_key_wrapped'])] } as VaultBundle), 'a bundle whose envelope is missing its wrapped vaultKey'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), applabel: 'Acme' }),                               'a bundle whose applabel breaks the label rules'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { note: 'n'.repeat(257) }), TH.noBoxYet), 'a lockbox whose note no read would accept'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { changed_at: 1_792_022_400 }), TH.noBoxYet), 'a lockbox time in epoch seconds'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), undefined as unknown as Lockbox, TH.noBoxYet),               'no lockbox at all'],
  // the expectations:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 0 }),          'a bundle expectation at epoch zero'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1'), undefined as unknown as BundleExpectation),            'no bundle expectation at all'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1' } as LockboxExpectation), 'a lockbox expectation missing its revision_id'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', {} as EraseExpectation),                        'an erase expectation naming no vault'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.eraseVault(TH.scopeOf('u1'), { vault_id: '' }),                                         'an erase expectation naming an empty vault_id'],
  // the two together:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'a bundle update that would change the vault_id'],
] as const

describe("the abstract VaultDB, on the way in", () => {
  for (const [kind, write, blurb] of RefusedWrites) {
    it(`refuses ${blurb} with kind '${kind}', and storage sees nothing`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'))
      const before = [...vaultDB.rows]
      const refusal = await TH.expectRefusal(write(vaultDB), kind)
      expect(refusal).to.be.instanceOf(VaultError)
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("never quotes a record it refuses", async () => {
    const vaultDB = new MapVaultDB()
    const sneaky = TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET'), revision_id: '' })
    const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), sneaky, TH.noBoxYet), 'bad_option')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })

  it("hands its adapter the record as this package writes it: a field it does not know stays behind", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), stray_field: 'x' } as VaultBundle)
    expect(vaultDB.rows.get(u1BundleCkey)).to.deep.equal(TH.bundleOf('u1'))
  })

  it("lets a vault's own writes through untouched: a noteless box, a box replaced, an erase", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const noteless = omit(TH.boxOf('anthropic', 'one'), ['note'])
    await vaultDB.updateBox(TH.scopeOf('u1'), noteless, TH.noBoxYet)
    expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(noteless)
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' })
    await vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', TH.thisVault)
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
  })
})

describe("the abstract VaultDB, listing", () => {
  it("lists a box whose ciphered fields are damaged, leaving read() to refuse it: one damaged box never costs the vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'))
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), whisper_ciphered: { cipher_iv_b64: '' } })
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'))
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).rejects.toThrow(/did not read back in a shape/)
  })
})
