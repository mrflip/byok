import { base64urlnopad } from '@scure/base'
import * as Z from 'zod'
import { stableJsonify } from './stable-jsonify'

/**
 * The cryptographic engine under the vault: AES-256-GCM encryption and key wrapping through
 * WebCrypto, random material through `crypto.getRandomValues`. Nothing here is home-made; every
 * primitive is the platform's. Key derivation from a passphrase lives in key-deriver.ts.
 *
 * Every encryption binds its context (which app, user, vault, lockbox, revision, and for what
 * purpose) as cipherAdditionalData, so ciphertext copied anywhere else refuses to open.
 */

/**
 * An encrypted value as stored: its cipherIv and its ciphertext (authentication tag on the end),
 * each as base64url text, so the record is plain JSON and any storage layer can hold it as-is.
 * A wrapped key and a ciphered whisper are both this shape.
 */
export const Ciphered = Z.object({
  cipher_iv_b64:  Z.string().min(1),
  ciphertext_b64: Z.string().min(1),
})
export type Ciphered = Z.infer<typeof Ciphered>

/** `count` cryptographically secure random bytes, from the platform's own well. */
export const randomBytes = (count: number): Uint8Array => (
  crypto.getRandomValues(new Uint8Array(count))
)

/** A fresh random identifier (for a vaultId or revisionId): a UUID, minted by the platform. */
export const randomId = (): string => crypto.randomUUID()

/** Bytes as base64url text, the `_b64` form every stored record uses. */
export const toB64 = (bytes: Uint8Array): string => base64urlnopad.encode(bytes)

/** Base64url text back to bytes. Throws on text that is not base64url. */
export const fromB64 = (b64: string): Uint8Array => base64urlnopad.decode(b64)

const AesGcm = { name: 'AES-GCM', length: 256 } as const
const IvBytes = 12

/**
 * The context an encryption is bound to, as AES-GCM additional data: a deterministic encoding of
 * the given parts (app, user, vault, lockbox, revision, purpose -- whatever names the slot).
 * Rebuilt rather than stored; if any part differs at decryption, the ciphertext refuses to open.
 *
 * @example cipherBinding('byok-vault-v1', 'acme', 'u1', 'main', vaultId, 1, 'vault_key_passphrase_wrapped')
 */
export const cipherBinding = (...parts: readonly (string | number)[]): Uint8Array => (
  new TextEncoder().encode(stableJsonify(parts))
)

/**
 * A fresh random 256-bit AES-GCM key for wrapping and unwrapping other keys: a vaultKey.
 * Extractable, because its whole job is to be wrapped (under the passphraseKey, under the
 * localUnlockKey) and travel in wrapped form.
 */
export const makeVaultKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, true, ['wrapKey', 'unwrapKey'])
)

/**
 * A fresh random 256-bit AES-GCM key for one lockbox: a lockboxKey, made new on every store.
 * Extractable for the same reason a vaultKey is: it exists to be wrapped.
 */
export const makeLockboxKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, true, ['encrypt', 'decrypt'])
)

/**
 * This browser's localUnlockKey: non-extractable, so it cannot leave the device even through the
 * code that made it. Persisted only by structured clone (IndexedDB), never as bytes.
 */
export const makeLocalUnlockKey = (): Promise<CryptoKey> => (
  crypto.subtle.generateKey(AesGcm, false, ['wrapKey', 'unwrapKey'])
)

/**
 * Raw key bytes (a key deriver's output) as a non-extractable AES-GCM wrapping key: the
 * passphraseKey. The bytes stay with the caller; wipe or drop them promptly.
 */
export const importWrappingKeyBytes = (keyBytes: Uint8Array): Promise<CryptoKey> => (
  crypto.subtle.importKey('raw', keyBytes as BufferSource, AesGcm, false, ['wrapKey', 'unwrapKey'])
)

/**
 * `plainBytes` encrypted under `cipherKey`, bound to `binding`: a fresh cipherIv every call,
 * authentication tag on the end of the ciphertext, both halves base64url.
 */
export const cipherBytes = async (cipherKey: CryptoKey, plainBytes: Uint8Array, binding: Uint8Array): Promise<Ciphered> => {
  const cipherIv = randomBytes(IvBytes)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: binding as BufferSource },
    cipherKey,
    plainBytes as BufferSource,
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/**
 * The plain bytes back out of a {@link Ciphered}, verifying its authentication tag and `binding`.
 * Rejects (a DOMException from WebCrypto) when the key is wrong, the binding differs, or the
 * ciphertext was altered -- the caller turns that into its own calm error.
 */
export const decipherBytes = async (cipherKey: CryptoKey, ciphered: Ciphered, binding: Uint8Array): Promise<Uint8Array> => {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ciphered.cipher_iv_b64) as BufferSource, additionalData: binding as BufferSource },
    cipherKey,
    fromB64(ciphered.ciphertext_b64) as BufferSource,
  )
  return new Uint8Array(plain)
}

/**
 * `wrappedKey` encrypted under `wrappingKey`, bound to `binding`: how a vaultKey travels inside
 * a bundle and a lockboxKey inside its lockbox. The key being wrapped must be extractable.
 */
export const wrapKeyUnder = async (wrappingKey: CryptoKey, wrappedKey: CryptoKey, binding: Uint8Array): Promise<Ciphered> => {
  const cipherIv = randomBytes(IvBytes)
  const ciphertext = await crypto.subtle.wrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    { name: 'AES-GCM', iv: cipherIv as BufferSource, additionalData: binding as BufferSource },
  )
  return { cipher_iv_b64: toB64(cipherIv), ciphertext_b64: toB64(new Uint8Array(ciphertext)) }
}

/**
 * The key back out of a wrapped envelope, verifying its tag and `binding`. Rejects (a
 * DOMException) on a wrong wrappingKey, a different binding, or altered ciphertext: for the
 * passphrase envelope that rejection IS how a wrong passphrase is learned -- never a comparison.
 *
 * @param usages - What the recovered key may do; also sets extractability: a vaultKey comes back
 *   extractable (it gets re-wrapped for this device), a lockboxKey does not.
 */
export const unwrapKeyUnder = async (
  wrappingKey: CryptoKey,
  wrapped: Ciphered,
  binding: Uint8Array,
  usages: { extractable: boolean, usage: readonly KeyUsage[] },
): Promise<CryptoKey> => (
  crypto.subtle.unwrapKey(
    'raw',
    fromB64(wrapped.ciphertext_b64) as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: fromB64(wrapped.cipher_iv_b64) as BufferSource, additionalData: binding as BufferSource },
    AesGcm,
    usages.extractable,
    [...usages.usage],
  )
)
