import type { KeyDeriver } from '../src/key-deriver'
import type { Ciphered } from '../src/crypto'
import type { DeviceUnlock, Lockbox, VaultBundle, VaultScope } from '../src/types'

/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocks runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`.
 */
export const testDeriver: KeyDeriver = {
  key_deriver_label: 'test_digest_v0',
  salt_bytes:        16,
  deriveKeyBytes: async (passphrase, saltBytes) => {
    const passphraseBytes = new TextEncoder().encode(passphrase)
    const joined = new Uint8Array(passphraseBytes.length + saltBytes.length)
    joined.set(passphraseBytes)
    joined.set(saltBytes, passphraseBytes.length)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', joined))
  },
}

/** A shape-valid Ciphered that opens nothing: for storage-layer tests, which never decrypt. */
export const fakeCiphered = (tag: string): Ciphered => ({
  cipher_iv_b64:  `iv-${tag}`,
  ciphertext_b64: `ct-${tag}`,
})

export const scopeOf = (userId: string): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel: 'main' })

/** A shape-valid VaultBundle for storage-layer tests; its envelope is fake and opens nothing. */
export const bundleOf = (userId: string): VaultBundle => ({
  format:              'safebyok-vault-v1',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  passphrase_epoch:    1,
  key_deriver_label:   'test_digest_v0',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- base64 of the literal text 'saltsaltsaltsalt': a fake salt (which is public material anyway), not a credential
  passphrase_salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_passphrase_wrapped: fakeCiphered(`bundle-${userId}`),
  created_at:          '2026-10-14T00:00:00.000Z',
  updated_at:          '2026-10-14T00:00:00.000Z',
})

/** A real DeviceUnlock for device-storage tests: a live non-extractable localUnlockKey around fake wrapped material. */
export const unlockOf = async (userId: string): Promise<DeviceUnlock> => ({
  format:                  'safebyok-unlock-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  passphrase_epoch:        1,
  local_unlock_key:        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_local_wrapped: fakeCiphered(`local-${userId}`),
  expires_at:              1_900_000_000_000,
})

/** A shape-valid Lockbox for storage-layer tests; its ciphered fields are fake and open nothing. */
export const boxOf = (boxlabel: string, tag: string): Lockbox => ({
  format:              'safebyok-lockbox-v1',
  boxlabel,
  revision_id:         `rev-${tag}`,
  lockbox_key_wrapped: fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:    fakeCiphered(`whisper-${tag}`),
  note:                'a test box',
  created_at:          '2026-10-14T00:00:00.000Z',
  updated_at:          '2026-10-14T00:00:00.000Z',
})

/**
 * Base64url text, bent a little: its first character swapped for another valid one, so it is
 * always different, keeps its length, and a tamper test reaches the check it means to exercise.
 * Blank text has no character to swap, so it comes back as `'a'`.
 *
 * @param b64 - Base64url text.
 * @returns Text that differs from `b64` in its first character only.
 *
 * @example tweakB64('Zm9v') // 'am9v'
 * @example tweakB64('am9v') // 'bm9v'
 * @example tweakB64('') // 'a'
 */
export const tweakB64 = (b64: string): string => {
  const replacer = b64.startsWith('a') ? 'b' : 'a'
  return replacer + b64.slice(1)
}

/**
 * Resolve after the macrotask queue has turned once: every promise already settled has run its
 * continuation, and so has any timer due now. For tests that let background work (a refresh rung
 * by a write) settle before they look.
 *
 * @returns A promise for the next tick.
 *
 * @example await wakeupAtNextTick() // background refreshes have landed
 */
export const wakeupAtNextTick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })
