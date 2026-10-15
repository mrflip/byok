import * as Z from 'zod/mini'
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, ensureSuppliedSpecKept, type KeyDeriverSpec } from './key-deriver-spec'
import { VaultError } from './errors'

/**
 * What turns a passphrase into passphraseKey bytes. The one to use is
 * {@link argon2idWebV1Deriver}; {@link argon2idDeriver} makes one for a spec of your own. The
 * seam exists so tests can substitute a cheap deriver, and so a host on a platform with a faster
 * implementation of the same Argon2id spec (WebAssembly, native) can plug it in.
 *
 * A vault stores its deriver's `key_deriver_label`, and unlocks only through a deriver carrying
 * that same label: plugging in your own commits every one of your users' vaults to it. An
 * Argon2id deriver carries its whole keyDeriverSpec beside its function, and one that wears the
 * label of a spec safebyok supplies must carry exactly that spec's parameters, or openVault
 * refuses it (kind 'bad_option'). Do not write your own derivation; if you must substitute, use a
 * vetted Argon2id implementation, spread the spec into it, keep the label, and test that it
 * derives the same bytes as the deriver it stands in for.
 *
 * @example const wasmDeriver: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: deriveWithWasm }
 */
export type KeyDeriver = Partial<KeyDeriverSpec> & {
  /** Stored beside each vault, so the stored format says how it was made. */
  key_deriver_label: string
  /** How long a passphraseSalt this deriver expects, in bytes: from 1 to 65536. */
  salt_bytes:        number
  /** 32 key bytes from the passphrase and its salt: deterministic, and slow by design. */
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
}

/**
 * A KeyDeriver running Argon2id at `spec`, through `@noble/hashes` (audited, pure JS, runs
 * wherever the host app does), carrying the spec beside its function. The async form yields to
 * the event loop as it works, so a browser unlock does not freeze the page. Choose a label of
 * your own (naming your app, say), and never change its parameters once a vault is made under it.
 *
 * Refuses (kind 'bad_option') a spec Argon2id cannot run -- a salt under 8 bytes or over 65536,
 * memory under 8 KiB a lane or over 1 GiB, no passes, no lanes, a key other than 32 bytes -- and
 * one wearing a supplied spec's label without its parameters. A weak spec that runs is allowed.
 *
 * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
 * @returns A frozen KeyDeriver: the spec's fields and `deriveKeyBytes`.
 *
 * @example
 *   const keyDeriver = argon2idDeriver({
 *     ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072,
 *   })
 * @example
 *   argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 })
 *   // throws 'bad_option': Argon2id takes no salt under 8 bytes
 * @example
 *   argon2idDeriver({ ...Argon2idWebV1, iterations: 4 })
 *   // throws 'bad_option': argon2id_web_v1 always means 3 passes
 */
export const argon2idDeriver = (spec: KeyDeriverSpec): KeyDeriver & KeyDeriverSpec => deriverOf(parseKeyDeriverSpec(spec))

/** A frozen deriver of a spec already checked: Argon2idWebV1, or one argon2idDeriver parsed. */
const deriverOf = (spec: KeyDeriverSpec): KeyDeriver & KeyDeriverSpec => {
  const argonOpts = { m: spec.memory_kib, t: spec.iterations, p: spec.parallelism, dkLen: spec.output_bytes }
  return Object.freeze({
    ...spec,
    deriveKeyBytes: (passphrase: string, saltBytes: Uint8Array) => argon2idAsync(passphrase, saltBytes, argonOpts),
  })
}

/**
 * The KeyDeriver to use: Argon2id at the supplied {@link Argon2idWebV1} spec. `browserOpts()`,
 * from `safebyok/browser`, hands it to openVault; outside a browser, pass it as `keyDeriver`
 * yourself.
 *
 * @example
 *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWebV1Deriver = /* @__PURE__ */ deriverOf(Argon2idWebV1)

/** The fewest salt bytes Argon2id takes: its reference code and `@noble/hashes` refuse fewer. */
const MinArgon2SaltBytes = 8

/** The most memory `@noble/hashes` allocates for one Argon2 derivation, in KiB: 1 GiB. */
const MaxMemoryKib = 1_048_576

/** Argon2's least memory per lane, in KiB. */
const MinMemoryKibPerLane = 8

/** One past the largest 32-bit unsigned integer, Argon2's bound on its counts. */
const Uint32Bound = 2 ** 32

// Marked pure, so a bundler drops it from an app that imports only argon2idWebV1Deriver.
const keyDeriverSpec = /* @__PURE__ */ Z.object({
  algorithm:         Z.literal('argon2id'),
  key_deriver_label: Z.string().check(Z.minLength(1)),
  memory_kib:        Z.int().check(Z.gte(MinMemoryKibPerLane), Z.lte(MaxMemoryKib)),
  iterations:        Z.int().check(Z.gte(1), Z.lt(Uint32Bound)),
  parallelism:       Z.int().check(Z.gte(1)),
  salt_bytes:        Z.int().check(Z.gte(MinArgon2SaltBytes), Z.lte(MaxSaltBytes)),
  output_bytes:      Z.literal(PassphraseKeyBytes),
}).check(Z.refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { path: ['memory_kib'] }))

/** What each of a spec's fields must be, as a refusal says it: never quoting what was handed in. */
const SpecLimitForField: Readonly<Record<keyof KeyDeriverSpec, string>> = {
  algorithm:         "algorithm is 'argon2id', the one key derivation function safebyok runs.",
  key_deriver_label: 'key_deriver_label is a non-empty string of your own choosing, stored beside every vault made under the spec.',
  memory_kib:        'memory_kib is a whole number of KiB, at least 8 for each lane (parallelism) and at most 1048576 (1 GiB), the most @noble/hashes allocates.',
  iterations:        'iterations is a whole number of passes, at least 1.',
  parallelism:       'parallelism is a whole number of lanes, at least 1.',
  salt_bytes:        "salt_bytes is a whole number of bytes, at least 8 (Argon2id's least) and at most 65536 (the most the platform's random source hands out at once).",
  output_bytes:      'output_bytes is 32: the passphraseKey is a 256-bit key.',
}

/**
 * `candidate` as a KeyDeriverSpec Argon2id can run, refusing (kind 'bad_option') one it cannot,
 * or one that wears a supplied spec's label without its parameters. Weak parameters that run
 * are allowed: choosing them is the host's call.
 */
const parseKeyDeriverSpec = (candidate: KeyDeriverSpec): KeyDeriverSpec => {
  const checked = keyDeriverSpec.safeParse(candidate)
  if (! checked.success) {
    const field = checked.error.issues[0]?.path[0]
    const limit = (typeof field === 'string' && Object.hasOwn(SpecLimitForField, field))
      ? SpecLimitForField[field as keyof KeyDeriverSpec]
      : 'It needs every field of a KeyDeriverSpec: algorithm, key_deriver_label, memory_kib, iterations, parallelism, salt_bytes and output_bytes.'
    throw new VaultError('bad_option', `argon2idDeriver cannot run that spec. ${limit}`)
  }
  ensureSuppliedSpecKept(checked.data)
  return checked.data
}
