import { describe, expect, it } from 'vitest'
import { LockboxSummary, memoryStore } from 'safebyok'
import { boxOf, bundleOf, scopeOf } from 'safebyok/testing'
import { RealPassphrase, RealWhispers, componentTest, openOver, realRecords, vaults } from '../helpers'

const u1 = scopeOf('u1')
const thisVault = { vault_id: 'vault-id-u1' }
const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null }

/** A fresh backend whose `u1` scope holds a bundle, as every lockbox write needs. */
const withBundle = async () => {
  const t = componentTest()
  await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })
  return t
}

/** Every row of both tables, system fields and all: what is really stored. */
const allRows = (t: ReturnType<typeof componentTest>) => t.run(async (ctx) => ({
  bundles:   await ctx.db.query('safebyok_bundles').collect(),
  lockboxes: await ctx.db.query('safebyok_lockboxes').collect(),
}))

describe("getBundle and createBundle", () => {
  it("has no bundle until one is created, then reads it back exactly, with no Convex fields", async () => {
    const t = componentTest()
    expect(await t.query(vaults.getBundle, { scope: u1 })).to.be.null
    expect(await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })).to.deep.equal(bundleOf('u1'))
    expect(await t.query(vaults.getBundle, { scope: u1 })).to.deep.equal(bundleOf('u1'))
  })

  it("keeps the bundle that got in first when a second device creates, and returns it", async () => {
    const t = componentTest()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })
    const latecomer = bundleOf('u1', { vault_id: 'vault-id-latecomer' })
    expect(await t.mutation(vaults.createBundle, { bundle: latecomer })).to.deep.equal(bundleOf('u1'))
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(1)
  })

  it("settles two creations racing on one bundle: the creation race is closed", async () => {
    const t = componentTest()
    const [first, second] = await Promise.all([
      t.mutation(vaults.createBundle, { bundle: bundleOf('u1', { vault_id: 'vault-id-one' }) }),
      t.mutation(vaults.createBundle, { bundle: bundleOf('u1', { vault_id: 'vault-id-two' }) }),
    ])
    expect(first.vault_id).to.eq(second.vault_id)
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(1)
  })

  it("keeps each user's and each vault's bundle apart", async () => {
    const t = componentTest()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })
    expect(await t.query(vaults.getBundle, { scope: scopeOf('u2') })).to.be.null
    expect(await t.query(vaults.getBundle, { scope: scopeOf('u1', 'spare') })).to.be.null
  })

  it("refuses a bundle Convex's validators do not accept, writing nothing", async () => {
    const t = componentTest()
    const { format: _format, ...formatless } = bundleOf('u1')
    await expect(t.mutation(vaults.createBundle, { bundle: formatless as never })).rejects.toThrow(/format/)
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(0)
  })
})

describe("updateBundle", () => {
  const rewrapped = bundleOf('u1', { passphrase_epoch: 2, vault_key_passphrase_wrapped: { cipher_iv_b64: 'iv-new', ciphertext_b64: 'ct-new' } })

  const UpdateCases = [
    // the expectation holds:
    [{ vault_id: 'vault-id-u1', passphrase_epoch: 1 },  true,   'lands while the standing bundle has the expected vault_id and epoch'],
    // it fails:
    [{ vault_id: 'vault-id-u1', passphrase_epoch: 2 },  false,  'refuses when the passphrase changed since it was read'],
    [{ vault_id: 'vault-id-gone', passphrase_epoch: 1 }, false, 'refuses when the vault was made anew since it was read'],
  ] as const

  for (const [expected, landed, blurb] of UpdateCases) {
    it(blurb, async () => {
      const t = await withBundle()
      expect(await t.mutation(vaults.updateBundle, { bundle: rewrapped, expected })).to.eq(landed)
      expect(await t.query(vaults.getBundle, { scope: u1 })).to.deep.equal(landed ? rewrapped : bundleOf('u1'))
    })
  }

  it("refuses when the scope holds no bundle at all, and creates none", async () => {
    const t = componentTest()
    expect(await t.mutation(vaults.updateBundle, { bundle: rewrapped, expected: { vault_id: 'vault-id-u1', passphrase_epoch: 1 } })).to.be.false
    expect(await t.query(vaults.getBundle, { scope: u1 })).to.be.null
  })
})

describe("getBox and updateBox", () => {
  it("has no box until one is written, then reads it back exactly, without its scope columns", async () => {
    const t = await withBundle()
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
    expect(await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })).to.be.true
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a1'))
  })

  it("stores a lockbox without a note with no note field at all, and reads it back so", async () => {
    const t = await withBundle()
    const { note: _note, ...noteless } = boxOf('anthropic_api_key', 'a1')
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: noteless, expected: noBoxYet })
    const { lockboxes } = await allRows(t)
    const [row] = lockboxes
    expect(row).not.to.have.property('note')
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(noteless)
  })

  it("replaces a box whose standing revision is the one expected", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    const landed = await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1' } })
    expect(landed).to.be.true
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a2'))
    const { lockboxes } = await allRows(t)
    expect(lockboxes).to.have.lengthOf(1)
  })

  const StaleCases = [
    [{ vault_id: 'vault-id-u1', revision_id: 'rev-a0' },   'refuses a write from a stale read: another revision stands'],
    [{ vault_id: 'vault-id-u1', revision_id: null },       'refuses a "new box" write when a box already stands'],
    [{ vault_id: 'vault-id-gone', revision_id: 'rev-a1' }, 'refuses a box sealed for a vault since made anew'],
  ] as const

  for (const [expected, blurb] of StaleCases) {
    it(blurb, async () => {
      const t = await withBundle()
      await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
      expect(await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected })).to.be.false
      expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a1'))
    })
  }

  it("refuses to rewrite a box erased since it was read", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })
    const landed = await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1' } })
    expect(landed).to.be.false
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
  })

  it("refuses any box in a scope that holds no bundle, writing nothing", async () => {
    const t = componentTest()
    expect(await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })).to.be.false
    const { lockboxes } = await allRows(t)
    expect(lockboxes).to.have.lengthOf(0)
  })

  it("keeps the same boxlabel in two users' vaults apart", async () => {
    const t = await withBundle()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u2') })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'mine'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: scopeOf('u2'), lockbox: boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null } })
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'mine'))
  })
})

describe("listBoxSummaries", () => {
  it("lists the vault's boxes in boxlabel order, without ciphered fields, keeping format", async () => {
    const t = await withBundle()
    for (const boxlabel of ['openai_api_key', 'anthropic_api_key']) {
      await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf(boxlabel, boxlabel), expected: noBoxYet })
    }
    const listed = await t.query(vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...shell } = boxOf('anthropic_api_key', 'anthropic_api_key')
    expect(listed[0]).to.deep.equal(shell)
  })

  it("lists only this vault's boxes: not another vault's of the same user, nor another user's", async () => {
    const t = await withBundle()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u2') })
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u1', { vaultlabel: 'spare', vault_id: 'vault-id-spare' }) })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'mine'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: scopeOf('u2'), lockbox: boxOf('openai_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null } })
    await t.mutation(vaults.updateBox, { scope: scopeOf('u1', 'spare'), lockbox: boxOf('github_token', 'spare'), expected: { vault_id: 'vault-id-spare', revision_id: null } })
    const listed = await t.query(vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key'])
  })

  it("keeps a user_id holding a colon from reaching another user's rows", async () => {
    const t = componentTest()
    const colonScope = scopeOf('u1:main')
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u1:main') })
    await t.mutation(vaults.updateBox, { scope: colonScope, lockbox: boxOf('anthropic_api_key', 'colon'), expected: { vault_id: 'vault-id-u1:main', revision_id: null } })
    expect(await t.query(vaults.listBoxSummaries, { scope: u1 })).to.deep.equal([])
  })
})

describe("eraseBox", () => {
  it("removes the box whatever revision stands: erase wins over a newer write", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1' } })
    expect(await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })).to.be.true
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
  })

  it("is quiet, and lands, when there is no box to remove", async () => {
    const t = await withBundle()
    expect(await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })).to.be.true
  })

  it("refuses to erase from a vault made anew since it was read, removing nothing", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    expect(await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: { vault_id: 'vault-id-gone' } })).to.be.false
    expect(await t.query(vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses when the scope holds no bundle", async () => {
    const t = componentTest()
    expect(await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })).to.be.false
  })
})

describe("eraseVault", () => {
  it("removes the bundle and every box of the vault, and nothing of any other", async () => {
    const t = await withBundle()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u2') })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('openai_api_key', 'o1'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: scopeOf('u2'), lockbox: boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null } })
    expect(await t.mutation(vaults.eraseVault, { scope: u1, expected: thisVault })).to.be.true
    const rows = await allRows(t)
    expect(rows.bundles.map((row) => row.user_id)).to.deep.equal(['u2'])
    expect(rows.lockboxes.map((row) => row.user_id)).to.deep.equal(['u2'])
  })

  it("refuses to erase a vault made anew since it was read, removing nothing", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    expect(await t.mutation(vaults.eraseVault, { scope: u1, expected: { vault_id: 'vault-id-gone' } })).to.be.false
    const rows = await allRows(t)
    expect(rows.bundles).to.have.lengthOf(1)
    expect(rows.lockboxes).to.have.lengthOf(1)
  })

  it("refuses when the scope holds no bundle", async () => {
    const t = componentTest()
    expect(await t.mutation(vaults.eraseVault, { scope: u1, expected: thisVault })).to.be.false
  })
})

describe("watchVault", () => {
  it("signs an empty scope with nulls and no boxes", async () => {
    const t = componentTest()
    expect(await t.query(vaults.watchVault, { scope: u1 })).to.deep.equal({ vault_id: null, passphrase_epoch: null, boxes: [] })
  })

  it("signs the vault with its bundle's ids and each box's revision, in boxlabel order", async () => {
    const t = await withBundle()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('openai_api_key', 'o1'), expected: noBoxYet })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    expect(await t.query(vaults.watchVault, { scope: u1 })).to.deep.equal({
      vault_id:         'vault-id-u1',
      passphrase_epoch: 1,
      boxes:            [['anthropic_api_key', 'rev-a1'], ['openai_api_key', 'rev-o1']],
    })
  })

  it("changes with every write that lands in the vault, and not with a write elsewhere", async () => {
    const t = await withBundle()
    await t.mutation(vaults.createBundle, { bundle: bundleOf('u2') })
    const signatures = [await t.query(vaults.watchVault, { scope: u1 })]
    const sign = async () => { signatures.push(await t.query(vaults.watchVault, { scope: u1 })) }

    await t.mutation(vaults.updateBox, { scope: scopeOf('u2'), lockbox: boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null } })
    await sign()
    expect(signatures[1]).to.deep.equal(signatures[0])

    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: noBoxYet })
    await sign()
    await t.mutation(vaults.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1' } })
    await sign()
    await t.mutation(vaults.updateBundle, { bundle: bundleOf('u1', { passphrase_epoch: 2 }), expected: { vault_id: 'vault-id-u1', passphrase_epoch: 1 } })
    await sign()
    await t.mutation(vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })
    await sign()
    await t.mutation(vaults.eraseVault, { scope: u1, expected: thisVault })
    await sign()
    const distinct = new Set(signatures.slice(1).map((signature) => JSON.stringify(signature)))
    expect(distinct.size).to.eq(6)
  })
})

describe("a real vault's records", () => {
  it("round-trip exactly, and still open to the passphrase that sealed them", async () => {
    const real = await realRecords('u1')
    const t = componentTest()
    expect(await t.mutation(vaults.createBundle, { bundle: real.bundle })).to.deep.equal(real.bundle)
    for (const { lockbox } of real.boxes) {
      expect(await t.mutation(vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.bundle.vault_id, revision_id: null } })).to.be.true
    }

    // Read back from Convex, and placed where the core keeps them, they open as before.
    const reread = memoryStore()
    reread.write(real.bundleCkey, JSON.stringify(await t.query(vaults.getBundle, { scope: u1 })))
    for (const { ckey, lockbox } of real.boxes) {
      const stored = await t.query(vaults.getBox, { scope: u1, boxlabel: lockbox.boxlabel })
      expect(stored).to.deep.equal(lockbox)
      reread.write(ckey, JSON.stringify(stored))
    }
    const vault = await openOver(reread)
    await vault.unlock(RealPassphrase)
    for (const [boxlabel, { whisper }] of Object.entries(RealWhispers)) {
      expect(await vault.read(boxlabel)).to.deep.equal(whisper)
    }
    vault.close()
  })

  it("list what the core reads as the summaries it lists", async () => {
    const real = await realRecords('u1')
    const t = componentTest()
    await t.mutation(vaults.createBundle, { bundle: real.bundle })
    for (const { lockbox } of real.boxes) {
      await t.mutation(vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.bundle.vault_id, revision_id: null } })
    }
    const vault = await openOver(memoryStoreHolding(real))
    const listed = await t.query(vaults.listBoxSummaries, { scope: u1 })
    // The core's summary strips `format` and nulls a missing note; the listing itself holds neither.
    expect(listed.map((row) => LockboxSummary.parse(row))).to.deep.equal(vault.getSnapshot().boxes)
    vault.close()
  })
})

const memoryStoreHolding = (real: Awaited<ReturnType<typeof realRecords>>) => {
  const store = memoryStore()
  store.write(real.bundleCkey, JSON.stringify(real.bundle))
  for (const { ckey, lockbox } of real.boxes) { store.write(ckey, JSON.stringify(lockbox)) }
  return store
}

// A Convex transaction may read 16 MiB. Listing and signing read the vault once, but erasing it
// reads every lockbox twice (each delete reads its row again), so convexVaultDB declares half of
// that, 8 MiB, as its maxVaultBytes. openVault admits a maxLockboxes only while that many
// lockboxes at maxWhisperBytes each, plus 1 KiB apiece for their other fields, fit in half of the
// 8 MiB: at most 101 of the largest default whisper (40444 bytes of JSON, about 54 KB stored),
// and at most 1365 of 2 KiB whispers. The tests below fill a vault past each, with the longest
// labels and notes, and erase it.

/** A backend whose `u1` vault holds `count` lockboxes, each a whisper of `whisperBytes` and the heaviest public shell. */
const fillVault = async (count: number, whisperBytes: number) => {
  const t = componentTest(true)
  await t.mutation(vaults.createBundle, { bundle: bundleOf('u1') })
  const whisperCiphered = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'c'.repeat(Math.ceil((whisperBytes + 16) * 4 / 3)) }
  const lockboxKeyWrapped = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'k'.repeat(64) }
  // 256 characters of four UTF-8 bytes each: the most a note can weigh.
  const note = '\u{1F512}'.repeat(256)
  for (let ii = 0; ii < count; ii++) {
    const boxlabel = `b${String(ii).padStart(39, '0')}`
    const lockbox = boxOf(boxlabel, crypto.randomUUID(), { whisper_ciphered: whisperCiphered, lockbox_key_wrapped: lockboxKeyWrapped, note })
    await t.mutation(vaults.updateBox, { scope: u1, lockbox, expected: noBoxYet })
  }
  return t
}

/** What listing, watching and erasing the `u1` vault find: each a whole transaction over it. */
const listWatchErase = async (t: ReturnType<typeof componentTest>) => {
  const listed = await t.query(vaults.listBoxSummaries, { scope: u1 })
  const { boxes } = await t.query(vaults.watchVault, { scope: u1 })
  const erased = await t.mutation(vaults.eraseVault, { scope: u1, expected: thisVault })
  const { lockboxes } = await allRows(t)
  return { listedCount: listed.length, watchedCount: boxes.length, erased, leftCount: lockboxes.length }
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, signs and erases 140 of the largest lockboxes, well past the 101 the core admits", async () => {
    const t = await fillVault(140, 40_444)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: 140, watchedCount: 140, erased: true, leftCount: 0 })
  })

  it("lists, signs and erases the 1365 lockboxes of 2 KiB whispers the core admits", async () => {
    const t = await fillVault(1365, 2048)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: 1365, watchedCount: 1365, erased: true, leftCount: 0 })
  }, 30_000)
})
