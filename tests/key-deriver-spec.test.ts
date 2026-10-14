import { describe, expect, it } from 'vitest'
import { Argon2idWebV1 } from '../src/key-deriver-spec'

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
