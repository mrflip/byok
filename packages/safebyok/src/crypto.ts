import { base64urlnopad } from '@scure/base'
import * as Z from 'zod/mini'
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
  cipher_iv_b64:  Z.string().check(Z.minLength(1)),
  ciphertext_b64: Z.string().check(Z.minLength(1)),
})
export type Ciphered = Z.infer<typeof Ciphered>

/** `count` cryptographically secure random bytes, from the platform's own well. */
export const randomBytes = (count: number): Uint8Array => (
  crypto.getRandomValues(new Uint8Array(count))
)

/** A fresh random identifier (for a vaultId or revisionId): a UUID, minted by the platform. */
export const randomId = (): string => crypto.randomUUID()

/**
 * Bytes as base64url text, unpadded: the `_b64` form every stored record uses.
 *
 * @example toB64(new TextEncoder().encode('cred-laptop'))  // 'Y3JlZC1sYXB0b3A'
 */
export const toB64 = (bytes: Uint8Array): string => base64urlnopad.encode(bytes)

/**
 * Base64url text back to bytes. Throws on text that is not base64url.
 *
 * @example new TextDecoder().decode(fromB64('Y3JlZC1sYXB0b3A'))  // 'cred-laptop'
 */
export const fromB64 = (b64: string): Uint8Array => base64urlnopad.decode(b64)

const AesGcm = { name: 'AES-GCM', length: 256 } as const
const IvBytes = 12

/**
 * One part of a {@link cipherBinding}: a string or number, or a flat record of them -- the public
 * header of an unlock envelope, say -- encoded with its keys sorted.
 */
export type CipherBindingPart = string | number | Readonly<Record<string, string | number>>

/**
 * The context an encryption is bound to, as AES-GCM additional data: a deterministic encoding of
 * the given parts (app, user, vault, lockbox, revision, purpose -- whatever names the slot).
 * Rebuilt rather than stored; if any part differs at decryption, the ciphertext refuses to open.
 *
 * @example cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', vaultId, 1, 'vault_key_local_wrapped')
 * @example cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', vaultId, 'vault_key_passphrase_wrapped', { method: 'passphrase', unlock_id, unlocklabel, key_deriver_label, salt_b64 })
 */
export const cipherBinding = (...parts: readonly CipherBindingPart[]): Uint8Array => (
  new TextEncoder().encode(stableJsonify(parts))
)

/**
 * A fresh random 256-bit AES-GCM key for wrapping and unwrapping other keys: a brand-new
 * vaultKey. Extractable, because a key must be to be wrapped (under the passphraseKey, under the
 * localUnlockKey) -- so this handle lives only inside the operation doing that wrapping, and the
 * handle a vault holds between operations is a separate non-extractable unwrap of the envelope.
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
 * A non-extractable AES-GCM wrapping key made from secret bytes that are already uniformly random
 * -- a passkey's PRF output -- by HKDF-SHA256 (RFC 5869), with no salt (the RFC's default, for
 * input that is already uniform) and `info` naming what the key is for, so the same bytes put to
 * another use make another key: the passkeyKey. The bytes stay with the caller; drop them promptly.
 *
 * @example await deriveWrappingKey(prfBytes, cipherBinding('safebyok-vault-v1', 'vault_key_passkey_wrapped', credentialId))
 */
export const deriveWrappingKey = async (keyBytes: Uint8Array, info: Uint8Array): Promise<CryptoKey> => {
  const inputKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as BufferSource },
    inputKey,
    AesGcm,
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

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
 * @param usages - What the recovered key may do; also sets extractability. Non-extractable is
 *   the default posture (a lockboxKey, the vaultKey handle a vault holds); an extractable unwrap
 *   exists only inside an operation about to re-wrap the key, and is dropped when it returns.
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
