import { describe, expect, it } from 'vitest'
import { localVaultDB, memoryDeviceDB, memoryStore, openVault } from '../src/index'
import { Ciphered } from '../src/crypto'
import { Lockbox, VaultBundle, VaultScope } from '../src/types'
import * as TH from './test-helpers'

const TweakCases = [
  // regular usage:
  ["Zm9v",  "am9v",  'swaps the first character for an a'],
  ["am9v",  "bm9v",  'swaps an a for a b, so the text still differs'],
  ["A",     "a",     'works on a single character'],
  // edge cases:
  ["",      "a",     'blank text comes back as an a'],
] as const

describe("tweakB64", () => {
  for (const [b64, expected, blurb] of TweakCases) {
    it(blurb, () => {
      expect(TH.tweakB64(b64)).to.eq(expected)
    })
  }

  it("never returns what it was given", () => {
    for (const first of 'AaBbZz09-_') {
      expect(TH.tweakB64(`${first}m9v`)).to.not.eq(`${first}m9v`)
    }
  })
})

describe("wakeupAtNextTick", () => {
  it("lets a promise already settled, and a timer already due, run first", async () => {
    const heard: string[] = []
    queueMicrotask(() => { heard.push('microtask') })
    setTimeout(() => { heard.push('timer') }, 0)
    await TH.wakeupAtNextTick()
    heard.push('woke')
    expect(heard).to.deep.equal(['microtask', 'timer', 'woke'])
  })
})

describe("testDeriver", () => {
  it("opens a vault, deterministic in passphrase and salt", async () => {
    const vault = await openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
    })
    await vault.unlock('correct horse battery staple')
    await vault.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    await vault.lock()
    await vault.unlock('correct horse battery staple')
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("derives the same bytes from the same passphrase and salt, and others from another", async () => {
    const salt = new Uint8Array(16)
    const once = await TH.testDeriver.deriveKeyBytes('pass', salt)
    expect(await TH.testDeriver.deriveKeyBytes('pass', salt)).to.deep.equal(once)
    expect(await TH.testDeriver.deriveKeyBytes('other', salt)).to.not.deep.equal(once)
  })
})

describe("the fixtures", () => {
  it("fakeCiphered: a shape-valid Ciphered named by its tag", () => {
    expect(TH.fakeCiphered('a1')).to.deep.equal({ cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' })
    expect(Ciphered.safeParse(TH.fakeCiphered('a1')).success).to.be.true
  })

  it("scopeOf: the user's main vault in acme, or the one named", () => {
    expect(TH.scopeOf('u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(TH.scopeOf('u1', 'spare')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' })
    expect(VaultScope.safeParse(TH.scopeOf('u1', 'spare')).success).to.be.true
  })

  it("bundleOf: a shape-valid VaultBundle, with any field overridden", () => {
    expect(VaultBundle.safeParse(TH.bundleOf('u1')).success).to.be.true
    expect(TH.bundleOf('u1', { passphrase_epoch: 2 })).to.deep.equal({ ...TH.bundleOf('u1'), passphrase_epoch: 2 })
  })

  it("boxOf: a shape-valid Lockbox, with any field overridden", () => {
    expect(Lockbox.safeParse(TH.boxOf('anthropic_api_key', 'a1')).success).to.be.true
    expect(TH.boxOf('anthropic_api_key', 'a1').revision_id).to.eq('rev-a1')
    expect(TH.boxOf('anthropic_api_key', 'a1', { note: 'work account' }).note).to.eq('work account')
  })
})
