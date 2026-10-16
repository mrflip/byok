import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import { memoryStore } from '../src/string-store'
import { VaultDB, jsonBytes, localVaultDB, type BundleExpectation, type EraseExpectation, type LockboxExpectation, type StoredLockbox } from '../src/vault-db'
import { VaultError } from '../src/errors'
import type { Lockbox, VaultBundle, VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import { DefaultValidators } from '../src/validators'
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

  protected doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const isBox = Ckeys.isBoxIn(scope)
    const listed = [...this.rows].filter(([ckey]) => isBox(ckey)).map(([ckey, row]) => ({ boxlabel: Ckeys.boxlabelOf(ckey), lockbox: row }))
    return Promise.resolve(listed.filter((stored): stored is StoredLockbox => stored.boxlabel !== null))
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
    expect(summaries.map((box) => TH.summaryOf(box)?.note)).to.deep.equal(['a test box', null])
    const prev = await vaultDB.readBox(TH.scopeOf('u1'), 'openai')
    expect(prev).to.deep.equal(noteless)
    await vaultDB.updateBox(TH.scopeOf('u1'), noteless, { vault_id: 'vault-id-u1', revision_id: 'rev-two' })
    expect(store.read(u1BoxCkey('openai'))).to.eq(notelessRow)
  })

  it("lists a row that is not JSON as damaged, under the boxlabel it is stored under, beside the sound ones", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.bundle(scope), JSON.stringify(TH.bundleOf('u1')))
    store.write(Ckeys.box(scope, 'openai'), JSON.stringify(TH.boxOf('openai', 'two')))
    store.write(Ckeys.box(scope, 'anthropic'), '{"not": json')
    const listed = await localVaultDB(store).listBoxes(scope)
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
    expect(listed[1]).to.include({ boxlabel: 'openai', revision_id: 'rev-two', damaged: false })
    // Listed, never repaired: the row is still there for forensics.
    expect(store.read(Ckeys.box(scope, 'anthropic'))).to.eq('{"not": json')
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

/** Records an adapter may hand up from its listing, under the boxlabel each is stored under, and how each lists. */
const ListedRecordCases = [
  // sound:
  ["anthropic",  TH.boxOf('anthropic', 'one'),                               [["anthropic", false]],  'a sound lockbox as its summary'],
  // damaged, listed so they can be erased:
  ["anthropic",  TH.boxOf('other_box', 'one'),                               [["anthropic", true]],   'a record naming another boxlabel as damaged, under the one it is stored under'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), changed_at: 'later' },   [["anthropic", true]],   'a record with a malformed time as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), note: 'n'.repeat(257) }, [["anthropic", true]],   'a record with an overlong note as damaged'],
  ["anthropic",  null,                                                       [["anthropic", true]],   'a null record as damaged'],
  ["anthropic",  'not a lockbox',                                            [["anthropic", true]],   'a record that is not an object as damaged'],
  // stored under a name the checks refuse, so stored under other checks: damaged, and still named
  ["Anthropic",  TH.boxOf('Anthropic', 'one'),                               [["Anthropic", true]],   'a record stored under a boxlabel the checks refuse as damaged, under that name'],
] as const

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
    const [listed] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    const summary = TH.summaryOf(listed)
    expect(summary).to.have.property('note')
    expect(summary?.note).to.be.null
  })

  for (const [boxlabel, record, expected, blurb] of ListedRecordCases) {
    it(`lists ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), boxlabel), record)
      const listed = await vaultDB.listBoxes(TH.scopeOf('u1'), DefaultValidators)
      expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal(expected)
    })
  }

  it("leaves out an entry an adapter hands up without a boxlabel as text, which no verb could name", async () => {
    class UnnamingVaultDB extends MapVaultDB {
      protected override doListBoxes() {
        return Promise.resolve([{ boxlabel: 42, lockbox: TH.boxOf('anthropic', 'one') }] as unknown as StoredLockbox[])
      }
    }
    expect(await new UnnamingVaultDB().listBoxes(TH.scopeOf('u1'))).to.deep.equal([])
  })

  it("accepts a listing projected server-side, without ciphered fields, so long as it keeps format", async () => {
    const vaultDB = new MapVaultDB()
    const projected = omit(TH.boxOf('anthropic', 'one'), ['lockbox_key_wrapped', 'whisper_ciphered'])
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), projected)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(TH.summaryOf(summaries[0])?.revision_id).to.eq('rev-one')
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), omit(projected, ['format']))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
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
    expect(() => vaultDB.subscribe({ ...TH.scopeOf('u1'), applabel: 'Acme' }, unheard, DefaultValidators)).to.throw(VaultError, /applabel/).with.property('kind', 'bad_label')
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
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), applabel: 'Acme' }, DefaultValidators),            'a bundle whose applabel breaks the label rules'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { note: 'n'.repeat(257) }), TH.noBoxYet, DefaultValidators), 'a lockbox whose note no read would accept'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('key\u{D83D}', 'one'), TH.noBoxYet),                  'a lockbox whose boxlabel is half of an emoji, whatever the checks'],
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

/** A host's checks admitting labels in any script and longer notes, as openVault hands them to every verb. */
const AnyScript = {
  applabel:   ZClassic.string().min(1),
  vaultlabel: ZClassic.string().min(1),
  boxlabel:   ZClassic.string().min(1),
  note:       ZClassic.string().max(1000),
}

/** A scope no default check admits. */
const scriptScope = { applabel: 'Acme: אקמה', user_id: 'u1', vaultlabel: 'ราก' } as const

describe("the abstract VaultDB, with the vault's validators", () => {
  it("checks every name with the validators it is handed, so a vault's own labels pass every verb", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), ...scriptScope }, AnyScript)
    await vaultDB.updateBox(scriptScope, TH.boxOf('مفتاح العمل', 'one', { note: 'n'.repeat(500) }), TH.noBoxYet, AnyScript)
    const lockbox = await vaultDB.readBox(scriptScope, 'مفتاح العمل', AnyScript)
    expect(lockbox?.note).to.have.lengthOf(500)
    const summaries = await vaultDB.listBoxes(scriptScope, AnyScript)
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['مفتاح العمل'])
    await vaultDB.eraseBox(scriptScope, 'مفتاح العمل', TH.thisVault, AnyScript)
    vaultDB.subscribe(scriptScope, unheard, AnyScript)()
    await vaultDB.eraseVault(scriptScope, TH.thisVault, AnyScript)
    expect(await vaultDB.readBundle(scriptScope, AnyScript)).to.be.null
  })

  it("checks with ours when handed them, refusing those same names before its adapter's half sees them", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectRefusal(vaultDB.readBundle(scriptScope, DefaultValidators), 'bad_label')
    await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), 'مفتاح العمل', DefaultValidators), 'bad_label')
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('مفتاح العمل', 'one'), TH.noBoxYet, DefaultValidators), 'bad_label')
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("admits any well-formed text when handed none, so a wrapper that forgets the vault's bag refuses nothing the vault passed", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), ...scriptScope })
    await vaultDB.updateBox(scriptScope, TH.boxOf('مفتاح العمل', 'one', { note: 'n'.repeat(500) }), TH.noBoxYet)
    const lockbox = await vaultDB.readBox(scriptScope, 'مفتاح العمل')
    expect(lockbox?.note).to.have.lengthOf(500)
    expect(await vaultDB.listBoxes(scriptScope)).to.have.lengthOf(1)
    await TH.expectRefusal(vaultDB.readBox(scriptScope, 'مفتاح\u{D800}'), 'bad_label')
  })

  it("refuses, as 'corrupt_record', a stored lockbox whose note the validators refuse when read, and lists it as damaged", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { note: 'n'.repeat(500) }), TH.noBoxYet, AnyScript)
    const err = await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic', DefaultValidators), 'corrupt_record')
    expect(err.message).to.include('validators')
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'), DefaultValidators)).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
    // AnyScript admits that note, but no empty boxlabel: a box stored under one lists as damaged.
    const [admitted] = await vaultDB.listBoxes(TH.scopeOf('u1'), AnyScript)
    expect(TH.summaryOf(admitted)?.note).to.have.lengthOf(500)
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), ''), TH.boxOf('', 'two'))
    const listed = await vaultDB.listBoxes(TH.scopeOf('u1'), AnyScript)
    expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['', true], ['anthropic', false]])
  })

  it("refuses, as 'bad_option', a lockbox whose note the validators refuse, writing nothing", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const overlong = TH.boxOf('anthropic', 'one', { note: 'n'.repeat(1001) })
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), overlong, TH.noBoxYet, AnyScript), 'bad_option')
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
  })
})

/** A MapVaultDB holding at most `maxRecordBytes` in one record. */
class SmallRecordVaultDB extends MapVaultDB {
  override readonly maxRecordBytes: number

  constructor(maxRecordBytes: number) {
    super()
    this.maxRecordBytes = maxRecordBytes
  }
}

describe("the abstract VaultDB, weighing a lockbox", () => {
  it("refuses, as 'lockbox_too_large', a lockbox heavier with its scope than its backend holds in one record, writing nothing", async () => {
    const lockbox = TH.boxOf('anthropic', 'one', { note: 'n'.repeat(900) })
    const recordBytes = jsonBytes({ ...TH.scopeOf('u1'), ...lockbox })
    const fits = new SmallRecordVaultDB(recordBytes)
    await fits.createBundle(TH.bundleOf('u1'))
    await fits.updateBox(TH.scopeOf('u1'), lockbox, TH.noBoxYet, AnyScript)
    const tight = new SmallRecordVaultDB(recordBytes - 1)
    await tight.createBundle(TH.bundleOf('u1'))
    const err = await TH.expectRefusal(tight.updateBox(TH.scopeOf('u1'), lockbox, TH.noBoxYet, AnyScript), 'lockbox_too_large')
    expect(err.message).to.include(String(recordBytes))
    expect(err.message).to.not.include('nnnn')
    expect(await tight.readBox(TH.scopeOf('u1'), 'anthropic', AnyScript)).to.be.null
  })
})

describe("jsonBytes", () => {
  const JsonBytesCases = [
    ["",                    2,   'empty text is its two quotes'],
    ["acme",                6,   'ASCII is a byte a character'],
    ["\u{5D0}",             4,   'Hebrew is two bytes a letter'],
    ["\u{E01}",             5,   'Thai is three bytes a letter'],
    ["\u{1F511}",           6,   'a character outside the BMP is four'],
    ["\n",                  4,   'a control character is its escape'],
  ] as const

  for (const [val, expected, blurb] of JsonBytesCases) {
    it(blurb, () => { expect(jsonBytes(val)).to.eq(expected) })
  }
})
