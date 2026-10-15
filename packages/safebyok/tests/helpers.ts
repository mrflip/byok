import { fakeCiphered, scopeOf } from '../src/testing'
import type { DeviceUnlock } from '../src/types'

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
