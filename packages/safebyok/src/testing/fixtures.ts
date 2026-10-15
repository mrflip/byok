import type { Ciphered } from '../crypto'
import type { KeyDeriver } from '../key-deriver'
import type { Lockbox, VaultBundle, VaultScope } from '../types'

/** A Lockbox as the core writes one: a note, or no note field at all, never an undefined one. */
type WrittenLockbox = Omit<Lockbox, 'note'> & { note?: string }

/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocks runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example openVault({ ...opts, keyDeriver: testDeriver })
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

/**
 * A shape-valid Ciphered that opens nothing: for storage-layer tests, which never decrypt.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 */
export const fakeCiphered = (tag: string): Ciphered => ({
  cipher_iv_b64:  `iv-${tag}`,
  ciphertext_b64: `ct-${tag}`,
})

/**
 * The scope of `userId`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (userId: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel })

/**
 * A shape-valid VaultBundle for `userId`'s `main` vault, its envelope fake: for storage-layer
 * tests, which never decrypt. Its vault_id is `vault-id-<userId>`, its epoch 1.
 *
 * @example bundleOf('u1', { passphrase_epoch: 2 })
 */
export const bundleOf = (userId: string, overrides: Partial<VaultBundle> = {}): VaultBundle => ({
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
  ...overrides,
})

/**
 * A shape-valid Lockbox for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * with the note `a test box` unless `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { note: 'work account' })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<WrittenLockbox> = {}): WrittenLockbox => ({
  format:              'safebyok-lockbox-v1',
  boxlabel,
  revision_id:         `rev-${tag}`,
  lockbox_key_wrapped: fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:    fakeCiphered(`whisper-${tag}`),
  note:                'a test box',
  created_at:          '2026-10-14T00:00:00.000Z',
  updated_at:          '2026-10-14T00:00:00.000Z',
  ...overrides,
})
