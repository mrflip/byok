import { describe, expect, expectTypeOf, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { Client, Pool, PoolClient } from 'pg'
import { VaultError, memoryDeviceDB, openVault } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

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

  it("declares a mebibyte to a record, and no limit to a vault", () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1' })
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
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
    expect(second.getSnapshot().boxes.map((box) => box.note)).to.deep.equal(['work account', null])
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
    it(`${verb} on another user's vault refuses with not_permitted, and asks the database nothing`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', listen: TH.listenOn(db) })
      const refusal = await TH.refusalOf(call(vaultDB))
      expect(refusal).to.be.instanceOf(VaultError)
      expect(refusal.kind).to.eq('not_permitted')
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
    it(`refuses every vault while no one is signed in (a userId ${blurb}), with not_permitted`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId })
      const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
      expect(refusal.kind).to.eq('not_permitted')
      expect(refusal.message).to.include('No one is signed in')
      expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('kind', 'not_permitted')
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
      unlock_epoch: 1,
      unlocks:          TH.bundleOf('u1').unlocks,
      registered_at:    Date.UTC(2026, 9, 14),
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
    const refusal = await TH.refusalOf(postgresVaultDB({ client: spy.client, userId: 'u1' }).listBoxRecords({ ...u1, vaultlabel: 'not-a-label' }))
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
    const bare = new PGlite()
    const refusal = await TH.refusalOf(postgresVaultDB({ client: bare, userId: 'u1' }).readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
    await bare.close()
  })

  it("refuses a first lockbox write whose bundle went between the statement's read and its insert, as stale_write", async () => {
    const db = await TH.emptyDatabase()
    const foreignKeyRefused = Object.assign(new Error('violates foreign key constraint'), { code: '23503' })
    const spy = TH.spyClient(db, (text) => (text.startsWith('INSERT INTO safebyok_lockboxes') ? Promise.reject(foreignKeyRefused) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const refusal = await TH.refusalOf(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet))
    expect(refusal.kind).to.eq('stale_write')
  })

  it("refuses any other failure of a first lockbox write as storage_unavailable", async () => {
    const db = await TH.emptyDatabase()
    const tooBusy = Object.assign(new Error('too many connections'), { code: '53300' })
    const spy = TH.spyClient(db, (text) => (text.startsWith('INSERT INTO safebyok_lockboxes') ? Promise.reject(tooBusy) : undefined))
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
    const unsubscribe = TH.requestFor(db, longUserId).subscribe(TH.scopeOf(longUserId), onChange)
    await TH.wakeupAtNextTick()
    await TH.requestFor(db, longUserId).createBundle(TH.bundleOf(longUserId))
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
