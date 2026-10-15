import { VaultError } from './errors'

/**
 * A keyDeriverSpec: Argon2id's whole parameter set, under the keyDeriverLabel a vault records.
 * A vault stores only the label, so a label must always mean the same parameters: change one
 * and the vaults made under the old ones stop opening. {@link Argon2idWebV1} is the one
 * safebyok supplies; `argon2idDeriver` turns a spec of your own into a KeyDeriver.
 *
 * @example
 *   const spec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 }
 */
export type KeyDeriverSpec = {
  readonly algorithm:         'argon2id'
  /** Stored beside each vault: a vault opens only under a deriver carrying the same one. */
  readonly key_deriver_label: string
  /** Argon2 memory cost, in KiB: from 8 per lane up to 1048576 (1 GiB). */
  readonly memory_kib:        number
  /** Argon2 passes over memory (its time cost): at least 1. */
  readonly iterations:        number
  /** Argon2 lanes: at least 1. A JavaScript deriver runs them one after another. */
  readonly parallelism:       number
  /** How long a passphraseSalt is, in bytes: from 8 to 65536. */
  readonly salt_bytes:        number
  /** How many key bytes come out: always 32, as a 256-bit passphraseKey needs. */
  readonly output_bytes:      number
}

/**
 * The keyDeriverSpec safebyok supplies, and the one `browserOpts()` derives under: Argon2id over
 * 64 MiB, three passes, one lane, a 16-byte salt and a 32-byte key. It is above OWASP's
 * Argon2id minimums, and is RFC 9106's second recommended option with one lane in place of four
 * (a JavaScript deriver runs lanes one after another, so more lanes buy a browser nothing).
 * A deriver that wears its label must carry exactly these parameters: openVault and
 * `argon2idDeriver` refuse one that does not.
 *
 * @example Argon2idWebV1.key_deriver_label  // 'argon2id_web_v1'
 * @example Argon2idWebV1.memory_kib         // 65536, i.e. 64 MiB
 */
export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  memory_kib:        65_536,
  iterations:        3,
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const) satisfies KeyDeriverSpec

/** Every keyDeriverSpec safebyok supplies: a deriver wearing a label here carries its fields. */
const SuppliedSpecs: readonly KeyDeriverSpec[] = [Argon2idWebV1]

/** The most bytes `crypto.getRandomValues` hands out at once, and so the longest passphraseSalt. */
export const MaxSaltBytes = 65_536

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

/**
 * Refuse (kind 'bad_option') a key deriver or spec that wears the label of a spec safebyok
 * supplies without carrying each of that spec's parameters: a vault made under it on one device
 * would not open under the real one on another.
 */
export const ensureSuppliedSpecKept = (candidate: Partial<KeyDeriverSpec> & { readonly key_deriver_label: string }) => {
  const supplied = SuppliedSpecs.find((spec) => spec.key_deriver_label === candidate.key_deriver_label)
  if (supplied === undefined) { return }
  const carried: Readonly<Record<string, unknown>> = candidate
  const kept = Object.entries(supplied).every(([field, val]) => carried[field] === val)
  if (! kept) {
    throw new VaultError('bad_option', `A key deriver labelled ${supplied.key_deriver_label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours, or choose a label of your own.`)
  }
}
