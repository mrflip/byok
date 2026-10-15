import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, ensureSuppliedSpecKept, type KeyDeriverSpec } from '../src/key-deriver-spec'
import { isVaultError } from '../src/errors'

describe("Argon2idWebV1", () => {
  it("carries its keyDeriverLabel, as the stored format records it", () => {
    expect(Argon2idWebV1.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("asks for 64 MiB of memory, counted in KiB", () => {
    expect(Argon2idWebV1.memory_kib).to.eq(65_536)
    expect(Argon2idWebV1.memory_kib * 1024).to.eq(64 * 1024 * 1024)
  })

  it("pins every parameter, so its label always means the same derivation", () => {
    expect(Argon2idWebV1).to.deep.equal({
      algorithm:         'argon2id',
      key_deriver_label: 'argon2id_web_v1',
      memory_kib:        65_536,
      iterations:        3,
      parallelism:       1,
      salt_bytes:        16,
      output_bytes:      32,
    })
  })

  it("cannot be altered at runtime", () => {
    expect(Argon2idWebV1).to.be.frozen
    expect(() => { Object.assign(Argon2idWebV1, { iterations: 1 }) }).to.throw(TypeError)
  })
})

/** A deriver's function, for the shape: it is never called. */
const derive = () => Promise.resolve(new Uint8Array(32))

describe("ensureSuppliedSpecKept", () => {
  it("passes a deriver carrying a supplied spec whole", () => {
    const standIn = { ...Argon2idWebV1, deriveKeyBytes: derive }
    expect(() => { ensureSuppliedSpecKept(standIn) }).to.not.throw()
  })

  it("passes a deriver whose label is its own, whatever it carries", () => {
    expect(() => { ensureSuppliedSpecKept({ key_deriver_label: 'test_digest_v0', salt_bytes: 1 }) }).to.not.throw()
    expect(() => { ensureSuppliedSpecKept({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', iterations: 9 }) }).to.not.throw()
  })

  const Impostors = [
    [{ key_deriver_label: 'argon2id_web_v1', salt_bytes: 16 },     'the label alone, without the parameters'],
    [{ ...Argon2idWebV1, iterations: 1 },                          'one parameter changed'],
    [{ ...Argon2idWebV1, salt_bytes: '16' },                       'a parameter of the right look but the wrong type'],
    [{ ...Argon2idWebV1, algorithm: undefined },                   'a parameter missing'],
  ] as const

  for (const [impostor, blurb] of Impostors) {
    it(`refuses the supplied label with ${blurb}`, () => {
      expect(() => { ensureSuppliedSpecKept(impostor as unknown as KeyDeriverSpec) })
        .to.throw(/argon2id_web_v1/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
    })
  }
})

// These bounds are the platform's own, not ours: these hold them to it.
describe("the limits a key deriver stands on", () => {
  it("getRandomValues hands out MaxSaltBytes at once, and no more", () => {
    expect(crypto.getRandomValues(new Uint8Array(MaxSaltBytes))).to.have.lengthOf(MaxSaltBytes)
    expect(() => crypto.getRandomValues(new Uint8Array(MaxSaltBytes + 1))).to.throw(DOMException)
  })

  it("a passphraseKey is 32 bytes, the 256 bits of an AES-256 key", () => {
    expect(PassphraseKeyBytes * 8).to.eq(256)
  })
})
