import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/vault-db'
import type { Lockbox, VaultBundle, VaultScope } from '../src/types'

const scopeOf = (userId: string): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel: 'main' })

const bundleOf = (userId: string): VaultBundle => ({
  format:          'byok-stub-vault-v0',
  ...scopeOf(userId),
  stub_passphrase: 'fake-passphrase-for-tests',
  created_at:      '2026-10-14T00:00:00.000Z',
})

const boxOf = (boxlabel: string, whisper: Lockbox['whisper']): Lockbox => ({
  boxlabel,
  whisper,
  note:       'a test box',
  created_at: '2026-10-14T00:00:00.000Z',
  updated_at: '2026-10-14T00:00:00.000Z',
})

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
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'sk-fake'))
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'sk-fake'))
  })

  it("lists summaries sorted by label, without the whisper", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('openai', 'sk-fake-2'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'sk-fake-1'))
    const summaries = await vaultDB.listBoxes(scopeOf('u1'))
    expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    expect(summaries[0]).to.not.have.property('whisper')
  })

  it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'u1-secret'))
    await vaultDB.writeBox(scopeOf('u2'), boxOf('anthropic', 'u2-secret'))
    const oneBox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
    const twoBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
    expect(oneBox?.whisper).to.eq('u1-secret')
    expect(twoBox?.whisper).to.eq('u2-secret')
    expect(await vaultDB.listBoxes(scopeOf('u2'))).to.have.lengthOf(1)
  })

  it("erases one box without touching its neighbours", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'sk-fake-1'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('openai', 'sk-fake-2'))
    await vaultDB.eraseBox(scopeOf('u1'), 'anthropic')
    expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
  })

  it("eraseVault removes the bundle and every box of that scope, and nothing else", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.writeBundle(bundleOf('u1'))
    await vaultDB.writeBox(scopeOf('u1'), boxOf('anthropic', 'u1-secret'))
    await vaultDB.writeBundle(bundleOf('u2'))
    await vaultDB.writeBox(scopeOf('u2'), boxOf('anthropic', 'u2-secret'))
    await vaultDB.eraseVault(scopeOf('u1'))
    expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    expect(await vaultDB.readBundle(scopeOf('u2'))).to.not.be.null
    const keptBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
    expect(keptBox?.whisper).to.eq('u2-secret')
  })

  it("refuses a mangled row rather than returning garbage", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write('vault:acme:u1:main', '{"format":"not-a-vault"}')
    await expect(vaultDB.readBundle(scopeOf('u1'))).rejects.toThrow()
  })
})
