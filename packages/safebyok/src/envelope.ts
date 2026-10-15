import * as Z from 'zod/mini'
import { cipherBinding, deriveWrappingKey, fromB64, importWrappingKeyBytes, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { PasskeySaltBytes, type PasskeyEnvelope, type PasskeyProof, type PassphraseEnvelope, type UnlockEnvelope, type UnlockMethod, type UnlockSummary, type VaultBundle, type VaultScope } from './types'

/**
 * Unlock envelopes: each the vaultKey wrapped under a key one method makes, so a vault has several
 * ways in and one vaultKey behind them all. Imported whole, as `Envelope`: `Envelope.sealPassphrase`
 * and `Envelope.sealPasskey` make one, `Envelope.open` finds the one a passphrase or a passkey
 * opens, `Envelope.summarize` gives its public face. Internal to the package; the vault calls it.
 *
 * Each envelope's wrap is bound to its vault and to its own public header -- every field but the
 * wrap itself, encoded with its keys sorted -- under a purpose its method names. The bundle's
 * `unlock_epoch` is not in it: a change to one envelope bumps the epoch, and the others, whose
 * passphrases this device does not hold, must still open.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or into a new way in); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/** `EnvelopeT` with every field but its wrap, member by member of a union. */
type HeaderOf<EnvelopeT> = EnvelopeT extends unknown ? Omit<EnvelopeT, 'vault_key_wrapped'> : never
/** An envelope's public header, every field but its wrap: what the wrap is bound to. */
export type EnvelopeHeader = HeaderOf<UnlockEnvelope>

/** The binding purpose of each method's wrap, so no method's envelope opens as another's. */
const PurposeForMethod = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<UnlockMethod, string>>

/** The usages of the handle a vault keeps: it wraps a lockboxKey and unwraps one, nothing else. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
// The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty usage
// list, so it carries the narrowest one.
const TransientUsage = { extractable: true, usage: ['wrapKey'] } as const

/** The context an envelope's wrap is bound to: the vault it lets into, and its own public header. */
const binding = (scope: VaultScope, vaultId: string, header: EnvelopeHeader): Uint8Array => (
  cipherBinding('safebyok-vault-v1', scope.applabel, scope.user_id, scope.vaultlabel, vaultId, PurposeForMethod[header.method], header)
)

/** `envelope` without its wrap. */
const headerOf = (envelope: UnlockEnvelope): EnvelopeHeader => {
  const { vault_key_wrapped: _wrapped, ...header } = envelope
  return header
}

/**
 * Every unlock's proof: a passphrase the user typed, or what a passkey answered. A blank
 * passphrase never reaches here, nor a passkey proof of the wrong shape: the vault refuses both
 * at its door.
 */
export type UnlockProof = string | PasskeyProof

/** What a KeyDeriver must hand back: the bytes of a 256-bit key, and nothing shorter. */
const passphraseKeyBytes = Z.custom<Uint8Array>((candidate) => (
  ArrayBuffer.isView(candidate) && candidate.byteLength === PassphraseKeyBytes
))

/**
 * The passphraseKey `keyDeriver` makes of `passphrase` and its salt: 32 bytes, no other, or kind
 * `bad_option` before anything is wrapped -- WebCrypto would accept 16 or 24 as a weaker AES key.
 */
const passphraseKeyOf = async (keyDeriver: KeyDeriver, passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> => {
  const checked = passphraseKeyBytes.safeParse(await keyDeriver.deriveKeyBytes(passphrase, saltBytes))
  if (! checked.success) {
    throw new VaultError('bad_option', 'keyDeriver handed back something other than 32 key bytes: a passphraseKey is a 256-bit key.')
  }
  return importWrappingKeyBytes(checked.data)
}

/**
 * A passphrase envelope around `vaultKey`, under a fresh passphraseSalt, and the session's handle
 * on the vaultKey through it.
 *
 * @param keyDeriver - What makes the passphraseKey; its label goes on the envelope.
 * @param passphrase - The passphrase this envelope admits.
 * @param scope - The vault's scope, bound into the wrap.
 * @param vaultId - The vault's id, bound into the wrap.
 * @param naming - The envelope's `unlock_id` and `unlocklabel`.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 * @returns The envelope, and a non-extractable handle on the vaultKey unwrapped from it.
 */
export const sealPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultId: string,
  naming: { unlock_id: string, unlocklabel: string },
  vaultKey: CryptoKey,
): Promise<{ envelope: PassphraseEnvelope, sessionKey: CryptoKey }> => {
  const saltBytes = randomBytes(keyDeriver.salt_bytes)
  const header = {
    method:            'passphrase',
    unlock_id:         naming.unlock_id,
    unlocklabel:       naming.unlocklabel,
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(saltBytes),
  } as const
  const passphraseKey = await passphraseKeyOf(keyDeriver, passphrase, saltBytes)
  const envelopeBinding = binding(scope, vaultId, header)
  const wrapped = await wrapKeyUnder(passphraseKey, vaultKey, envelopeBinding)
  const sessionKey = await unwrapKeyUnder(passphraseKey, wrapped, envelopeBinding, SessionUsage)
  return { envelope: { ...header, vault_key_wrapped: wrapped }, sessionKey }
}

/**
 * The vaultKey out of whichever of `bundle`'s passphrase envelopes `passphrase` opens -- or, given
 * `unlockId`, out of that one envelope only. Each envelope tried costs one key derivation, in the
 * order the bundle lists them, and the first that opens ends the search. An envelope refusing to
 * open IS the passphrase check: there is no comparison.
 *
 * Refuses with kind `absent_unlock` when `unlockId` names no passphrase envelope of the bundle,
 * `unknown_key_deriver` when every envelope it would try was made by a key
 * deriver other than `keyDeriver`, `corrupt_record` when one it would try has a salt that is not
 * base64url, or not `keyDeriver.salt_bytes` long, and `wrong_passphrase` when none it tried opens.
 *
 * @returns Both lives of the vaultKey, and the `unlock_id` of the envelope that opened.
 */
export const openWithPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => {
  const passphrases = bundle.unlocks.filter((envelope) => envelope.method === 'passphrase')
  const aimed = unlockId === undefined ? passphrases : passphrases.filter((envelope) => envelope.unlock_id === unlockId)
  if (aimed.length === 0) {
    throw new VaultError('absent_unlock', "None of this vault's passphrases has that unlock_id: it may have been removed on another device. Look again at the snapshot's unlocks.")
  }
  const derivable = aimed.filter((envelope) => envelope.key_deriver_label === keyDeriver.key_deriver_label)
  if (derivable.length === 0) {
    throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
  }
  // Checked for every envelope before the first derivation, so the outcome never hangs on order:
  // a salt the deriver's own label says it never made is a damaged record, not a wrong passphrase.
  // (Here rather than in the record's schema, which every entry point's bundle carries whole.)
  if (derivable.some((envelope) => saltBytesOf(envelope.salt_b64)?.length !== keyDeriver.salt_bytes)) {
    throw new VaultError('corrupt_record', "One of this vault's passphrases is stored with a salt its key deriver could not have made: the bundle is damaged. It was left as it is.")
  }
  for (const envelope of derivable) {
    const opened = await tryPassphrase(keyDeriver, passphrase, scope, bundle.vault_id, envelope)
    if (opened !== null) { return { ...opened, unlockId: envelope.unlock_id } }
  }
  throw new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again.")
}

/** An envelope's salt as bytes, or null when its base64url text is not base64url. */
const saltBytesOf = (saltB64: string): Uint8Array | null => {
  try {
    return fromB64(saltB64)
  } catch {
    return null
  }
}

/** Both lives of the vaultKey out of one passphrase envelope, or null when it will not open. */
const tryPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultId: string,
  envelope: PassphraseEnvelope,
): Promise<VaultKeyPair | null> => {
  const passphraseKey = await passphraseKeyOf(keyDeriver, passphrase, fromB64(envelope.salt_b64))
  return await tryUnwrap(passphraseKey, scope, vaultId, envelope)
}

/** Both lives of the vaultKey out of `envelope` under `wrappingKey`, or null when it will not open. */
const tryUnwrap = async (wrappingKey: CryptoKey, scope: VaultScope, vaultId: string, envelope: UnlockEnvelope): Promise<VaultKeyPair | null> => {
  const envelopeBinding = binding(scope, vaultId, headerOf(envelope))
  try {
    const transientKey = await unwrapKeyUnder(wrappingKey, envelope.vault_key_wrapped, envelopeBinding, TransientUsage)
    const sessionKey = await unwrapKeyUnder(wrappingKey, envelope.vault_key_wrapped, envelopeBinding, SessionUsage)
    return { transientKey, sessionKey }
  } catch {
    return null
  }
}

/**
 * The public face of an envelope, as a locked vault may show it: its method, id and label, and
 * for a passkey the credential and salt a host asks its authenticator with; never a passphrase's
 * salt, never a wrap.
 *
 * @example Envelope.summarize(bundle.unlocks[0])  // { method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase' }
 * @example Envelope.summarize(passkeyEnvelope)    // { method: 'passkey', unlock_id, unlocklabel: 'laptop', credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }
 */
export const summarize = (envelope: UnlockEnvelope): UnlockSummary => {
  const { method, unlock_id, unlocklabel } = envelope
  if (method === 'passphrase') { return { method, unlock_id, unlocklabel } }
  return { method, unlock_id, unlocklabel, credential_id: envelope.credential_id, prf_salt_b64: envelope.prf_salt_b64 }
}

/**
 * The vaultKey out of whichever of `bundle`'s envelopes `proof` opens: a passphrase as
 * {@link openWithPassphrase} finds it, a passkey as {@link openWithPasskey} does.
 */
export const open = async (
  keyDeriver: KeyDeriver,
  proof: UnlockProof,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => (
  typeof proof === 'string'
    ? await openWithPassphrase(keyDeriver, proof, scope, bundle, unlockId)
    : await openWithPasskey(proof, scope, bundle, unlockId)
)

/**
 * The passkeyKey a passkey's PRF answer makes: HKDF-SHA256 over the answer, its `info` naming the
 * purpose and the credential, so the same answer put to any other use makes another key.
 */
const passkeyKeyOf = async (prfBytes: Uint8Array, credentialId: string): Promise<CryptoKey> => (
  await deriveWrappingKey(prfBytes, cipherBinding('safebyok-vault-v1', PurposeForMethod.passkey, credentialId))
)

/**
 * A passkey envelope around `vaultKey`, for the passkey whose answer `passkey` holds, and the
 * session's handle on the vaultKey through it. The envelope keeps the passkey's credential id and
 * the salt it answered for, so the vault can ask it again; never the answer.
 *
 * @param passkey - What the new passkey answered, over a fresh salt of {@link PasskeySaltBytes}.
 * @param scope - The vault's scope, bound into the wrap.
 * @param vaultId - The vault's id, bound into the wrap.
 * @param naming - The envelope's `unlock_id` and `unlocklabel`.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 * @returns The envelope, and a non-extractable handle on the vaultKey unwrapped from it.
 */
export const sealPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  vaultId: string,
  naming: { unlock_id: string, unlocklabel: string },
  vaultKey: CryptoKey,
): Promise<{ envelope: PasskeyEnvelope, sessionKey: CryptoKey }> => {
  const header = {
    method:        'passkey',
    unlock_id:     naming.unlock_id,
    unlocklabel:   naming.unlocklabel,
    credential_id: passkey.credentialId,
    prf_salt_b64:  passkey.prfSaltB64,
  } as const
  const passkeyKey = await passkeyKeyOf(passkey.prfBytes, passkey.credentialId)
  const envelopeBinding = binding(scope, vaultId, header)
  const wrapped = await wrapKeyUnder(passkeyKey, vaultKey, envelopeBinding)
  const sessionKey = await unwrapKeyUnder(passkeyKey, wrapped, envelopeBinding, SessionUsage)
  return { envelope: { ...header, vault_key_wrapped: wrapped }, sessionKey }
}

/**
 * The vaultKey out of the passkey envelope of the credential that answered `passkey` -- given
 * `unlockId`, only if that is the envelope it names. No key derivation to speak of, and nothing
 * to try in turn: a credential has at most one envelope in a vault.
 *
 * Refuses with kind `absent_unlock` when no passkey envelope of the bundle is that credential's
 * (or the one `unlockId` names is not), `corrupt_record` when its envelope's salt is not base64url
 * of {@link PasskeySaltBytes} bytes, and `wrong_passkey` when the answer is for another salt than
 * the envelope's, or does not open it.
 *
 * @returns Both lives of the vaultKey, and the `unlock_id` of the envelope that opened.
 */
export const openWithPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => {
  const envelope = bundle.unlocks.find((candidate): candidate is PasskeyEnvelope => (
    candidate.method === 'passkey' && candidate.credential_id === passkey.credentialId
    && (unlockId === undefined || candidate.unlock_id === unlockId)
  ))
  if (envelope === undefined) {
    throw new VaultError('absent_unlock', "None of this vault's passkeys is the one that answered: it may have been removed on another device, or be a passkey for another vault. Look again at the snapshot's unlocks.")
  }
  // A salt no envelope this package writes could hold is a damaged record, not a wrong passkey.
  if (saltBytesOf(envelope.prf_salt_b64)?.length !== PasskeySaltBytes) {
    throw new VaultError('corrupt_record', "This vault's passkey is stored with a salt this package could not have made: the bundle is damaged. It was left as it is.")
  }
  if (envelope.prf_salt_b64 !== passkey.prfSaltB64) {
    throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's unlocks list.")
  }
  const passkeyKey = await passkeyKeyOf(passkey.prfBytes, envelope.credential_id)
  const opened = await tryUnwrap(passkeyKey, scope, bundle.vault_id, envelope)
  if (opened === null) {
    throw new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault. Try the passkey again, or unlock with a passphrase.")
  }
  return { ...opened, unlockId: envelope.unlock_id }
}
