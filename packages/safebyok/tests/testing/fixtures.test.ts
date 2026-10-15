import { describe, expect, it } from 'vitest'
import { localVaultDB, memoryDeviceDB, memoryStore, openVault } from '../../src/index'
import { Ciphered } from '../../src/crypto'
import { boxOf, bundleOf, fakeCiphered, scopeOf, testDeriver } from '../../src/testing'
import { Lockbox, VaultBundle, VaultScope } from '../../src/types'

describe("testDeriver", () => {
  it("opens a vault, deterministic in passphrase and salt", async () => {
    const vault = await openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: testDeriver,
    })
    await vault.unlock('correct horse battery staple')
    await vault.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    await vault.lock()
    await vault.unlock('correct horse battery staple')
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("derives the same bytes from the same passphrase and salt, and others from another", async () => {
    const salt = new Uint8Array(16)
    const once = await testDeriver.deriveKeyBytes('pass', salt)
    expect(await testDeriver.deriveKeyBytes('pass', salt)).to.deep.equal(once)
    expect(await testDeriver.deriveKeyBytes('other', salt)).to.not.deep.equal(once)
  })
})

describe("the fixtures", () => {
  it("fakeCiphered: a shape-valid Ciphered named by its tag", () => {
    expect(fakeCiphered('a1')).to.deep.equal({ cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' })
    expect(Ciphered.safeParse(fakeCiphered('a1')).success).to.be.true
  })

  it("scopeOf: the user's main vault in acme, or the one named", () => {
    expect(scopeOf('u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(scopeOf('u1', 'spare')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' })
    expect(VaultScope.safeParse(scopeOf('u1', 'spare')).success).to.be.true
  })

  it("bundleOf: a shape-valid VaultBundle, with any field overridden", () => {
    expect(VaultBundle.safeParse(bundleOf('u1')).success).to.be.true
    expect(bundleOf('u1', { passphrase_epoch: 2 })).to.deep.equal({ ...bundleOf('u1'), passphrase_epoch: 2 })
  })

  it("boxOf: a shape-valid Lockbox, with any field overridden", () => {
    expect(Lockbox.safeParse(boxOf('anthropic_api_key', 'a1')).success).to.be.true
    expect(boxOf('anthropic_api_key', 'a1').revision_id).to.eq('rev-a1')
    expect(boxOf('anthropic_api_key', 'a1', { note: 'work account' }).note).to.eq('work account')
  })
})
