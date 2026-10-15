import { argon2idAsync } from '@noble/hashes/argon2.js'

/**
 * The one keyDeriverSpec a vault is written under: the fixed recipe that turns a passphrase and
 * its passphraseSalt into the passphraseKey. Argon2id over 64 MiB, three passes, one lane, a
 * 16-byte salt and a 32-byte key. There is no caller-selected algorithm or parameter set; the
 * spec's keyDeriverLabel is stored beside each vault so that the stored format describes itself.
 *
 * @example Argon2idWebV1.key_deriver_label  // 'argon2id_web_v1'
 * @example Argon2idWebV1.memory_kib         // 65536, i.e. 64 MiB
 */
export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  /** Argon2 memory cost, in KiB. */
  memory_kib:        65_536,
  /** Argon2 passes over memory (its time cost). */
  iterations:        3,
  /** Argon2 lanes: one, as suits a browser worker. */
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const)

/** A keyDeriverSpec, as stored beside a vault. */
export type KeyDeriverSpec = typeof Argon2idWebV1

/**
 * What turns a passphrase into passphraseKey bytes. The one safebyok ships -- and the one to use --
 * is {@link argon2idWebV1Deriver}; the seam exists so tests can substitute a cheap deriver, and
 * so a host on a platform with a stronger native implementation can plug it in without waiting
 * on this package.
 *
 * A vault stores its deriver's `key_deriver_label`, and unlocks only through a deriver carrying
 * that same label: plugging in your own commits every one of your users' vaults to it. Do not
 * write your own derivation; if you must substitute, substitute a vetted implementation of the
 * same Argon2id spec and keep the label.
 */
export type KeyDeriver = {
  /** Stored beside each vault, so the stored format says how it was made. */
  key_deriver_label: string
  /** How long a passphraseSalt this deriver expects, in bytes. */
  salt_bytes:        number
  /** 32 key bytes from the passphrase and its salt: deterministic, and slow by design. */
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
}

/**
 * The KeyDeriver to use: Argon2id at the pinned {@link Argon2idWebV1} spec, through
 * `@noble/hashes` (audited, pure JS, runs wherever the host app does). The async form yields to
 * the event loop as it works, so a browser unlock does not freeze the page. `browserOpts()`, from
 * `safebyok/browser`, hands it to openVault; outside a browser, pass it as `keyDeriver` yourself.
 *
 * @example
 *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWebV1Deriver: KeyDeriver = {
  key_deriver_label: Argon2idWebV1.key_deriver_label,
  salt_bytes:        Argon2idWebV1.salt_bytes,
  deriveKeyBytes: (passphrase, saltBytes) => (
    argon2idAsync(passphrase, saltBytes, {
      m:     Argon2idWebV1.memory_kib,
      t:     Argon2idWebV1.iterations,
      p:     Argon2idWebV1.parallelism,
      dkLen: Argon2idWebV1.output_bytes,
    })
  ),
}
