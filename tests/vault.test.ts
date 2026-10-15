import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaxWhisperBytes, SevenDaysMs, type Whisper } from '../src/types'
import { VaultError } from '../src/errors'
import { memoryDeviceDB } from '../src/device-db'
import { localVaultDB } from '../src/vault-db'
import { memoryStore, type StringStore } from '../src/string-store'
import { openVault, type OpenVaultOpts } from '../src/vault'
import { testDeriver } from './helpers'

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
    expect(snapshot.expiresAt).to.eq(world.clock.now() + SevenDaysMs)
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
    row.whisper_ciphered.ciphertext_b64 = `A${row.whisper_ciphered.ciphertext_b64.slice(1)}`
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

describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const alienDeriver = { ...testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
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
  it("store() is refused by storage as stale, and relocks, instead of landing in the reborn vault", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("store() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await expectRefusal(vaultOne.store('openai', 'sk-fake-stale'), 'stale_write')
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
      await new Promise((resolve) => { setTimeout(resolve, 0) })
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
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'stale_write')
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
    await expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })
})

/**
 * Two devices on one vault, and a way to slip `there`'s doings between `here`'s look at storage
 * and its write: `beforeNextWrite` runs once, inside the next call to the verb it names, before
 * the write itself reaches storage.
 */
const twoDeviceWorld = async () => {
  const world = makeWorld()
  const here = await world.open()
  await here.unlock('shared pw')
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  await there.unlock('shared pw')
  const beforeNextWrite = (verb: 'updateBox' | 'updateBundle', meanwhile: () => Promise<void>) => {
    if (verb === 'updateBox') {
      const original = world.vaultDB.updateBox.bind(world.vaultDB)
      vi.spyOn(world.vaultDB, 'updateBox').mockImplementationOnce(async (...args) => {
        await meanwhile()
        await original(...args)
      })
    } else {
      const original = world.vaultDB.updateBundle.bind(world.vaultDB)
      vi.spyOn(world.vaultDB, 'updateBundle').mockImplementationOnce(async (...args) => {
        await meanwhile()
        await original(...args)
      })
    }
  }
  return { world, here, there, beforeNextWrite }
}

describe("versioned updates: two devices writing at once", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("a store over a box written meanwhile elsewhere is refused as stale, and shows theirs", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-theirs')
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("a stale store, tried again, lands over what beat it: the retry is the caller's choice", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    await here.store('anthropic', 'sk-ant-fake-mine')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store over a box erased meanwhile elsewhere is refused: erase wins", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.erase('anthropic'))
    await expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
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
