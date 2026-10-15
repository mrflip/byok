import { argon2idAsync } from '@noble/hashes/argon2.js'
import { describe, expect, it } from 'vitest'
import { argon2idDeriver, argon2idWebV1Deriver } from '../src/key-deriver'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, type KeyDeriverSpec } from '../src/key-deriver-spec'
import { VaultError, isVaultError } from '../src/errors'

/** A spec of the host's own, cheap to derive under; no two of its counts alike, so a swap shows. */
const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

/** The deriver's fields without its function: the spec it carries. */
const specOf = ({ deriveKeyBytes: _dropped, ...spec }: { deriveKeyBytes: unknown }) => spec

describe("argon2idDeriver", () => {
  it("carries the whole spec beside its function, frozen", () => {
    const deriver = argon2idDeriver(CheapSpec)
    expect(specOf(deriver)).to.deep.equal(CheapSpec)
    expect(deriver).to.be.frozen
  })

  it("derives exactly what Argon2id derives at the spec's parameters", async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const derived = await argon2idDeriver(CheapSpec).deriveKeyBytes('correct horse battery staple', saltBytes)
    const direct = await argon2idAsync('correct horse battery staple', saltBytes, { m: 64, t: 2, p: 4, dkLen: 32 })
    expect(derived).to.have.lengthOf(32)
    expect(derived).to.deep.equal(direct)
  })

  it("derives differently under each parameter, so none is ignored", async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const variants = [CheapSpec, { ...CheapSpec, memory_kib: 128 }, { ...CheapSpec, iterations: 3 }, { ...CheapSpec, parallelism: 2 }]
    const derived = await Promise.all(variants.map((spec) => argon2idDeriver(spec).deriveKeyBytes('pw', saltBytes)))
    const distinct = new Set(derived.map((bytes) => bytes.join(',')))
    expect(distinct.size).to.eq(variants.length)
  })

  it("keeps none of the extra fields it was handed: a spec cannot smuggle in a function", async () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as KeyDeriverSpec
    const derived = await argon2idDeriver(smuggled).deriveKeyBytes('pw', new Uint8Array(16))
    expect(derived).to.not.deep.equal(new Uint8Array(32))
  })

  it("makes a deriver of the supplied spec too, the same one argon2idWebV1Deriver is", () => {
    expect(specOf(argon2idDeriver(Argon2idWebV1))).to.deep.equal(specOf(argon2idWebV1Deriver))
  })

  it("takes a spec of the host's own, under its own label", () => {
    const deriver = argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(deriver.key_deriver_label).to.eq('acme_argon2id_v1')
    expect(deriver.memory_kib).to.eq(131_072)
  })

  it("refuses a spec Argon2id cannot run, before deriving anything", () => {
    expect(() => argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }))
      .to.throw(/salt_bytes/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("refuses the supplied spec's label on other parameters", () => {
    expect(() => argon2idDeriver({ ...Argon2idWebV1, iterations: 4 }))
      .to.throw(/argon2id_web_v1/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })
})

/** Expect `attempt` to throw a VaultError of kind 'bad_option'; hands back its message. */
const refusalOf = (attempt: () => unknown): string => {
  try {
    attempt()
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq('bad_option')
    return (err as VaultError).message
  }
  throw new Error("expected a VaultError of kind 'bad_option', but nothing was thrown")
}

const UnworkableSpecs = [
  // salts Argon2id or the platform cannot use:
  [{ salt_bytes: 7 },                        'salt_bytes',   'a salt under 8 bytes, which Argon2id refuses'],
  [{ salt_bytes: 1 },                        'salt_bytes',   'a one-byte salt, which Argon2id refuses'],
  [{ salt_bytes: MaxSaltBytes + 1 },         'salt_bytes',   'a salt longer than getRandomValues hands out at once'],
  [{ salt_bytes: 16.5 },                     'salt_bytes',   'a salt of a fraction of a byte'],
  // memory Argon2id or @noble/hashes cannot use:
  [{ memory_kib: 7 },                        'memory_kib',   'under 8 KiB for its one lane'],
  [{ memory_kib: 64, parallelism: 9 },       'memory_kib',   'under 8 KiB for each of nine lanes'],
  [{ memory_kib: 1_048_577 },                'memory_kib',   'more than the 1 GiB @noble/hashes allocates'],
  [{ memory_kib: Infinity },                 'memory_kib',   'infinite memory'],
  // passes and lanes:
  [{ iterations: 0 },                        'iterations',   'no passes over memory'],
  [{ iterations: 2 ** 32 },                  'iterations',   'more passes than Argon2 can count'],
  [{ parallelism: 0 },                       'parallelism',  'no lanes'],
  [{ parallelism: NaN },              'parallelism',  'lanes that are not a number'],
  // what the vault cannot use, or is not Argon2id:
  [{ output_bytes: 16 },                     'output_bytes', 'a 128-bit key, where the vault needs 256 bits'],
  [{ output_bytes: 64 },                     'output_bytes', 'a key longer than the vault uses'],
  [{ algorithm: 'scrypt' },                  'algorithm',    'another key derivation function'],
  [{ key_deriver_label: '' },                'key_deriver_label', 'no label for a vault to record'],
] as const

describe("argon2idDeriver's bounds", () => {
  for (const [change, field, blurb] of UnworkableSpecs) {
    it(`refuses ${blurb}, naming the field`, () => {
      const message = refusalOf(() => argon2idDeriver({ ...CheapSpec, ...change } as unknown as KeyDeriverSpec))
      expect(message).to.include(field)
    })
  }

  it("refuses what is not a spec at all, listing what a spec carries", () => {
    for (const notSpec of [undefined, null, 'argon2id_web_v1', 65_536]) {
      expect(refusalOf(() => argon2idDeriver(notSpec as unknown as KeyDeriverSpec))).to.include('memory_kib')
    }
  })

  it("refuses a spec with fields missing, naming one", () => {
    const { iterations: _dropped, ...partial } = CheapSpec
    expect(refusalOf(() => argon2idDeriver(partial as KeyDeriverSpec))).to.include('iterations')
  })

  it("allows the foolish but workable, and derives under it: Argon2id's least memory, one pass and the shortest salt", async () => {
    const flimsy = { ...CheapSpec, memory_kib: 8, iterations: 1, parallelism: 1, salt_bytes: 8 }
    const deriver = argon2idDeriver(flimsy)
    expect(specOf(deriver)).to.deep.equal(flimsy)
    expect(await deriver.deriveKeyBytes('pw', new Uint8Array(8))).to.have.lengthOf(32)
  })

  it("allows the largest of each bound", () => {
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072, salt_bytes: MaxSaltBytes }
    expect(specOf(argon2idDeriver(lavish))).to.deep.equal(lavish)
  })

  it("refuses a spec wearing a supplied label with other parameters", () => {
    expect(refusalOf(() => argon2idDeriver({ ...Argon2idWebV1, memory_kib: 19_456 }))).to.include('argon2id_web_v1')
  })
})

// The bounds above are Argon2id's and the library's own, not ours: these hold them to it.
describe("the limits argon2idDeriver's bounds stand on", () => {
  it("@noble/hashes refuses a salt under 8 bytes, and takes 8", async () => {
    const opts = { m: 8, t: 1, p: 1, dkLen: PassphraseKeyBytes }
    await expect(argon2idAsync('pw', new Uint8Array(7), opts)).rejects.toThrow(/salt/u)
    expect(await argon2idAsync('pw', new Uint8Array(8), opts)).to.have.lengthOf(PassphraseKeyBytes)
  })

  it("@noble/hashes refuses memory past 1 GiB, before allocating any", async () => {
    await expect(argon2idAsync('pw', new Uint8Array(16), { m: 1_048_580, t: 1, p: 1 })).rejects.toThrow(/maxmem/u)
  })
})

// These run the real Argon2id at the supplied spec: 64 MiB and three passes each, roughly half a
// second apiece. Slow on purpose -- that slowness is the security property under test's cousin.
describe("argon2idWebV1Deriver", () => {
  it("carries the supplied spec whole", () => {
    expect(specOf(argon2idWebV1Deriver)).to.deep.equal(Argon2idWebV1)
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
