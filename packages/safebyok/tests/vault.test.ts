import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { ForcePassphraseReentryHours, FarFuture, MaxLockboxes, MaxWhisperBytes, type DeviceUnlock, type VaultScope, type Whisper } from '../src/types'
import { VaultError } from '../src/errors'
import { memoryDeviceDB, type DeviceDB } from '../src/device-db'
import { localVaultDB, type VaultDB } from '../src/vault-db'
import { memoryStore, type StringStore } from '../src/string-store'
import { openVault, type OpenVaultOpts, type Vault } from '../src/vault'
import type { KeyDeriver } from '../src/key-deriver'
import { scopeOf, testDeriver } from '../src/testing'
import * as TH from './test-helpers'

/**
 * A fresh in-memory world: the store behind the vaultDB, both adapters, a steerable clock, and an
 * opener. Unlocks derive through the cheap testDeriver, so the suite is not a benchmark of
 * Argon2id; the real deriver has its own tests in key-deriver.test.ts.
 */
const makeWorld = () => {
  const dbStore = memoryStore()
  const vaultDB = localVaultDB(dbStore)
  const deviceDB = memoryDeviceDB()
  let nowMs = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMs }
  const advance = (byMs: number) => { nowMs += byMs }
  const open = (overrides?: Partial<OpenVaultOpts>) => (
    openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, keyDeriver: testDeriver, ...overrides })
  )
  return { dbStore, vaultDB, deviceDB, clock, advance, open }
}

const HourMs = 60 * 60 * 1000
const SevenDaysMs = 7 * 24 * HourMs

/** Expect `operation` to reject with a VaultError of `kind`; hands the error back for a closer look. */
const expectRefusal = async (operation: Promise<unknown>, kind: VaultError['kind']): Promise<VaultError> => {
  try {
    await operation
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq(kind)
    return err as VaultError
  }
  throw new Error(`expected a VaultError of kind '${kind}', but nothing was thrown`)
}

describe("openVault", () => {
  it("settles into 'absent' against an empty backend, prompting nobody", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("refuses a hyphenated applabel or vaultlabel at the door", async () => {
    const world = makeWorld()
    await expectRefusal(world.open({ applabel: 'not-a-label' }), 'bad_label')
    await expectRefusal(world.open({ vaultlabel: 'not-a-label' }), 'bad_label')
  })

  it("refuses to open without a signed-in user", async () => {
    const world = makeWorld()
    await expectRefusal(world.open({ userId: '' }), 'bad_label')
  })
})

describe("unlock and lock", () => {
  it("the first unlock creates the vault, with that passphrase, unlocked for seven days", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('correct horse battery staple')
    const snapshot = vault.getSnapshot()
    expect(snapshot.state).to.eq('unlocked')
    expect(snapshot.askPassphraseAt).to.eq(world.clock.now() + SevenDaysMs)
  })

  it("a wrong passphrase is refused calmly, changing nothing, and quoting nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('the right passphrase')
    await vault.lock()
    const err = await expectRefusal(vault.unlock('the wrong passphrase'), 'wrong_passphrase')
    expect(err.message).to.not.include('the wrong passphrase')
    expect(err.message).to.not.include('the right passphrase')
    expect(vault.getSnapshot().state).to.eq('locked')
    await vault.unlock('the right passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a passphrase of only whitespace is refused outright", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await expectRefusal(vault.unlock(' '.repeat(3)), 'wrong_passphrase')
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("lock() forgets the unlock on this device too: a reopened handle is locked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    const again = await world.open()
    expect(again.getSnapshot().state).to.eq('locked')
  })
})

describe("the remembered unlock", () => {
  it("spares the passphrase on a later open, within seven days", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    world.advance(6 * 24 * 60 * 60 * 1000)
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    // Genuinely unlocked: a read reaches the box layer ('absent_box'), not the lock ('vault_locked').
    await expectRefusal(later.read('missing'), 'absent_box')
  })

  it("has lapsed by day eight: the next open is locked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    world.advance(SevenDaysMs + 1)
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('locked')
  })

  it("lapses mid-session too: no whisper comes out past the deadline", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    world.advance(SevenDaysMs + 1)
    await expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("lasts ForcePassphraseReentryHours, 168 (seven days), unless told otherwise", () => {
    expect(ForcePassphraseReentryHours * HourMs).to.eq(SevenDaysMs)
  })

  it("lasts the forcePassphraseReentryHours the host chose, and asks again from then", async () => {
    const world = makeWorld()
    const twelveHoursMs = 12 * HourMs
    const vault = await world.open({ forcePassphraseReentryHours: 12 })
    await vault.unlock('pw one')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twelveHoursMs)
    world.advance(twelveHoursMs - 1)
    const justBefore = await world.open({ forcePassphraseReentryHours: 12 })
    expect(justBefore.getSnapshot().state).to.eq('unlocked')
    world.advance(1)
    const onTheHour = await world.open({ forcePassphraseReentryHours: 12 })
    expect(onTheHour.getSnapshot().state).to.eq('locked')
    await expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("takes fractions of an hour, kept as whole milliseconds", async () => {
    const world = makeWorld()
    const quarterHour = await world.open({ forcePassphraseReentryHours: 0.25 })
    await quarterHour.unlock('pw one')
    const fifteenMinutesMs = 15 * 60 * 1000
    expect(quarterHour.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + fifteenMinutesMs)
    const oneThird = await world.open({ deviceDB: memoryDeviceDB(), forcePassphraseReentryHours: 1 / 3 })
    await oneThird.unlock('pw one')
    const twentyMinutesMs = 20 * 60 * 1000
    expect(oneThird.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twentyMinutesMs)
  })

  it("refuses a forcePassphraseReentryHours that is not a span of time above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, -Infinity, NaN, 1e-12, '12', null, true, {}]) {
      await expectRefusal(world.open({ forcePassphraseReentryHours: nonsense as number }), 'bad_option')
    }
  })

  it("says in its refusal that Infinity is welcome", async () => {
    const world = makeWorld()
    const err = await expectRefusal(world.open({ forcePassphraseReentryHours: 0 }), 'bad_option')
    expect(err.message).to.match(/greater than zero/)
    expect(err.message).to.match(/Infinity/)
  })

  describe("with forcePassphraseReentryHours: Infinity", () => {
    it("unlocks, and stays unlocked however long it is left, showing the latest deadline a Date holds", async () => {
      const world = makeWorld()
      const vault = await world.open({ forcePassphraseReentryHours: Infinity })
      await vault.unlock('pw one')
      await vault.store('anthropic', 'sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      expect(FarFuture).to.eq(8.64e15)
      expect(new Date(FarFuture).getTime()).to.eq(FarFuture)
      world.advance(1000 * 365 * 24 * HourMs)
      expect(await vault.read('anthropic')).to.eq('sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("writes the clamped deadline to the device, as a finite number, and a reopen picks it up", async () => {
      const world = makeWorld()
      const vault = await world.open({ forcePassphraseReentryHours: Infinity })
      await vault.unlock('pw one')
      await vault.store('anthropic', 'sk-fake')
      const remembered = await world.deviceDB.readUnlock(scopeOf('u1'))
      expect(remembered?.expires_at).to.eq(FarFuture)
      world.advance(10 * 365 * 24 * HourMs)
      const reopened = await world.open({ forcePassphraseReentryHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('unlocked')
      expect(reopened.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      expect(await reopened.read('anthropic')).to.eq('sk-fake')
    })

    it("ends with lock(), here and on the device", async () => {
      const world = makeWorld()
      const vault = await world.open({ forcePassphraseReentryHours: Infinity })
      await vault.unlock('pw one')
      await vault.lock()
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      await expectRefusal(vault.read('anthropic'), 'vault_locked')
      const reopened = await world.open({ forcePassphraseReentryHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
    })

    it("holds through a passphrase change on this device, with the same deadline", async () => {
      const world = makeWorld()
      const vault = await world.open({ forcePassphraseReentryHours: Infinity })
      await vault.unlock('pw one')
      await vault.changePassphrase('pw one', 'pw two')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      const remembered = await world.deviceDB.readUnlock(scopeOf('u1'))
      expect(remembered?.expires_at).to.eq(FarFuture)
    })
  })

  it("reads a remembered deadline past what a Date holds as the latest one, and refuses an infinite one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const written = await world.deviceDB.readUnlock(scopeOf('u1'))
    if (written === null) { throw new Error('expected a remembered unlock on the device') }
    await world.deviceDB.writeUnlock({ ...written, expires_at: 1e300 })
    const farFuture = await world.open()
    expect(farFuture.getSnapshot().state).to.eq('unlocked')
    expect(farFuture.getSnapshot().askPassphraseAt).to.eq(FarFuture)
    await world.deviceDB.writeUnlock({ ...written, expires_at: Infinity })
    const infinite = await world.open()
    expect(infinite.getSnapshot().state).to.eq('locked')
    expect(await world.deviceDB.readUnlock(scopeOf('u1'))).to.be.null
  })

  it("clamps a huge finite forcePassphraseReentryHours to the same latest deadline", async () => {
    const world = makeWorld()
    for (const huge of [1e12, 1e300, Number.MAX_VALUE]) {
      const vault = await world.open({ deviceDB: memoryDeviceDB(), forcePassphraseReentryHours: huge })
      await vault.unlock('pw one')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
    }
  })

  it("leaves a window that fits before the latest deadline exactly as asked", async () => {
    const world = makeWorld()
    const vault = await world.open({ forcePassphraseReentryHours: 1e6 })
    await vault.unlock('pw one')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + (1e6 * HourMs))
  })
})

const ckeyOf = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

/**
 * A DeviceDB as a host might write its own: rows kept as handed in, and handed back unchecked, so
 * a test can reach in and spoil one the way a damaged store or an older version would.
 */
const uncheckingDeviceDB = () => {
  const rows = new Map<string, unknown>()
  const deviceDB: DeviceDB = {
    readUnlock:  (scope) => Promise.resolve((rows.get(ckeyOf(scope)) ?? null) as DeviceUnlock | null),
    writeUnlock: (unlock) => { rows.set(ckeyOf(unlock), unlock); return Promise.resolve() },
    eraseUnlock: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve() },
    eraseAll:    () => { rows.clear(); return Promise.resolve() },
  }
  /** Rewrite the one stored row through `spoil`. */
  const spoilRow = (spoil: (row: Record<string, unknown>) => unknown) => {
    const [[ckey, row]] = [...rows] as [[string, Record<string, unknown>]]
    rows.set(ckey, spoil(row))
  }
  return { deviceDB, rows, spoilRow }
}

const SpoiledUnlocks = [
  [(row: Record<string, unknown>) => ({ ...row, format: 'byok-unlock-v1' }),     'a record under the format tag before the rename'],
  [(row: Record<string, unknown>) => ({ ...row, expires_at: '99999999999999' }), 'a deadline written as text, which would compare as a number'],
  [(row: Record<string, unknown>) => ({ ...row, expires_at: Infinity }),         'a deadline that never comes'],
  [({ expires_at: _gone, ...row }: Record<string, unknown>) => row,              'a record missing its deadline'],
  [() => 'not a record at all',                                                 'a row that is not a record'],
] as const

describe("the remembered unlock, from a host's own DeviceDB", () => {
  it("is checked by the vault: a sound record spares the passphrase", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    const vault = await world.open({ deviceDB: device.deviceDB })
    await vault.unlock('pw one')
    const later = await world.open({ deviceDB: device.deviceDB })
    expect(later.getSnapshot().state).to.eq('unlocked')
  })

  for (const [spoil, blurb] of SpoiledUnlocks) {
    it(`reads ${blurb} as no remembered unlock, and erases it`, async () => {
      const world = makeWorld()
      const device = uncheckingDeviceDB()
      const vault = await world.open({ deviceDB: device.deviceDB })
      await vault.unlock('pw one')
      device.spoilRow(spoil)
      const later = await world.open({ deviceDB: device.deviceDB })
      expect(later.getSnapshot().state).to.eq('locked')
      expect(later.getSnapshot().askPassphraseAt).to.be.null
      expect(device.rows.size).to.eq(0)
    })
  }
})

const RoundTrips: readonly (readonly [Whisper, string])[] = [
  ["sk-ant-api03-fake",            'a string'],
  [42,                             'a number'],
  [false,                          'a boolean'],
  [["alpha", "beta"],              'an array'],
  [{ apiKey: "fake", tier: 2 },  'an object'],
  [{ orgId: null },                'an object holding a null'],
]

describe("store and read", () => {
  for (const [whisper, blurb] of RoundTrips) {
    it(`round-trips ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.open()
      await vault.unlock('pw')
      await vault.store('the_box', whisper)
      expect(await vault.read('the_box')).to.deep.equal(whisper)
    })
  }

  it("keeps the summary public and the whisper out of it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake', { note: 'personal account' })
    const [summary] = vault.getSnapshot().boxes
    expect(summary?.boxlabel).to.eq('anthropic')
    expect(summary?.note).to.eq('personal account')
    expect(summary).to.not.have.property('whisper')
  })

  it("replacing a whisper keeps created_at and the note, and moves updated_at", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-old', { note: 'keep me' })
    const [before] = vault.getSnapshot().boxes
    world.advance(60_000)
    await vault.store('anthropic', 'sk-new')
    const [after] = vault.getSnapshot().boxes
    expect(await vault.read('anthropic')).to.eq('sk-new')
    expect(after?.note).to.eq('keep me')
    expect(after?.created_at).to.eq(before?.created_at)
    expect(after?.updated_at).to.not.eq(before?.updated_at)
  })

  it("refuses a whisper JSON cannot carry, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const sneaky = { apiKey: 'sk-ant-SUPERSECRET', when: new Date() }
    const err = await expectRefusal(vault.store('the_box', sneaky as unknown as Whisper), 'bad_whisper')
    expect(err.message).to.not.include('SUPERSECRET')
    await expectRefusal(vault.store('the_box', undefined as unknown as Whisper), 'bad_whisper')
    await expectRefusal(vault.store('the_box', null as unknown as Whisper), 'bad_whisper')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("stores a whisper of exactly MaxWhisperBytes, and refuses one byte more, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    // A JSON string is its characters plus two quotes.
    const atLimit = 'x'.repeat(MaxWhisperBytes - 2)
    await vault.store('the_box', atLimit)
    expect(await vault.read('the_box')).to.eq(atLimit)
    const oneOver = `${'x'.repeat(MaxWhisperBytes - 7)}SECRET`
    const err = await expectRefusal(vault.store('the_box', oneOver), 'whisper_too_large')
    expect(err.message).to.not.include('SECRET')
    expect(await vault.read('the_box')).to.eq(atLimit)
  })

  it("counts the limit in bytes, not characters", async () => {
    const world = makeWorld()
    const vault = await world.open({ maxWhisperBytes: 10 })
    await vault.unlock('pw')
    await vault.store('the_box', 'éééé')
    await expectRefusal(vault.store('other_box', 'ééééé'), 'whisper_too_large')
    expect(vault.getSnapshot().boxes.map((summary) => summary.boxlabel)).to.deep.equal(['the_box'])
  })

  it("checks the limit on write only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.open()
    await roomy.unlock('pw')
    await roomy.store('the_box', 'x'.repeat(100))
    roomy.close()
    const tight = await world.open({ maxWhisperBytes: 16 })
    expect(await tight.read('the_box')).to.eq('x'.repeat(100))
    await expectRefusal(tight.store('the_box', 'x'.repeat(100)), 'whisper_too_large')
  })

  it("refuses a maxWhisperBytes over half of what the adapter holds in one record", async () => {
    const world = makeWorld()
    const halfAMebibyte = world.vaultDB.maxRecordBytes / 2
    expect(halfAMebibyte).to.eq(524_288)
    await world.open({ maxWhisperBytes: halfAMebibyte })
    await expectRefusal(world.open({ maxWhisperBytes: halfAMebibyte + 1 }), 'bad_option')
  })

  it("refuses a maxWhisperBytes that is not a whole number of bytes above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await expectRefusal(world.open({ maxWhisperBytes: nonsense }), 'bad_option')
    }
  })

  it("refuses a malformed boxlabel before touching storage", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await expectRefusal(vault.store('not a label', 'whatever'), 'bad_label')
  })

  it("reads of an absent box say which label came up empty", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const err = await expectRefusal(vault.read('nothing_here'), 'absent_box')
    expect(err.message).to.include('nothing_here')
  })
})

/** The stored row of the lockbox `boxlabel`, as the backend holds it. */
const storedRowOf = (world: ReturnType<typeof makeWorld>, boxlabel: string): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(`box:acme:u1:main:${boxlabel}`) ?? 'null') as Record<string, unknown>
)

describe("the note", () => {
  it("is null in the summary of a lockbox that has none: never absent, never undefined", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    const [summary] = vault.getSnapshot().boxes
    expect(summary).to.have.property('note')
    expect(summary?.note).to.be.null
  })

  it("is stored as no field at all when there is none, as it always was", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.store('openai', 'sk-fake', { note: null })
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('note')
    expect(storedRowOf(world, 'openai')).to.not.have.property('note')
  })

  it("null clears a note; leaving it out keeps the one standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-one', { note: 'work account' })
    await vault.store('anthropic', 'sk-two', { note: undefined })
    expect(vault.getSnapshot().boxes[0]?.note).to.eq('work account')
    await vault.store('anthropic', 'sk-three', { note: null })
    expect(vault.getSnapshot().boxes[0]?.note).to.be.null
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('note')
    await vault.store('anthropic', 'sk-four')
    expect(vault.getSnapshot().boxes[0]?.note).to.be.null
  })

  it("takes the 256 characters a stored lockbox holds, and the summary hands back the same", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const longest = 'n'.repeat(256)
    await vault.store('anthropic', 'sk-fake', { note: longest })
    expect(vault.getSnapshot().boxes[0]?.note).to.eq(longest)
  })

  it("refuses a note the stored lockbox could not hold, with kind 'bad_option', writing nothing and quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const tooLong = `sk-ant-SUPERSECRET${'n'.repeat(256)}`
    const err = await expectRefusal(vault.store('anthropic', 'sk-fake', { note: tooLong }), 'bad_option')
    expect(err.message).to.not.include('SUPERSECRET')
    await expectRefusal(vault.store('anthropic', 'sk-fake', { note: 42 as unknown as string }), 'bad_option')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.startsWith('box:'))).to.have.lengthOf(0)
    // The vault is none the worse: it still lists, stores, and opens again.
    await vault.store('anthropic', 'sk-fake', { note: 'fits' })
    const again = await world.open()
    expect(again.getSnapshot().boxes.map((summary) => summary.note)).to.deep.equal(['fits'])
  })
})

/**
 * `vaultDB` declaring `maxVaultBytes` as given, and otherwise itself: the in-tree local adapters
 * set no limit on a vault, and the limit's check wants one that does.
 */
const declaringVaultBytes = (vaultDB: VaultDB, maxVaultBytes: unknown): VaultDB => (
  Object.create(vaultDB, { maxVaultBytes: { value: maxVaultBytes } }) as VaultDB
)

/** Boxlabels in the snapshot, in order. */
const boxlabelsOf = (vault: Vault) => vault.getSnapshot().boxes.map((summary) => summary.boxlabel)

describe("the lockbox limit", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("stores up to maxLockboxes, then refuses a new lockbox as 'vault_full', quoting none of its label", async () => {
    const world = makeWorld()
    const vault = await world.open({ maxLockboxes: 2 })
    await vault.unlock('pw')
    await vault.store('openai', 'sk-fake-one')
    await vault.store('anthropic', 'sk-ant-fake-two')
    const err = await expectRefusal(vault.store('secret_project_x', 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 lockboxes')
    expect(err.message).to.not.include('secret_project_x')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes('secret_project_x'))).to.have.lengthOf(0)
  })

  it("holds MaxLockboxes, 100, unless told otherwise", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    for (let ii = 0; ii < MaxLockboxes; ii++) { await vault.store(`box_${String(ii)}`, `sk-fake-${String(ii)}`) }
    expect(vault.getSnapshot().boxes).to.have.lengthOf(100)
    await expectRefusal(vault.store('one_more', 'sk-fake'), 'vault_full')
  })

  it("never refuses a replacement for room: a full vault still takes a new whisper in a box it holds", async () => {
    const world = makeWorld()
    const vault = await world.open({ maxLockboxes: 1 })
    await vault.unlock('pw')
    await vault.store('openai', 'sk-fake-old')
    await vault.store('openai', 'sk-fake-new')
    expect(await vault.read('openai')).to.eq('sk-fake-new')
  })

  it("an erase makes room for the next new lockbox", async () => {
    const world = makeWorld()
    const vault = await world.open({ maxLockboxes: 1 })
    await vault.unlock('pw')
    await vault.store('openai', 'sk-fake-one')
    await expectRefusal(vault.store('anthropic', 'sk-ant-fake'), 'vault_full')
    await vault.erase('openai')
    await vault.store('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("checks the limit on a new lockbox only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.open()
    await roomy.unlock('pw')
    for (const boxlabel of ['one', 'two', 'three']) { await roomy.store(boxlabel, `sk-fake-${boxlabel}`) }
    roomy.close()
    const tight = await world.open({ maxLockboxes: 2 })
    expect(await tight.read('three')).to.eq('sk-fake-three')
    await tight.store('three', 'sk-fake-replaced')
    await tight.erase('one')
    await expectRefusal(tight.store('four', 'sk-fake-four'), 'vault_full')
    await tight.erase('two')
    await tight.store('four', 'sk-fake-four')
    expect(boxlabelsOf(tight)).to.deep.equal(['four', 'three'])
  })

  it("counts the lockboxes other devices have stored", async () => {
    const world = makeWorld()
    const here = await world.open({ maxLockboxes: 2 })
    await here.unlock('pw')
    const there = await world.open()
    await there.store('openai', 'sk-fake-one')
    await there.store('anthropic', 'sk-ant-fake-two')
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(2) })
    await expectRefusal(here.store('mistral', 'sk-fake-three'), 'vault_full')
  })

  it("catches up with storage before refusing: room another device made unheard is found", async () => {
    const world = makeWorld()
    // This handle hears nothing pushed from storage, so its snapshot falls behind.
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { /* nothing to unsubscribe */ })
    const here = await world.open({ maxLockboxes: 1 })
    await here.unlock('pw')
    await here.store('openai', 'sk-fake-one')
    const there = await world.open()
    await there.erase('openai')
    expect(boxlabelsOf(here)).to.deep.equal(['openai'])
    await here.store('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
  })

  it("opens with the defaults on a backend holding 8 MiB of a vault, as Convex does", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024) })
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("refuses a maxLockboxes and maxWhisperBytes the adapter might not hold together, naming both and its limit", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    const err = await expectRefusal(world.open({ vaultDB, maxLockboxes: 102 }), 'bad_option')
    expect(err.message).to.include('maxLockboxes')
    expect(err.message).to.include('maxWhisperBytes')
    expect(err.message).to.include('8388608 bytes')
    expect(err.message).to.include('at most 101 lockboxes')
  })

  it("lets the host raise either limit while the pair still fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxLockboxes: 1000, maxWhisperBytes: 3000 })
    await world.open({ vaultDB, maxLockboxes: 1, maxWhisperBytes: 500_000 })
    await expectRefusal(world.open({ vaultDB, maxLockboxes: 1000, maxWhisperBytes: 4000 }), 'bad_option')
  })

  it("counts room for each lockbox's other fields, so a vault of tiny whispers cannot be made unerasable", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxLockboxes: 4092, maxWhisperBytes: 1 })
    await expectRefusal(world.open({ vaultDB, maxLockboxes: 4093, maxWhisperBytes: 1 }), 'bad_option')
  })

  it("refuses a maxLockboxes that is not a whole number above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await expectRefusal(world.open({ maxLockboxes: nonsense }), 'bad_option')
    }
  })

  it("refuses an adapter that declares no maxVaultBytes, or no maxRecordBytes", async () => {
    const world = makeWorld()
    for (const undeclared of [undefined, NaN, 0, -1]) {
      const noVaultLimit = await expectRefusal(world.open({ vaultDB: declaringVaultBytes(world.vaultDB, undeclared) }), 'bad_option')
      expect(noVaultLimit.message).to.include('maxVaultBytes')
      const noRecordLimit = Object.create(world.vaultDB, { maxRecordBytes: { value: undeclared } }) as VaultDB
      const err = await expectRefusal(world.open({ vaultDB: noRecordLimit }), 'bad_option')
      expect(err.message).to.include('maxRecordBytes')
    }
  })

  it("says so plainly when not even one lockbox of that maxWhisperBytes fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, world.vaultDB.maxRecordBytes)
    const err = await expectRefusal(world.open({ vaultDB, maxWhisperBytes: 524_288 }), 'bad_option')
    expect(err.message).to.include('not even one lockbox fits')
    expect(err.message).to.not.include('at most 0')
  })
})

describe("while locked", () => {
  it("every whisper-touching operation refuses with kind 'vault_locked'", async () => {
    const world = makeWorld()
    const warm = await world.open()
    await warm.unlock('pw')
    await warm.store('anthropic', 'sk-fake')
    await warm.lock()
    await expectRefusal(warm.read('anthropic'), 'vault_locked')
    await expectRefusal(warm.store('anthropic', 'sk-new'), 'vault_locked')
    await expectRefusal(warm.use('anthropic', (whisper) => whisper), 'vault_locked')
    await expectRefusal(warm.erase('anthropic'), 'vault_locked')
  })

  it("lockbox summaries stay readable: that is what public metadata is for", async () => {
    const world = makeWorld()
    const warm = await world.open()
    await warm.unlock('pw')
    await warm.store('anthropic', 'sk-fake', { note: 'visible while locked' })
    await warm.lock()
    const cold = await world.open()
    expect(cold.getSnapshot().state).to.eq('locked')
    expect(cold.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
  })
})

describe("use", () => {
  it("hands the whisper to the callback and returns its result", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    const shouted = await vault.use('anthropic', (whisper) => (typeof whisper === 'string' ? whisper.toUpperCase() : ''))
    expect(shouted).to.eq('SK-FAKE')
  })

  it("passes an async callback's rejection through untouched", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    await expect(vault.use('anthropic', () => Promise.reject(new Error('the API said no')))).rejects.toThrow('the API said no')
  })
})

describe("erase and destroy", () => {
  it("erase removes the box; a second erase finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.erase('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await expectRefusal(vault.erase('anthropic'), 'absent_box')
  })

  it("destroy removes every trace of this vault, and only this vault", async () => {
    const world = makeWorld()
    const mine = await world.open()
    await mine.unlock('my pw')
    await mine.store('anthropic', 'mine')
    const theirs = await world.open({ userId: 'u2' })
    await theirs.unlock('their pw')
    await theirs.store('anthropic', 'theirs')

    await mine.destroy()
    expect(mine.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes(':u1:'))).to.have.lengthOf(0)
    expect(await theirs.read('anthropic')).to.eq('theirs')
  })

  it("destroy works on a locked vault: owning the account is enough to delete it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.lock()
    await vault.destroy()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("destroy on a vault already gone is quiet: a second destroy finds nothing to refuse", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.destroy()
    await vault.unlock('pw')
    await vault.destroy()
    await vault.destroy()
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.open({ userId: 'u1' })
    await one.unlock('pw one')
    await one.store('anthropic', 'u1-secret')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
    await two.unlock('pw two')
    await two.store('anthropic', 'u2-secret')
    expect(await one.read('anthropic')).to.eq('u1-secret')
    expect(await two.read('anthropic')).to.eq('u2-secret')
  })

  it("one user's remembered unlock opens nothing for another", async () => {
    const world = makeWorld()
    const one = await world.open({ userId: 'u1' })
    await one.unlock('pw one')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
  })
})

describe("the snapshot and its subscribers", () => {
  it("keeps its identity until something changes", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const before = vault.getSnapshot()
    expect(vault.getSnapshot()).to.eq(before)
    await vault.store('anthropic', 'sk-fake')
    expect(vault.getSnapshot()).to.not.eq(before)
  })

  it("tells listeners about unlocks and stores, and unsubscribing silences it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    let heardCount = 0
    const unsubscribe = vault.subscribe(() => { heardCount += 1 })
    await vault.unlock('pw')
    expect(heardCount).to.be.greaterThan(0)
    const heardBefore = heardCount
    unsubscribe()
    await vault.store('anthropic', 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about lockboxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open()
    await there.store('anthropic', 'written elsewhere')
    await vi.waitFor(() => { expect(here.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.store('anthropic', 'sk-ant-api03-fake-but-secret', { note: 'notes are public' })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('notes are public')  // the note is public by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('one_box', 'the same whisper')
    await vault.store('two_box', 'the same whisper')
    const rows = world.dbStore.ckeys().filter((ckey) => ckey.startsWith('box:')).map((ckey) => world.dbStore.read(ckey))
    const [oneRow, twoRow] = rows.map((text) => JSON.parse(text ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
    expect(oneRow?.whisper_ciphered.ciphertext_b64).to.not.eq(twoRow?.whisper_ciphered.ciphertext_b64)
  })
})

describe("tampering", () => {
  it("a lockbox with altered ciphertext refuses to open, and is left as it is", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    const ckey = world.dbStore.ckeys().find((candidate) => candidate.startsWith('box:'))
    const row = JSON.parse(world.dbStore.read(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(ckey ?? '', JSON.stringify(row))
    const err = await expectRefusal(vault.read('anthropic'), 'corrupt_record')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.read(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a lockbox row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('victim_box', 'sk-fake')
    const fromCkey = world.dbStore.ckeys().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.write('box:acme:u1:main:other_box', world.dbStore.read(fromCkey ?? '') ?? '')
    await expectRefusal(vault.read('other_box'), 'corrupt_record')
  })

  it("a bundle that does not parse makes the open itself refuse, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.write('vault:acme:u1:main', '{"format":"not-a-vault"}')
    await expectRefusal(world.open(), 'corrupt_record')
    expect(world.dbStore.read('vault:acme:u1:main')).to.eq('{"format":"not-a-vault"}')
  })
})

describe("changePassphrase", () => {
  it("retires the old passphrase, admits the new, and keeps every lockbox readable", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    await vault.store('anthropic', 'sk-fake')
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no remembered unlock
    await expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("works on a locked vault: the old passphrase is proof enough", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    await vault.lock()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a wrong old passphrase is refused and changes nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('the real passphrase')
    await expectRefusal(vault.changePassphrase('not the passphrase', 'whatever'), 'wrong_passphrase')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('the real passphrase')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a new passphrase of only whitespace is refused outright", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await expectRefusal(vault.changePassphrase('pw', ' '.repeat(3)), 'wrong_passphrase')
  })

  it("refuses on a vault that does not exist yet", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await expectRefusal(vault.changePassphrase('old', 'new'), 'absent_vault')
  })

  it("ends every other device's unlock: theirs lapses on the next look", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('old passphrase')
    const thereDeviceDB = memoryDeviceDB()
    const there = await world.open({ deviceDB: thereDeviceDB })
    await there.unlock('old passphrase')
    expect(there.getSnapshot().state).to.eq('unlocked')

    await here.changePassphrase('old passphrase', 'new passphrase')
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(await thereDeviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.be.null
  })
})

/**
 * A world whose slow waits can be held mid-flight, to land a lock inside an unlock: each `holdNext`
 * arms a gate on the next look at the bundle, passphrase derivation, device-record write, or (to
 * hold a store in hand) read of a lockbox, and hands it back. Its key deriver is its own copy of testDeriver, so a spy on it stays here.
 */
const makeRacingWorld = () => {
  const world = makeWorld()
  const keyDeriver: KeyDeriver = { ...testDeriver }
  const open = (overrides?: Partial<OpenVaultOpts>) => world.open({ keyDeriver, ...overrides })
  const holdNextLook = () => {
    const gate = TH.makeGate()
    const readBundle = world.vaultDB.readBundle.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'readBundle').mockImplementationOnce(async (scope) => {
      await gate.pass()
      return await readBundle(scope)
    })
    return gate
  }
  const holdNextDerive = () => {
    const gate = TH.makeGate()
    vi.spyOn(keyDeriver, 'deriveKeyBytes').mockImplementationOnce(async (passphrase, saltBytes) => {
      await gate.pass()
      return await testDeriver.deriveKeyBytes(passphrase, saltBytes)
    })
    return gate
  }
  const holdNextRemember = () => {
    const gate = TH.makeGate()
    const writeUnlock = world.deviceDB.writeUnlock.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'writeUnlock').mockImplementationOnce(async (unlock) => {
      await gate.pass()
      await writeUnlock(unlock)
    })
    return gate
  }
  const holdNextBoxRead = () => {
    const gate = TH.makeGate()
    const readBox = world.vaultDB.readBox.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'readBox').mockImplementationOnce(async (scope, boxlabel) => {
      await gate.pass()
      return await readBox(scope, boxlabel)
    })
    return gate
  }
  const rememberedUnlock = async () => await world.deviceDB.readUnlock(scopeOf('u1'))
  return { ...world, open, holdNextLook, holdNextDerive, holdNextRemember, holdNextBoxRead, rememberedUnlock }
}

describe("a lock that lands while an unlock is under way", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("during the passphrase check: the lock wins, the unlock throws 'vault_locked', and nothing is remembered", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    const err = await unlocking
    expect(err.message).to.not.include('pw one')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await expectRefusal(vault.read('anything'), 'vault_locked')
    expect(await world.rememberedUnlock()).to.be.null
    // Well within the seven days a remembered unlock would last: the reopen is locked all the same.
    world.advance(HourMs)
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')
  })

  it("an unlock begun after the lock is untouched by it", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMs)
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("on a vault already unlocked: the lock still wins, and leaves it locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    world.advance(HourMs)
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("during the device record's write: the record that lands after the lock's erase is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const gate = world.holdNextRemember()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')
  })

  it("during the look at storage: the lock wins before a first unlock makes the vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const gate = world.holdNextLook()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("during a first unlock's passphrase check: the vault is made, under that passphrase, and stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a destroy() that lands mid-unlock wins the same way, and the vault is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.destroy()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("during changePassphrase(): the passphrase still changes, and the vault stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    await vault.store('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("during changePassphrase()'s device record write: the record is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    const gate = world.holdNextRemember()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})

describe("a vault that moves elsewhere while an unlock is under way", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("destroyed and made anew: the unlock takes up nothing, throws 'vault_locked', and can't seal into the new vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.destroy()
    await there.unlock('pw two')
    await there.store('anthropic', 'sk-ant-fake-new')
    // Let this handle's background refresh, rung by the writes above, bring in the new vault.
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await expectRefusal(vault.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-new')
    await vault.unlock('pw two')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("destroyed and not remade: the unlock takes up nothing, and the vault reads as absent", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.destroy()
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("its passphrase changed: the old passphrase, proven a moment too late, unlocks nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw one')
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.changePassphrase('pw one', 'pw two')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('pw two')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a refresh that brings back the same bundle, unchanged, does not defeat the unlock", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw one')
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await there.store('anthropic', 'sk-ant-fake')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
  })
})

/** A vault made and unlocked, with nothing in it. */
const openUnlocked = async () => {
  const vault = await makeWorld().open()
  await vault.unlock('pw one')
  return vault
}

describe("lockSoon", () => {
  // Only the timers: promises, and vitest's own waits, keep running as they do.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const GraceMs = 5000

  it("closes the entry gate at once: the snapshot reads 'locked', and no whisper comes out", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await expectRefusal(vault.read('anthropic'), 'vault_locked')
    await expectRefusal(vault.store('openai', 'sk-fake-too'), 'vault_locked')
  })

  it("keeps the gate closed through the grace, even if the clock steps back", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon(30)
    world.advance(-10_000)
    await expectRefusal(vault.read('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("forgets the remembered unlock at once: a reopen within the grace asks for the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lockSoon()
    expect(await world.rememberedUnlock()).to.be.null
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')
  })

  it("lets work in hand finish: a store already under way lands within the grace", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.store('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("keeps the key for work in hand while new work is refused at the gate", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.store('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    await expectRefusal(vault.read('anthropic'), 'vault_locked')
    gate.release()
    await storing
  })

  it("drops the vaultKey when the grace runs out: work still in hand after it is refused", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextBoxRead()
    const storing = expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    vi.advanceTimersByTime(GraceMs)
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await expectRefusal(vault.read('anthropic'), 'absent_box')
  })

  it("unlike lock(), which refuses work in hand at its next look", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextBoxRead()
    const storing = expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await storing
  })

  it("defeats an unlock under way when it is called, as lock() does", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("defeats the unlock of a changePassphrase() under way, which still changes the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await expectRefusal(vault.unlock('old passphrase'), 'wrong_passphrase')
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is ended by an unlock within the grace: the new unlock stands past it, remembered", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.unlock('pw one')
    expect(vi.getTimerCount()).to.eq(0)
    vi.advanceTimersByTime(GraceMs * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMs)
    expect(await vault.read('anthropic')).to.eq('sk-fake')
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('old passphrase')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vi.getTimerCount()).to.eq(0)
    vi.advanceTimersByTime(GraceMs * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("loses to an unlock begun within the grace and still under way when it runs out", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    vi.advanceTimersByTime(GraceMs)
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("never lengthens a grace already running, and a shorter one shortens it", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const firstGate = world.holdNextBoxRead()
    const firstStoring = expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await firstGate.reached
    await vault.lockSoon(1)
    await vault.lockSoon(30)
    vi.advanceTimersByTime(1000)
    firstGate.release()
    await firstStoring

    await vault.unlock('pw one')
    const secondGate = world.holdNextBoxRead()
    const secondStoring = expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await secondGate.reached
    await vault.lockSoon(30)
    await vault.lockSoon(1)
    vi.advanceTimersByTime(1000)
    secondGate.release()
    await secondStoring
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("with a grace of 0 is lock(): work in hand is refused, and no timer is left", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const gate = world.holdNextBoxRead()
    const storing = expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon(0)
    expect(vi.getTimerCount()).to.eq(0)
    gate.release()
    await storing
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("on a vault already locked, or never made, leaves it so, with no timer", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('absent')
    await vault.unlock('pw one')
    await vault.lock()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("tells subscribers once, when the gate closes, and not again when the key goes", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    const listener = vi.fn()
    vault.subscribe(listener)
    await vault.lockSoon()
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GraceMs)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is cut short by close(): no timer outlives the handle", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lockSoon(60)
    expect(vi.getTimerCount()).to.eq(1)
    vault.close()
    expect(vi.getTimerCount()).to.eq(0)
    await expectRefusal(vault.lockSoon(), 'vault_closed')
  })

  it("is cut short by lock(), and by destroy()", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lockSoon()
    await vault.lock()
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await vault.lockSoon()
    await vault.destroy()
    expect(vi.getTimerCount()).to.eq(0)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("as the screen-lock recipe calls it, when the tab is hidden", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    // A stand-in for `document`, which Node has not.
    const page = Object.assign(new EventTarget(), { hidden: false })
    page.addEventListener('visibilitychange', () => { if (page.hidden) { void vault.lockSoon() } })
    const listener = vi.fn()
    vault.subscribe(listener)
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(listener).toHaveBeenCalled() })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const AcceptedGraces = [
    [undefined,  'left out, it is five seconds'],
    [0,          'zero is allowed, and means lock() now'],
    [0.5,        'fractions are fine'],
    [60,         'sixty seconds is the longest grace'],
  ] as const

  const RefusedGraces = [
    [60.001,     'past sixty seconds is refused'],
    [-1,         'a negative grace is refused'],
    [NaN,        'NaN is refused'],
    [Infinity,   'Infinity is refused: the key must die'],
    ["5",        'a number in a string is refused'],
    [null,       'null is refused'],
  ] as const

  describe("graceSeconds", () => {
    for (const [grace, blurb] of AcceptedGraces) {
      it(blurb, async () => {
        const vault = await openUnlocked()
        await vault.lockSoon(grace)
        expect(vault.getSnapshot().state).to.eq('locked')
      })
    }
    for (const [grace, blurb] of RefusedGraces) {
      it(blurb, async () => {
        const vault = await openUnlocked()
        const err = await expectRefusal(vault.lockSoon(grace as unknown as number), 'bad_option')
        expect(err.message).to.include('graceSeconds')
        expect(vault.getSnapshot().state).to.eq('unlocked')
      })
    }
  })
})

describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const alienDeriver = { ...testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<OpenVaultOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("refuses to open without a keyDeriver, pointing at the browser's defaults", async () => {
    const world = makeWorld()
    const { keyDeriver: _dropped, ...withoutDeriver } = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: world.vaultDB, deviceDB: world.deviceDB, keyDeriver: testDeriver }
    const err = await expectRefusal(openVault(withoutDeriver as OpenVaultOpts), 'bad_option')
    expect(err.message).to.include('keyDeriver')
    expect(err.message).to.include('safebyok/browser')
  })

  it("refuses a keyDeriver that is not one", async () => {
    const world = makeWorld()
    const NotDerivers = [
      null,
      'argon2id_web_v1',
      { key_deriver_label: 'test_digest_v0', salt_bytes: 16 },
      { ...testDeriver, salt_bytes: 0 },
      { ...testDeriver, key_deriver_label: '' },
    ]
    for (const notDeriver of NotDerivers) {
      await expectRefusal(world.open({ keyDeriver: notDeriver as unknown as KeyDeriver }), 'bad_option')
    }
  })

  it("keeps the keyDeriver it was handed, so one whose method lives on its prototype still derives", async () => {
    class PrototypeDeriver implements KeyDeriver {
      readonly key_deriver_label = testDeriver.key_deriver_label
      readonly salt_bytes = testDeriver.salt_bytes
      readonly #inner = testDeriver
      deriveKeyBytes(passphrase: string, saltBytes: Uint8Array) { return this.#inner.deriveKeyBytes(passphrase, saltBytes) }
    }
    const world = makeWorld()
    const vault = await world.open({ keyDeriver: new PrototypeDeriver() })
    await vault.unlock('pw')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})

describe("close", () => {
  it("a closed handle refuses everything thereafter", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    vault.close()
    await expectRefusal(vault.read('anything'), 'vault_closed')
    await expectRefusal(vault.unlock('pw'), 'vault_closed')
  })

  it("an unlock under way when the handle closes takes nothing up, remembers nothing, and throws 'vault_closed'", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.rememberedUnlock()).to.be.null
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')
    vi.restoreAllMocks()
  })

  it("a close during the unlock's device record write: the record is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.lock()
    const gate = world.holdNextRemember()
    const unlocking = expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.rememberedUnlock()).to.be.null
    vi.restoreAllMocks()
  })

  it("closing forgets nothing stored: the next open still finds the vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.store('anthropic', 'sk-fake')
    vault.close()
    const again = await world.open()
    expect(again.getSnapshot().state).to.eq('unlocked')
    expect(await again.read('anthropic')).to.eq('sk-fake')
  })
})

// The handle a vault keeps between operations must refuse subtle.exportKey; an extractable
// handle may exist only inside an operation about to wrap the vaultKey, dropped on return.
// The closure hides the handle itself, so the suite below watches what each flow asks WebCrypto
// to unwrap: `extractable` is unwrapKey's sixth argument.
const watchUnwraps = () => vi.spyOn(crypto.subtle, 'unwrapKey')
const extractableUnwraps = (spied: ReturnType<typeof watchUnwraps>) => (
  spied.mock.calls.filter((callArgs) => callArgs[5])
)

describe("the session vaultKey is non-extractable", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("creating a vault unwraps only the session handle, never an extractable one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const spied = watchUnwraps()
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(spied.mock.calls).to.have.lengthOf(1)
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("a passphrase unlock asks for exactly one extractable transient, for the device wrap", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.lock()
    const spied = watchUnwraps()
    await vault.unlock('pw one')
    // The non-extractable handle it kept still does the whole job.
    await vault.store('anthropic', 'sk-ant-fake')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("a remembered unlock never makes an extractable handle at all", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    expect(await later.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("changePassphrase asks for exactly one extractable transient, for the new wraps", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.store('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    await vault.changePassphrase('pw one', 'pw two')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })
})

const silence = (): void => undefined
const neverRings = () => silence

// vaultOne's adapter hears no change bells, so it genuinely does not notice vaultTwo's doings
// until it next touches the backend: the stale-device scenario, miniaturized. The reborn vault
// has a new vault_id and its own passphrase.
const rebornWorld = async () => {
  const world = makeWorld()
  const deafStore: StringStore = { ...world.dbStore, subscribe: neverRings }
  const vaultOne = await world.open({ vaultDB: localVaultDB(deafStore) })
  await vaultOne.unlock('pw one')
  await vaultOne.store('anthropic', 'sk-ant-fake-old')
  const vaultTwo = await world.open()
  await vaultTwo.destroy()
  await vaultTwo.unlock('pw two')
  await vaultTwo.store('anthropic', 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("store() is refused by storage as stale, and its retry finds the device relocked, instead of landing in the reborn vault", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("store() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await expectRefusal(vaultOne.store('openai', 'sk-fake-stale'), 'vault_locked')
    expect(vaultTwo.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
  })

  it("erase() is refused by storage as stale, and relocks: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await expectRefusal(vaultOne.erase('anthropic'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("destroy() is refused by storage as stale: the reborn vault survives, and a second destroy() takes it", async () => {
    const { world, vaultOne, vaultTwo } = await rebornWorld()
    await expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    await vaultOne.destroy()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("destroy() aims at the vault seen when it was called, not one a change bell brings in while it runs", async () => {
    const world = makeWorld()
    let meanwhile: (() => Promise<void>) | null = null
    const slowDeviceDB = {
      ...world.deviceDB,
      eraseUnlock: async (scope: Parameters<typeof world.deviceDB.eraseUnlock>[0]) => {
        await world.deviceDB.eraseUnlock(scope)
        const pending = meanwhile
        meanwhile = null
        if (pending !== null) { await pending() }
      },
    }
    const vaultOne = await world.open({ deviceDB: slowDeviceDB })
    await vaultOne.unlock('pw one')
    const vaultTwo = await world.open({ deviceDB: memoryDeviceDB() })
    meanwhile = async () => {
      await vaultTwo.destroy()
      await vaultTwo.unlock('pw two')
      await vaultTwo.store('anthropic', 'sk-ant-fake-new')
      // Let vaultOne's background refreshes, rung by the writes above, settle on the reborn vault.
      await TH.wakeupAtNextTick()
    }
    await expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("changePassphrase() proves against the standing bundle, never burying the reborn one", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await expectRefusal(vaultOne.changePassphrase('pw one', 'pw three'), 'wrong_passphrase')
    await vaultTwo.lock()
    await vaultTwo.unlock('pw two')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("unlock() syncs first: the reborn vault's own passphrase opens it from the stale handle", async () => {
    const { vaultOne } = await rebornWorld()
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    await vaultOne.unlock('pw two')
    expect(await vaultOne.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("store() into a vault destroyed elsewhere, and not remade, is refused and finds it absent", async () => {
    const world = makeWorld()
    const deafStore: StringStore = { ...world.dbStore, subscribe: neverRings }
    const vaultOne = await world.open({ vaultDB: localVaultDB(deafStore) })
    await vaultOne.unlock('pw one')
    const vaultTwo = await world.open()
    await vaultTwo.destroy()
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("destroy() of a vault destroyed elsewhere, and not remade, is refused as stale; a second destroy() is quiet", async () => {
    const world = makeWorld()
    const deafStore: StringStore = { ...world.dbStore, subscribe: neverRings }
    const vaultOne = await world.open({ vaultDB: localVaultDB(deafStore) })
    await vaultOne.unlock('pw one')
    const vaultTwo = await world.open()
    await vaultTwo.destroy()
    await expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    await vaultOne.destroy()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
  })
})

/**
 * Two devices on one vault, and a way to slip `there`'s doings between `here`'s look at storage
 * and its write: `beforeNextWrite` runs once, inside the next call to the verb it names, before
 * the write itself reaches storage. `here` has a vaultDB of its own over the shared store, so
 * `hereDB` sees only its writes, whatever `there` does. `hereOpts` override `here`'s options.
 */
const twoDeviceWorld = async (hereOpts?: Partial<OpenVaultOpts>) => {
  const world = makeWorld()
  const hereDB = localVaultDB(world.dbStore)
  const here = await world.open({ vaultDB: hereDB, ...hereOpts })
  await here.unlock('shared pw')
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  await there.unlock('shared pw')
  const beforeNextWrite = (verb: 'updateBox' | 'updateBundle', meanwhile: () => Promise<void>) => {
    if (verb === 'updateBox') {
      const original = hereDB.updateBox.bind(hereDB)
      vi.spyOn(hereDB, 'updateBox').mockImplementationOnce(async (...args) => {
        await meanwhile()
        await original(...args)
      })
    } else {
      const original = hereDB.updateBundle.bind(hereDB)
      vi.spyOn(hereDB, 'updateBundle').mockImplementationOnce(async (...args) => {
        await meanwhile()
        await original(...args)
      })
    }
  }
  return { world, hereDB, here, there, beforeNextWrite }
}

describe("versioned updates: two devices writing at once", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("a store over a box written meanwhile elsewhere is tried again, and lands over theirs", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await here.store('anthropic', 'sk-ant-fake-mine')
    expect(updateBox).toHaveBeenCalledTimes(2)  // the one that raced, and the retry
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-mine')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(here.getSnapshot().boxes).to.have.lengthOf(1)
  })

  it("each attempt is sealed afresh: the retry carries its own revision and lockboxKey, and the first's is not stored", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await here.store('anthropic', 'sk-ant-fake-mine')
    const [raced, landed] = updateBox.mock.calls.map(([, lockbox]) => lockbox)
    expect(landed?.revision_id).to.not.eq(raced?.revision_id)
    expect(landed?.lockbox_key_wrapped).to.not.deep.eq(raced?.lockbox_key_wrapped)
    const standing = await hereDB.readBox(scopeOf('u1'), 'anthropic')
    expect(standing?.revision_id).to.eq(landed?.revision_id)
  })

  it("a retry takes the note the box now stands with, as the winner left it", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one', { note: 'first' })
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs', { note: 'theirs' }))
    await here.store('anthropic', 'sk-ant-fake-mine')
    expect(here.getSnapshot().boxes[0]?.note).to.eq('theirs')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store that loses every attempt is refused as stale after exactly three, showing the box as it stands", async () => {
    const { hereDB, here, there } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    const original = hereDB.updateBox.bind(hereDB)
    // A rival gets in ahead of each of this device's writes.
    const updateBox = vi.spyOn(hereDB, 'updateBox').mockImplementation(async (...args) => {
      await there.store('anthropic', `sk-ant-fake-theirs-${String(updateBox.mock.calls.length)}`)
      await original(...args)
    })
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-theirs-3')
  })

  it("erase wins across a retry: a store over a box erased meanwhile is refused as stale, the box stays erased, and nothing is tried again", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.erase('anthropic'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('unlocked')
    await expectRefusal(there.read('anthropic'), 'absent_box')
  })

  it("a store of a box that did not exist, and is created meanwhile elsewhere, is tried again over theirs", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await here.store('anthropic', 'sk-ant-fake-mine')
    expect(updateBox).toHaveBeenCalledTimes(2)
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a retry that finds its new box gone again counts the lockboxes afresh: refused as full, nothing written", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld({ maxLockboxes: 2 })
    await here.store('anthropic', 'sk-ant-fake-one')
    // Attempt one reads gemini as absent and room for it; before its write, a rival makes gemini
    // and openai, so the write is refused as stale. Before the retry's read, the rival erases
    // gemini: the retry meets an absent box in a vault already holding its two others.
    beforeNextWrite('updateBox', async () => {
      await there.store('gemini', 'sk-fake-theirs')
      await there.store('openai', 'sk-fake-theirs')
    })
    const original = hereDB.readBox.bind(hereDB)
    const readBox = vi.spyOn(hereDB, 'readBox').mockImplementation(async (...args) => {
      if (readBox.mock.calls.length === 2) { await there.erase('gemini') }
      return await original(...args)
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await expectRefusal(here.store('gemini', 'sk-fake-mine'), 'vault_full')
    expect(readBox).toHaveBeenCalledTimes(2)
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().boxes.map((box) => box.boxlabel)).to.have.members(['anthropic', 'openai'])
  })

  it("a retry that finds the passphrase changed elsewhere finds the device relocked, and writes nothing", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', async () => {
      await there.store('anthropic', 'sk-ant-fake-theirs')
      await there.changePassphrase('shared pw', 'their pw')
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'vault_locked')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().state).to.eq('locked')
    await there.lock()
    await there.unlock('their pw')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("an erase refused as stale is thrown at once, never tried again", async () => {
    const world = makeWorld()
    const deafStore: StringStore = { ...world.dbStore, subscribe: neverRings }
    const hereDB = localVaultDB(deafStore)
    const here = await world.open({ vaultDB: hereDB })
    await here.unlock('pw one')
    await here.store('anthropic', 'sk-ant-fake-old')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.destroy()
    await there.unlock('pw two')
    await there.store('anthropic', 'sk-ant-fake-new')
    const eraseBox = vi.spyOn(hereDB, 'eraseBox')
    await expectRefusal(here.erase('anthropic'), 'stale_write')
    expect(eraseBox).toHaveBeenCalledTimes(1)
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("a passphrase change racing another device's is refused as stale; theirs stands", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBundle', () => there.changePassphrase('shared pw', 'their pw'))
    await expectRefusal(here.changePassphrase('shared pw', 'my pw'), 'stale_write')
    expect(here.getSnapshot().state).to.eq('locked')
    await expectRefusal(here.unlock('my pw'), 'wrong_passphrase')
    await here.unlock('their pw')
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-one')
  })
})
