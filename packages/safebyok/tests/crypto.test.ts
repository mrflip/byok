import { describe, expect, it } from 'vitest'
import {
  cipherBinding, cipherBytes, decipherBytes, fromB64,
  makeLocalUnlockKey, makeLockboxKey, makeVaultKey, randomBytes, randomId, toB64, unwrapKeyUnder, wrapKeyUnder,
} from '../src/crypto'
import * as TH from './test-helpers'

const utf8 = (text: string) => new TextEncoder().encode(text)

describe("base64url text", () => {
  it("round-trips bytes exactly", () => {
    const bytes = randomBytes(33)
    expect(fromB64(toB64(bytes))).to.deep.equal(bytes)
  })

  it("refuses text that is not base64url", () => {
    expect(() => fromB64('not/base64url+!')).to.throw(/Unknown letter/)
  })
})

describe("random material", () => {
  it("randomBytes gives the asked-for count, fresh every call", () => {
    expect(randomBytes(16)).to.have.lengthOf(16)
    expect(toB64(randomBytes(16))).to.not.eq(toB64(randomBytes(16)))
  })

  it("randomId mints distinct ids", () => {
    expect(randomId()).to.not.eq(randomId())
  })
})

describe("cipherBinding", () => {
  it("is deterministic in its parts, and different parts never collide", () => {
    const one = cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    const same = cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    const other = cipherBinding('safebyok-vault-v1', 'acme', 'u2', 'main', 'vid', 1, 'vault_key_passphrase_wrapped')
    expect(toB64(one)).to.eq(toB64(same))
    expect(toB64(one)).to.not.eq(toB64(other))
  })

  it("keeps parts apart even when their characters could smear together", () => {
    // A naive join would make ('ab','c') and ('a','bc') the same binding; the encoding must not.
    expect(toB64(cipherBinding('ab', 'c'))).to.not.eq(toB64(cipherBinding('a', 'bc')))
  })
})

describe("cipher and decipher", () => {
  it("round-trips bytes under a binding", async () => {
    const lockboxKey = await makeLockboxKey()
    const binding = cipherBinding('test', 'whisper_ciphered')
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), binding)
    expect(new TextDecoder().decode(await decipherBytes(lockboxKey, ciphered, binding))).to.eq('sk-ant-fake')
  })

  it("never repeats ciphertext or iv for the same plaintext", async () => {
    const lockboxKey = await makeLockboxKey()
    const binding = cipherBinding('test')
    const one = await cipherBytes(lockboxKey, utf8('the same whisper'), binding)
    const two = await cipherBytes(lockboxKey, utf8('the same whisper'), binding)
    expect(one.cipher_iv_b64).to.not.eq(two.cipher_iv_b64)
    expect(one.ciphertext_b64).to.not.eq(two.ciphertext_b64)
  })

  it("refuses a different binding: ciphertext does not travel", async () => {
    const lockboxKey = await makeLockboxKey()
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), cipherBinding('box_a'))
    await expect(decipherBytes(lockboxKey, ciphered, cipherBinding('box_b'))).rejects.toThrow()
  })

  it("refuses altered ciphertext and the wrong key alike", async () => {
    const rightKey = await makeLockboxKey()
    const wrongKey = await makeLockboxKey()
    const binding = cipherBinding('test')
    const ciphered = await cipherBytes(rightKey, utf8('sk-ant-fake'), binding)
    const bent = { ...ciphered, ciphertext_b64: TH.tweakB64(ciphered.ciphertext_b64) }
    await expect(decipherBytes(rightKey, bent, binding)).rejects.toThrow()
    await expect(decipherBytes(wrongKey, ciphered, binding)).rejects.toThrow()
  })
})

describe("wrap and unwrap", () => {
  it("round-trips a lockboxKey under a vaultKey, back as a working, non-extractable key", async () => {
    const vaultKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const binding = cipherBinding('lockbox_key_wrapped')
    const whisperBinding = cipherBinding('whisper_ciphered')
    const ciphered = await cipherBytes(lockboxKey, utf8('sk-ant-fake'), whisperBinding)

    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, binding)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, binding, { extractable: false, usage: ['decrypt'] })
    expect(recovered.extractable).to.be.false
    expect(new TextDecoder().decode(await decipherBytes(recovered, ciphered, whisperBinding))).to.eq('sk-ant-fake')
  })

  it("refuses to unwrap under the wrong key or the wrong binding", async () => {
    const vaultKey = await makeVaultKey()
    const otherKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, cipherBinding('right'))
    await expect(unwrapKeyUnder(otherKey, wrapped, cipherBinding('right'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
    await expect(unwrapKeyUnder(vaultKey, wrapped, cipherBinding('wrong'), { extractable: false, usage: ['decrypt'] })).rejects.toThrow()
  })

  it("a non-extractable unwrap refuses exportKey: the platform keeps the bytes", async () => {
    const vaultKey = await makeVaultKey()
    const lockboxKey = await makeLockboxKey()
    const binding = cipherBinding('lockbox_key_wrapped')
    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, binding)
    const recovered = await unwrapKeyUnder(vaultKey, wrapped, binding, { extractable: false, usage: ['decrypt'] })
    await expect(crypto.subtle.exportKey('raw', recovered)).rejects.toThrow()
  })

  it("a localUnlockKey is born non-extractable, and still wraps and unwraps", async () => {
    const localUnlockKey = await makeLocalUnlockKey()
    expect(localUnlockKey.extractable).to.be.false
    const vaultKey = await makeVaultKey()
    const binding = cipherBinding('vault_key_local_wrapped')
    const wrapped = await wrapKeyUnder(localUnlockKey, vaultKey, binding)
    const recovered = await unwrapKeyUnder(localUnlockKey, wrapped, binding, { extractable: true, usage: ['wrapKey', 'unwrapKey'] })
    expect(recovered).to.be.instanceOf(CryptoKey)
  })
})
