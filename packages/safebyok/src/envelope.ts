import * as Z from 'zod/mini'
import { cipherBinding, fromB64, importWrappingKeyBytes, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './key-deriver-spec'
import type { PassphraseEnvelope, UnlockEnvelope, UnlockMethod, UnlockSummary, VaultBundle, VaultScope } from './types'

/**
 * Unlock envelopes: each the vaultKey wrapped under a key one method makes, so a vault has several
 * ways in and one vaultKey behind them all. Imported whole, as `Envelope`: `Envelope.sealPassphrase`
 * makes one, `Envelope.openWithPassphrase` finds the one a passphrase opens, `Envelope.summarize`
 * gives its public face. Internal to the package; the vault calls it.
 *
 * Each envelope's wrap is bound to its vault and to its own public header -- every field but the
 * wrap itself, encoded with its keys sorted -- under a purpose its method names. The bundle's
 * `passphrase_epoch` is not in it: a change to one envelope bumps the epoch, and the others, whose
 * passphrases this device does not hold, must still open.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or under a new passphraseKey); the
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
  // Every envelope is a passphrase's while that is the only method; a second method's envelopes
  // are passed over here.
  const aimed = unlockId === undefined ? bundle.unlocks : bundle.unlocks.filter((envelope) => envelope.unlock_id === unlockId)
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
  if (derivable.some((envelope) => saltBytesOf(envelope)?.length !== keyDeriver.salt_bytes)) {
    throw new VaultError('corrupt_record', "One of this vault's passphrases is stored with a salt its key deriver could not have made: the bundle is damaged. It was left as it is.")
  }
  for (const envelope of derivable) {
    const opened = await tryPassphrase(keyDeriver, passphrase, scope, bundle.vault_id, envelope)
    if (opened !== null) { return { ...opened, unlockId: envelope.unlock_id } }
  }
  throw new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again.")
}

/** An envelope's passphraseSalt as bytes, or null when its `salt_b64` is not base64url. */
const saltBytesOf = (envelope: PassphraseEnvelope): Uint8Array | null => {
  try {
    return fromB64(envelope.salt_b64)
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
  const envelopeBinding = binding(scope, vaultId, headerOf(envelope))
  try {
    const transientKey = await unwrapKeyUnder(passphraseKey, envelope.vault_key_wrapped, envelopeBinding, TransientUsage)
    const sessionKey = await unwrapKeyUnder(passphraseKey, envelope.vault_key_wrapped, envelopeBinding, SessionUsage)
    return { transientKey, sessionKey }
  } catch {
    return null
  }
}

/**
 * The public face of an envelope, as a locked vault may show it: its method, id and label, and
 * none of its salt or wrap.
 *
 * @example Envelope.summarize(bundle.unlocks[0])  // { method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase' }
 */
export const summarize = (envelope: UnlockEnvelope): UnlockSummary => ({
  method:      envelope.method,
  unlock_id:   envelope.unlock_id,
  unlocklabel: envelope.unlocklabel,
})
