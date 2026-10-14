/**
 * The one passphrase key-derivation profile a vault is written under: Argon2id over 64 MiB, three
 * passes, one lane, a 16-byte salt and a 32-byte key. There is no caller-selected algorithm or
 * parameter set; the profile is stored beside each vault so that the stored format describes
 * itself.
 *
 * @example Argon2idWebV1.profile     // 'argon2id-web-v1'
 * @example Argon2idWebV1.memory_kib  // 65536, i.e. 64 MiB
 */
export const Argon2idWebV1 = Object.freeze({
  algorithm:    'argon2id',
  profile:      'argon2id-web-v1',
  /** Argon2 memory cost, in KiB. */
  memory_kib:   65_536,
  /** Argon2 passes over memory (its time cost). */
  iterations:   3,
  /** Argon2 lanes: one, as suits a browser worker. */
  parallelism:  1,
  salt_bytes:   16,
  output_bytes: 32,
} as const)

/** A key-derivation profile, as stored beside a vault. */
export type KdfProfile = typeof Argon2idWebV1
