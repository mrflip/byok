import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, argon2idWebV1Deriver } from '../src/key-deriver'

describe("Argon2idWebV1", () => {
  it("carries its keyDeriverLabel, as the stored format records it", () => {
    expect(Argon2idWebV1.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("asks for 64 MiB of memory, counted in KiB", () => {
    expect(Argon2idWebV1.memory_kib).to.eq(65_536)
    expect(Argon2idWebV1.memory_kib * 1024).to.eq(64 * 1024 * 1024)
  })

  it("pins every parameter, leaving nothing for a caller to choose", () => {
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

// These run the real Argon2id at the pinned spec: 64 MiB and three passes each, roughly half a
// second apiece. Slow on purpose -- that slowness is the security property under test's cousin.
describe("argon2idWebV1Deriver", () => {
  it("wears the pinned spec's label and salt size", () => {
    expect(argon2idWebV1Deriver.key_deriver_label).to.eq(Argon2idWebV1.key_deriver_label)
    expect(argon2idWebV1Deriver.salt_bytes).to.eq(Argon2idWebV1.salt_bytes)
  })

  // Three full derivations; a slow CI runner takes several times the local half-second apiece.
  it("derives 32 deterministic bytes, and a different salt lands somewhere else entirely", { timeout: 60_000 }, async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const otherSalt = new Uint8Array(16).fill(8)
    const once = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const again = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const elsewhere = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', otherSalt)
    expect(once).to.have.lengthOf(32)
    expect(once).to.deep.equal(again)
    expect(once).to.not.deep.equal(elsewhere)
  })
})
