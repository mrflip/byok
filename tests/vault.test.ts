import { describe, expect, it } from 'vitest'
import { SevenDaysMs, type Whisper } from '../src/types'
import { VaultError } from '../src/errors'
import { localDeviceDB } from '../src/device-db'
import { localVaultDB } from '../src/vault-db'
import { memoryStore } from '../src/string-store'
import { openVault, type OpenVaultOpts } from '../src/vault'

/** A fresh in-memory world: both stores, both adapters, a steerable clock, and an opener. */
const makeWorld = () => {
  const dbStore = memoryStore()
  const deviceStore = memoryStore()
  const vaultDB = localVaultDB(dbStore)
  const deviceDB = localDeviceDB(deviceStore)
  let nowMs = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMs }
  const advance = (byMs: number) => { nowMs += byMs }
  const open = (overrides?: Partial<OpenVaultOpts>) => (
    openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, ...overrides })
  )
  return { dbStore, deviceStore, vaultDB, deviceDB, clock, advance, open }
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
    await Promise.resolve()  // let the subscription's refresh settle
    await Promise.resolve()
    expect(here.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
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
