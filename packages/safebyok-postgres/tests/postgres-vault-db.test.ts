import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { Client, Pool, PoolClient } from 'pg'
import { AnyTextValidators, VaultError, memoryDeviceDB, openVault } from 'safebyok'
import type { VaultDB } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

TH.bootDatabaseFirst()

TH.describeVaultDB('postgresVaultDB over PGlite', async () => {
  const db = await TH.emptyDatabase()
  return TH.perUser((userId) => TH.requestFor(db, userId))
})

const u1 = TH.scopeOf('u1')
const thisVault = { vault_id: 'vault-id-u1' }
const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null }

describe("postgresVaultDB, its options", () => {
  const BadOpts = [
    [null,                                                   'no options at all'],
    [{ userId: 'u1' },                                       'no client'],
    [{ client: {}, userId: 'u1' },                           'a client with no query method'],
    [{ client: { query: 'SELECT 1' }, userId: 'u1' },        'a client whose query is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 42 },  'a userId that is not text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', listen: 'LISTEN' }, 'a listen that is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 0 },        'a maxLockboxes of none'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 2.5 },      'a maxLockboxes that is no whole number'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: '1000' },   'a maxLockboxes that is text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: Infinity }, 'a maxLockboxes of Infinity, which Postgres cannot take as a bigint'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 2 ** 53 },  'a maxLockboxes past the safe integers'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      expect(() => postgresVaultDB(opts as unknown as PostgresVaultDBOpts)).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }

  it("takes a client and a userId, and listen only when it is given", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = postgresVaultDB({ client: db, userId: 'u1' })
    expect(await vaultDB.readBundle(u1)).to.be.null
  })

  it("declares a mebibyte to a record, no limit to a vault's bytes, and 1000 lockboxes to a vault", () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1' })
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(1000)
  })

  it("declares the maxLockboxes it is given, as the README's examples give it", () => {
    const client = TH.failingClient(new Error('unused'))
    expect(postgresVaultDB({ client, userId: 'u1', maxLockboxes: 250 }).maxLockboxes).to.eq(250)
    expect(postgresVaultDB({ client, userId: 'u1', maxLockboxes: 1_200_300_400_500_600 }).maxLockboxes).to.eq(1_200_300_400_500_600)
  })
})

describe("postgresVaultDB, as the README has it", () => {
  it("is made per request, and reads the signed-in user's vault", async () => {
    const db = await TH.emptyDatabase()
    const session = { userId: 'u1' }
    const vaultDB = postgresVaultDB({ client: db, userId: session.userId })
    expect(await vaultDB.readBundle({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })).to.be.null
  })

  it("stores and reads a real vault, made and opened by the core", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: TH.requestFor(db, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
    })
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.store('anthropic_api_key', 'sk-ant-test-not-a-real-key', { note: 'work account' })
    await first.store('openai_api_key', { apiKey: 'sk-test-not-a-real-key', orgId: null })
    first.close()

    const second = await opened()
    await second.unlock('correct horse battery staple')
    expect(await second.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await second.read('openai_api_key')).to.deep.equal({ apiKey: 'sk-test-not-a-real-key', orgId: null })
    expect(second.getSnapshot().boxes.map((box) => box.damaged ? null : box.note)).to.deep.equal(['work account', null])
    await second.erase('openai_api_key')
    expect(second.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    second.close()
  })
})

describe("postgresVaultDB, who may reach a vault", () => {
  const u2 = TH.scopeOf('u2')
  const EveryVerb = [
    ['readBundle',   (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.readBundle(u2)],
    ['createBundle', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.createBundle(TH.bundleOf('u2'))],
    ['updateBundle', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.updateBundle(TH.bundleOf('u2'), { vault_id: 'vault-id-u2', unlock_epoch: 1 })],
    ['readBox',      (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.readBox(u2, 'anthropic')],
    ['listBoxes',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxes(u2)],
    ['listBoxRecords', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxRecords(u2)],
    ['updateBox',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.updateBox(u2, TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null })],
    ['eraseBox',     (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.eraseBox(u2, 'anthropic', { vault_id: 'vault-id-u2' })],
    ['eraseVault',   (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.eraseVault(u2, { vault_id: 'vault-id-u2' })],
    ['subscribe',    (vaultDB: ReturnType<typeof postgresVaultDB>) => new Promise<void>((resolve) => { vaultDB.subscribe(u2, TH.changeCounter().onChange); resolve() })],
  ] as const

  for (const [verb, call] of EveryVerb) {
    it(`${verb} on another user's vault refuses with identity_revoked, and asks the database nothing`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', listen: TH.listenOn(db) })
      const refusal = await TH.refusalOf(call(vaultDB))
      expect(refusal).to.be.instanceOf(VaultError)
      expect(refusal.kind).to.eq('identity_revoked')
      expect(refusal.message).to.include('another user')
      expect(spy.sent).to.have.lengthOf(0)
    })
  }

  const SignedOut = [
    [null,      'null'],
    [undefined, 'undefined'],
    ['',        'empty'],
  ] as const

  for (const [userId, blurb] of SignedOut) {
    it(`refuses every vault while no one is signed in (a userId ${blurb}), with identity_revoked`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId })
      const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
      expect(refusal.kind).to.eq('identity_revoked')
      expect(refusal.message).to.include('No one is signed in')
      expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('kind', 'identity_revoked')
      expect(spy.sent).to.have.lengthOf(0)
    })
  }

  it("never quotes the user in a refusal", async () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'alice@example.test' })
    const refusal = await TH.refusalOf(vaultDB.readBundle(TH.scopeOf('mallory@example.test')))
    expect(String(refusal.message)).to.not.include('alice')
    expect(String(refusal.message)).to.not.include('mallory')
  })
})

describe("postgresVaultDB, what it stores", () => {
  it("stores a bundle a column to a field, its unlock envelopes as one jsonb", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const { rows } = await db.query('SELECT * FROM safebyok_bundles')
    expect(rows).to.deep.equal([{
      applabel:         'acme',
      user_id:          'u1',
      vaultlabel:       'main',
      format:           'safebyok-vault-v1',
      vault_id:         'vault-id-u1',
      unlock_epoch:     1,
      unlocks:          TH.bundleOf('u1').unlocks,
      registered_at:    Date.UTC(2026, 9, 14),
      lockbox_count:    0,
    }])
  })

  it("keeps a bundle's envelopes whole and in their order, through an update", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const unlocks = [TH.envelopeOf('work_phrase'), TH.envelopeOf('home_phrase'), TH.envelopeOf('passphrase')]
    const next = TH.bundleOf('u1', { unlock_epoch: 2, unlocks })
    await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    const standing = await vaultDB.readBundle(u1)
    expect(standing).to.deep.equal(next)
    expect(standing?.unlocks.map((envelope) => envelope.unlocklabel)).to.deep.equal(['work_phrase', 'home_phrase', 'passphrase'])
  })

  it("stores a lockbox a column to a field, beside its vault's scope and vault_id, and no note as null", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const { note: _note, ...noteless } = TH.boxOf('anthropic', 'one')
    await vaultDB.updateBox(u1, noteless, noBoxYet)
    const { rows } = await db.query('SELECT * FROM safebyok_lockboxes')
    expect(rows).to.deep.equal([{
      applabel:            'acme',
      user_id:             'u1',
      vaultlabel:          'main',
      vault_id:            'vault-id-u1',
      format:              'safebyok-lockbox-v1',
      boxlabel:            'anthropic',
      revision_id:         'rev-one',
      lockbox_key_wrapped: TH.fakeCiphered('boxkey-one'),
      whisper_ciphered:    TH.fakeCiphered('whisper-one'),
      note:                null,
      registered_at:       Date.UTC(2026, 9, 14),
      changed_at:          Date.UTC(2026, 9, 14),
    }])
  })

  it("keeps text exactly as written: no unicode normalization, in a note or a user_id", async () => {
    const db = await TH.emptyDatabase()
    // 'é' as e and a combining accent (NFD), beside the precomposed form (NFC), and an emoji.
    const userId = 'café-café'
    const vaultDB = TH.requestFor(db, userId)
    await vaultDB.createBundle(TH.bundleOf(userId))
    const note = 'café \u{1F511} café'
    await vaultDB.updateBox(TH.scopeOf(userId), TH.boxOf('anthropic', 'one', { note }), { vault_id: `vault-id-${userId}`, revision_id: null })
    const lockbox = await vaultDB.readBox(TH.scopeOf(userId), 'anthropic')
    expect(lockbox?.note).to.eq(note)
    expect(await vaultDB.readBundle(TH.scopeOf(userId))).to.deep.equal(TH.bundleOf(userId))
  })

  it("lists lockboxes without asking for their ciphered fields", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.listBoxes(u1)
    const [listing] = spy.sent
    expect(listing?.text).to.include('boxlabel')
    expect(listing?.text).to.not.include('whisper_ciphered')
    expect(listing?.text).to.not.include('lockbox_key_wrapped')
  })

  it("sends every verb as one statement", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBundle({ ...TH.bundleOf('u1'), unlock_epoch: 2 }, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' })
    await vaultDB.readBox(u1, 'anthropic')
    await vaultDB.eraseBox(u1, 'anthropic', thisVault)
    await vaultDB.eraseVault(u1, thisVault)
    expect(spy.sent).to.have.lengthOf(7)
  })

  it("refuses a bundle naming another vault_id than the one it replaces, writing nothing", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const impostor = { ...TH.bundleOf('u1'), vault_id: 'vault-id-impostor', unlock_epoch: 2 }
    // The core's VaultDB refuses it before the adapter's half sees it: no vault ever writes one.
    const refusal = await TH.refusalOf(vaultDB.updateBundle(impostor, { vault_id: 'vault-id-u1', unlock_epoch: 1 }))
    expect(refusal.kind).to.eq('bad_option')
    expect(await vaultDB.readBundle(u1)).to.deep.equal(TH.bundleOf('u1'))
  })

  it("leaves no lockbox standing when its bundle goes: erasing the vault takes them in the same statement", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await db.query('DELETE FROM safebyok_bundles')
    const { rows } = await db.query('SELECT boxlabel FROM safebyok_lockboxes')
    expect(rows).to.have.lengthOf(0)
  })
})

/** The lockbox_count of u1's vault, as the tables' trigger keeps it; null with no bundle. */
const countedForU1 = async (db: PGlite): Promise<number | null> => {
  const { rows } = await db.query<{ lockbox_count: number }>("SELECT lockbox_count FROM safebyok_bundles WHERE user_id = 'u1'")
  return rows[0]?.lockbox_count ?? null
}

/** The boxlabels in u1's vault, as `vaultDB` lists them. */
const boxlabelsIn = async (vaultDB: VaultDB): Promise<string[]> => {
  const listed = await vaultDB.listBoxes(u1)
  return listed.map((box) => box.boxlabel)
}

/** A request for u1 over `db` holding vaults to `maxLockboxes`, its vault made and given those boxlabels. */
const filledTo = async (db: PGlite, maxLockboxes: number, boxlabels: readonly string[]) => {
  const vaultDB = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes })
  await vaultDB.createBundle(TH.bundleOf('u1'))
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(u1, TH.boxOf(boxlabel, `sk-fake-${boxlabel}`), noBoxYet) }
  return vaultDB
}

describe("postgresVaultDB, its lockbox limit", () => {
  it("refuses a new lockbox past maxLockboxes as vault_full, writing nothing and naming no boxlabel", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai', 'anthropic'])
    const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('secret_project_x', 'sk-fake'), noBoxYet), 'vault_full')
    expect(refusal.message).to.include('2 lockboxes')
    expect(refusal.message).to.not.include('secret_project_x')
    expect(await boxlabelsIn(vaultDB)).to.have.members(['openai', 'anthropic'])
    expect(await countedForU1(db)).to.eq(2)
  })

  it("never refuses a replacement for the count", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    const standing = await vaultDB.readBox(u1, 'openai')
    await vaultDB.updateBox(u1, { ...TH.boxOf('openai', 'sk-fake-new'), revision_id: 'rev-new' }, { vault_id: 'vault-id-u1', revision_id: standing?.revision_id ?? null })
    const replaced = await vaultDB.readBox(u1, 'openai')
    expect(replaced?.revision_id).to.eq('rev-new')
    expect(await countedForU1(db)).to.eq(1)
  })

  it("refuses a first write under a boxlabel already taken in a full vault as stale_write, not vault_full: the writer missed a lockbox it would replace", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    const standing = await vaultDB.readBox(u1, 'openai')
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('openai', 'sk-fake-other'), noBoxYet), 'stale_write')
    expect(await vaultDB.readBox(u1, 'openai')).to.deep.equal(standing)
  })

  it("looks afresh before refusing a full vault: a boxlabel the write it waited on stored makes it stale_write, not vault_full", async () => {
    // As a race leaves it: the insert found the vault full by the count it re-read under the lock,
    // while its snapshot of the lockboxes predates the one stored under this boxlabel meanwhile.
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const raced = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 })
    await raced.updateBox(u1, TH.boxOf('anthropic', 'sk-fake-theirs'), noBoxYet)
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.resolve({ rows: [{ landed: false, full: true }] }) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 2 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake-mine'), noBoxYet), 'stale_write')
    expect(spy.sent).to.have.lengthOf(2)
    expect(spy.sent[1]?.params).to.deep.equal(['acme', 'u1', 'main', 'anthropic', 'vault-id-u1', 2])
  })

  it("refuses as stale_write, not vault_full, a full vault given room again before the fresh look: the retry stale_write earns will land", async () => {
    // As a race leaves it: the insert found the vault full, then another device erased a lockbox.
    const db = await TH.emptyDatabase()
    const other = await filledTo(db, 1, ['openai'])
    await other.eraseBox(u1, 'openai', { vault_id: 'vault-id-u1' })
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.resolve({ rows: [{ landed: false, full: true }] }) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 1 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(spy.sent).to.have.lengthOf(2)
  })

  it("refuses as stale_write, not vault_full, a full vault erased before the fresh look", async () => {
    const db = await TH.emptyDatabase()
    const other = await filledTo(db, 1, ['openai'])
    await other.eraseVault(u1, { vault_id: 'vault-id-u1' })
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.resolve({ rows: [{ landed: false, full: true }] }) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 1 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(spy.sent).to.have.lengthOf(2)
  })

  it("refuses vault_full when the fresh look finds the vault still full, with no lockbox under that boxlabel", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 1, ['openai'])
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.resolve({ rows: [{ landed: false, full: true }] }) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 1 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'vault_full')
    expect(spy.sent).to.have.lengthOf(2)
  })

  it("asks nothing more of a first write that lands, or of one that is only stale", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 2 })
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet)
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('mistral', 'sk-fake'), { vault_id: 'vault-id-gone', revision_id: null }), 'stale_write')
    expect(spy.sent).to.have.lengthOf(2)
  })

  it("refuses a first write in a full vault of another vault_id as stale_write: the count is the standing vault's", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), { vault_id: 'vault-id-gone', revision_id: null }), 'stale_write')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['openai'])
  })

  it("makes room with an erase", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'vault_full')
    await vaultDB.eraseBox(u1, 'openai', thisVault)
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet)
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['anthropic'])
  })

  it("lets exactly one of two first writes sent at once take the last place", async () => {
    // PGlite runs one statement at a time, so this holds the outcome, not the race: the race is
    // the row lock's, as InsertBoxSql's comment says.
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai'])
    const outcomes = await Promise.allSettled([
      vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake-one'), noBoxYet),
      postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 }).updateBox(u1, TH.boxOf('mistral', 'sk-fake-two'), noBoxYet),
    ])
    expect(outcomes.map((outcome) => outcome.status)).to.have.members(['fulfilled', 'rejected'])
    expect(await countedForU1(db)).to.eq(2)
  })

  it("holds a vault filled under a higher limit to a lowered one, stranding none of its lockboxes", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 1000, ['openai', 'anthropic', 'mistral'])
    const lowered = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 })
    await TH.expectRefusal(lowered.updateBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    expect(await boxlabelsIn(lowered)).to.have.members(['openai', 'anthropic', 'mistral'])
  })

  it("keeps each vault's count in step with its lockboxes, through every verb and the host's own SQL", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 10, ['openai', 'anthropic'])
    await filledTo(db, 10, [])  // a second createBundle of the same vault changes nothing
    expect(await countedForU1(db)).to.eq(2)
    await vaultDB.eraseBox(u1, 'openai', thisVault)
    await vaultDB.eraseBox(u1, 'never_stored', thisVault)
    expect(await countedForU1(db)).to.eq(1)
    await db.query("DELETE FROM safebyok_lockboxes WHERE boxlabel = 'anthropic'")
    expect(await countedForU1(db)).to.eq(0)
    await vaultDB.updateBundle({ ...TH.bundleOf('u1'), unlock_epoch: 2 }, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    expect(await countedForU1(db)).to.eq(0)
    await vaultDB.eraseVault(u1, thisVault)
    expect(await countedForU1(db)).to.be.null
  })

  it("counts each vault apart, even one user's two", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    const other = { ...u1, vaultlabel: 'other' }
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), vaultlabel: 'other' })
    await vaultDB.updateBox(other, TH.boxOf('openai', 'sk-fake'), noBoxYet)
    const { rows } = await db.query('SELECT vaultlabel, lockbox_count FROM safebyok_bundles ORDER BY vaultlabel')
    expect(rows).to.deep.equal([{ vaultlabel: 'main', lockbox_count: 1 }, { vaultlabel: 'other', lockbox_count: 1 }])
  })

  it("refuses as vault_full a store() its vault's own count let through, when another device filled the vault unheard", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
      // No listen: neither vault hears the other's writes.
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 }),
    })
    const here = await opened()
    await here.unlock('correct horse battery staple')
    await here.store('openai', 'sk-fake-one')
    const there = await opened()
    await there.unlock('correct horse battery staple')
    await there.store('anthropic', 'sk-fake-two')
    expect(here.getSnapshot().boxes).to.have.lengthOf(1)
    const refusal = await TH.expectRefusal(here.store('mistral', 'sk-fake-three'), 'vault_full')
    expect(refusal.message).to.include('its storage keeps')
    here.close()
    there.close()
  })

  it("opens a vault with the smaller of MaxLockboxes and its own, and refuses one asking for more", async () => {
    const db = await TH.emptyDatabase()
    const optsFor = (maxLockboxes?: number) => ({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 3 }), maxLockboxes,
    })
    await TH.expectRefusal(openVault(optsFor(4)), 'bad_option')
    const vault = await openVault(optsFor())
    await vault.unlock('correct horse battery staple')
    for (const boxlabel of ['one', 'two', 'three']) { await vault.store(boxlabel, `sk-fake-${boxlabel}`) }
    const refusal = await TH.expectRefusal(vault.store('four', 'sk-fake-four'), 'vault_full')
    expect(refusal.message).to.include('limit of 3 lockboxes')
    vault.close()
  })
})

describe("postgresVaultDB, listBoxRecords", () => {
  it("lists each lockbox as stored, ciphered fields left out, format kept, a missing note missing", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const { note: _note, ...noteless } = TH.boxOf('openai', 'two')
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, noteless, noBoxYet)
    const records = await vaultDB.listBoxRecords(u1)
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...listed } = TH.boxOf('anthropic', 'one')
    const { lockbox_key_wrapped: _wrappedToo, whisper_ciphered: _cipheredToo, ...listedNoteless } = noteless
    expect(records).to.have.deep.members([listed, listedNoteless])
  })

  it("is what a browser's VaultDB may hand back from its doListBoxes, where listBoxes's summaries are not", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    const [record] = await vaultDB.listBoxRecords(u1)
    expect(record).to.have.property('format', 'safebyok-lockbox-v1')
    const [summary] = await vaultDB.listBoxes(u1)
    expect(summary).to.not.have.property('format')
  })

  it("refuses a malformed scope with bad_label, before the database is asked", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const refusal = await TH.refusalOf(postgresVaultDB({ client: spy.client, userId: 'u1' }).listBoxRecords({ ...u1, vaultlabel: 42 } as never))
    expect(refusal.kind).to.eq('bad_label')
    expect(spy.sent).to.have.lengthOf(0)
  })

  it("refuses driver trouble with storage_unavailable, the driver's error as its cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const refusal = await TH.refusalOf(postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' }).listBoxRecords(u1))
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })
})

describe("postgresVaultDB, in trouble", () => {
  it("refuses with storage_unavailable when the driver fails, its error as the cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const vaultDB = postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' })
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })

  it("refuses with storage_unavailable where the tables were never made", async () => {
    const db = await TH.emptyDatabase()
    const refusal = await TH.refusalOf(postgresVaultDB({ client: TH.tablelessClient(db), userId: 'u1' }).readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
  })

  it("refuses a failure of a first lockbox write as storage_unavailable, a serialization failure among them", async () => {
    const db = await TH.emptyDatabase()
    const tooBusy = Object.assign(new Error('could not serialize access due to concurrent update'), { code: '40001' })
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.reject(tooBusy) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const refusal = await TH.refusalOf(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet))
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(tooBusy)
  })

  it("refuses a row damaged in the database as corrupt_record, leaving it as it is", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await db.query(`UPDATE safebyok_bundles SET unlocks = '"not a list"'::jsonb`)
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal.kind).to.eq('corrupt_record')
    const { rows } = await db.query<{ unlocks: unknown }>('SELECT unlocks FROM safebyok_bundles')
    expect(rows[0]?.unlocks).to.eq('not a list')
  })
})

const throwsClosed = () => { throw new Error('already closed') }
const rejectsClosed = () => Promise.reject(new Error('already closed'))

/** Listens whose unlisten fails, at once or later. */
const UnlistenCases: PostgresListen[] = [() => throwsClosed, () => rejectsClosed]

describe("postgresVaultDB, subscribe", () => {
  it("calls onChange after a write to the vault from another request, and not after its unsubscribe", async () => {
    const db = await TH.emptyDatabase()
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = TH.requestFor(db, 'u1').subscribe(u1, onChange)
    await TH.wakeupAtNextTick()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
    await TH.requestFor(db, 'u1').updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
  })

  it("hears nothing of another user's vault, nor of another vault of the same user", async () => {
    const db = await TH.emptyDatabase()
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = TH.requestFor(db, 'u1').subscribe(u1, onChange)
    await TH.wakeupAtNextTick()
    await TH.requestFor(db, 'u2').createBundle(TH.bundleOf('u2'))
    await TH.requestFor(db, 'u1').createBundle({ ...TH.bundleOf('u1'), ...TH.scopeOf('u1', 'spare') })
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.eventually(() => heard.count > 0)
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("hears an erased vault once, its lockboxes and all, and a create that changed nothing not at all", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'two'), noBoxYet)
    const payloads: string[] = []
    const unlisten = await db.listen(VaultChangeChannel, (payload) => { payloads.push(payload) })
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), vault_id: 'the-second-arrival' })
    await vaultDB.eraseVault(u1, thisVault)
    await TH.eventually(() => payloads.length > 0)
    await TH.wakeupAtNextTick()
    expect(payloads.map((payload) => JSON.parse(payload) as unknown)).to.deep.equal([u1])
    await unlisten()
  })

  it("calls onChange on an empty notification: a scope too long for a payload", async () => {
    const db = await TH.emptyDatabase()
    const longUserId = 'u'.repeat(8000)
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = TH.requestFor(db, longUserId).subscribe(TH.scopeOf(longUserId), onChange, AnyTextValidators)
    await TH.wakeupAtNextTick()
    await TH.requestFor(db, longUserId).createBundle(TH.bundleOf(longUserId), AnyTextValidators)
    await TH.eventually(() => heard.count > 0)
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("never calls without a listen, and its unsubscribe can be called", async () => {
    const db = await TH.emptyDatabase()
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = postgresVaultDB({ client: db, userId: 'u1' }).subscribe(u1, onChange)
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })

  it("listens on the tables' channel, and unlistens once however often it is unsubscribed", () => {
    const calls = { channels: [] as string[], unlistens: 0 }
    const listen: PostgresListen = (channel) => {
      calls.channels.push(channel)
      return () => { calls.unlistens += 1 }
    }
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, TH.changeCounter().onChange)
    expect(calls.channels).to.deep.equal([VaultChangeChannel])
    unsubscribe()
    unsubscribe()
    return TH.eventually(() => calls.unlistens === 1)
  })

  it("ends a listen that settles only after its unsubscribe, as it arrives, and hears nothing meanwhile", async () => {
    const gate = TH.makeGate()
    const calls = { unlistens: 0, notify: (_payload: string) => { /* replaced when listening */ } }
    const listen: PostgresListen = async (_channel, onNotify) => {
      calls.notify = onNotify
      await gate.pass()
      return () => { calls.unlistens += 1 }
    }
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, onChange)
    await gate.reached
    unsubscribe()
    calls.notify(JSON.stringify(u1))
    gate.release()
    await TH.eventually(() => calls.unlistens === 1)
    expect(heard.count).to.eq(0)
  })

  it("refuses a listen that throws at once with storage_unavailable, and lets one that rejects pass quietly", async () => {
    const sudden = new Error('no connection to listen on')
    const throwing: PostgresListen = () => { throw sudden }
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen: throwing })
    expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('kind', 'storage_unavailable')

    const rejecting: PostgresListen = () => Promise.reject(sudden)
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen: rejecting }).subscribe(u1, TH.changeCounter().onChange)
    await TH.wakeupAtNextTick()
    unsubscribe()
    await TH.wakeupAtNextTick()
  })

  it("lets an unlisten that throws or rejects pass quietly", async () => {
    for (const listen of UnlistenCases) {
      const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, TH.changeCounter().onChange)
      expect(unsubscribe).to.not.throw()
      await TH.wakeupAtNextTick()
    }
  })
})

describe("PostgresClient and PostgresListen, as the drivers have them", () => {
  it("is a pg Pool, Client or PoolClient, and a PGlite, as they stand", () => {
    expectTypeOf<Pool>().toExtend<PostgresClient>()
    expectTypeOf<Client>().toExtend<PostgresClient>()
    expectTypeOf<PoolClient>().toExtend<PostgresClient>()
    expectTypeOf<PGlite>().toExtend<PostgresClient>()
  })

  it("takes a PGlite's listen as it stands", () => {
    expectTypeOf<PGlite['listen']>().toExtend<PostgresListen>()
  })
})
