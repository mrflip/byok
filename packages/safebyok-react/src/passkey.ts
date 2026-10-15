import { PasskeySaltBytes, VaultError, type PasskeyProof, type UnlockSummary } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'

/**
 * The WebAuthn half of a passkey unlock, which the core leaves to the host: `createPasskey` makes a
 * new passkey and asks it for its first answer, `askPasskey` asks one of a vault's passkeys for its
 * answer again. Both hand back a {@link PasskeyProof} for the vault (`addPasskey`, `unlock`), or
 * null when the user dismissed the prompt. Nothing here imports React: any framework's host may use
 * them.
 *
 * These passkeys are not logins. Each is a fresh credential of its own, made under a random user
 * handle so it never replaces a passkey the host's sign-in uses; its challenge is random and no
 * server ever checks the assertion. What matters is the PRF extension's answer, which only the
 * authenticator can give, and only after the user's fingerprint, face or PIN: every call asks for
 * user verification, since an authenticator answers differently without it.
 */

/**
 * True when this browser offers WebAuthn at all: whether to show a passkey button. Whether its
 * authenticator offers the PRF extension is learned only by trying; `createPasskey` refuses with
 * kind 'passkey_unavailable' when it does not.
 *
 * @example passkeysAvailable() && <button onClick={addFingerprint}>Add fingerprint unlock</button>
 */
export const passkeysAvailable = (): boolean => (
  typeof PublicKeyCredential === 'function' && typeof navigator === 'object' && 'credentials' in navigator
)

/** What `createPasskey` asks of the host: how the authenticator shows the new passkey. */
export type CreatePasskeyOpts = {
  /**
   * The relying party: the `name` the authenticator shows (`Acme`), and the `id`, the domain the
   * passkey belongs to -- by default the page's own. A passkey made under one `id` answers only to
   * pages that ask with it: pass the same `rpId` to `askPasskey`.
   */
  rp:       { name: string, id?: string | undefined }
  /** How the authenticator lists the passkey: an account `name` (an email, say) and a `displayName`. */
  user:     { name: string, displayName: string }
  /** How long the browser waits for the user, in milliseconds; the browser's default otherwise. */
  timeout?: number | undefined
}

/** What `askPasskey` may be told: the relying party's `rpId`, if the passkey was made under one, and a `timeout`. */
export type AskPasskeyOpts = {
  rpId?:    string | undefined
  timeout?: number | undefined
}

/**
 * A new passkey, and its first answer over a fresh salt: what `vault.addPasskey` takes. The browser
 * asks the user to make the passkey (a fingerprint, a face, a security key), and, on authenticators
 * that answer only when asked again, to touch it once more.
 *
 * Resolves null when the user dismisses the prompt (or lets it time out). Refuses with kind
 * 'passkey_unavailable' when the browser has no WebAuthn, or the authenticator does not offer the
 * PRF extension, and 'bad_option' when the relying party's `id` does not fit this page. A passkey
 * made but never answered for -- no PRF, or the second touch dismissed -- is useless to the
 * vault, and stays on the authenticator until the user deletes it.
 *
 * @example
 *   const passkey = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
 *   if (passkey !== null) { await vault.addPasskey(passphrase, passkey, { unlocklabel: 'laptop_fingerprint' }) }
 */
export const createPasskey = async (opts: CreatePasskeyOpts): Promise<PasskeyProof | null> => {
  ensureAvailable()
  const prfSaltBytes = crypto.getRandomValues(new Uint8Array(PasskeySaltBytes))
  const created = await askAuthenticator(() => navigator.credentials.create({
    publicKey: {
      rp:                     { name: opts.rp.name, ...optional('id', opts.rp.id) },
      // A random handle, never the host's own user id: an authenticator holding a passkey for the
      // same site and handle would replace it, and the host's sign-in passkey with it.
      user:                   { ...opts.user, id: crypto.getRandomValues(new Uint8Array(16)) },
      challenge:              crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams:       [{ type: 'public-key', alg: -8 }, { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'discouraged', userVerification: 'required' },
      ...optional('timeout', opts.timeout),
      extensions:             { prf: { eval: { first: prfSaltBytes } } },
    },
  }))
  if (created === null) { return null }
  const credentialId = toB64(new Uint8Array(created.rawId))
  const { prf } = created.getClientExtensionResults()
  if (prf?.results !== undefined) { return proofOf(credentialId, prfSaltBytes, prf.results.first) }
  if (prf?.enabled !== true) { throw noPrf() }
  // Many authenticators turn PRF on as they make the passkey, and answer only when asked again.
  const asked = await askAuthenticator(() => navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      ...optional('rpId', opts.rp.id),
      allowCredentials: [{ type: 'public-key', id: created.rawId }],
      userVerification: 'required',
      ...optional('timeout', opts.timeout),
      extensions:       { prf: { eval: { first: prfSaltBytes } } },
    },
  }))
  if (asked === null) { return null }
  const answer = asked.getClientExtensionResults().prf?.results?.first
  if (answer === undefined) { throw noPrf() }
  return proofOf(credentialId, prfSaltBytes, answer)
}

/**
 * The answer of whichever of a vault's passkeys the user touches: what `vault.unlock` (or any
 * change's proof) takes. `unlocks` is the snapshot's list, whole; the browser offers the user each
 * passkey in it, and asks the one chosen for its answer over that passkey's own salt.
 *
 * Resolves null when the user dismisses the prompt (or lets it time out, or has none of these
 * passkeys at hand). Refuses with kind 'absent_unlock' when `unlocks` holds no passkey,
 * 'corrupt_record' when one's `credential_id` or `prf_salt_b64` is not base64url,
 * 'passkey_unavailable' when the browser has no WebAuthn or the passkey gives no PRF answer, and
 * 'bad_option' when `opts.rpId` does not fit this page.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().unlocks)
 *   if (passkey !== null) { await vault.unlock(passkey) }
 */
export const askPasskey = async (unlocks: readonly UnlockSummary[], opts: AskPasskeyOpts = {}): Promise<PasskeyProof | null> => {
  ensureAvailable()
  const passkeys = unlocks.flatMap((unlock) => (unlock.method === 'passkey' ? [askable(unlock)] : []))
  if (passkeys.length === 0) {
    throw new VaultError('absent_unlock', 'This vault has no passkey to ask: unlock it with a passphrase, then add one.')
  }
  const asked = await askAuthenticator(() => navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      ...optional('rpId', opts.rpId),
      allowCredentials: passkeys.map(({ credentialBytes }) => ({ type: 'public-key', id: credentialBytes })),
      userVerification: 'required',
      ...optional('timeout', opts.timeout),
      extensions:       { prf: { evalByCredential: Object.fromEntries(passkeys.map(({ credentialId, saltBytes }) => [credentialId, { first: saltBytes }])) } },
    },
  }))
  if (asked === null) { return null }
  const credentialId = toB64(new Uint8Array(asked.rawId))
  const answering = passkeys.find((passkey) => passkey.credentialId === credentialId)
  const answer = asked.getClientExtensionResults().prf?.results?.first
  // A browser answers only for a credential it was offered; one that does not has nothing to unlock.
  if (answering === undefined || answer === undefined) { throw noPrf() }
  return proofOf(credentialId, answering.saltBytes, answer)
}

/** A passkey of the vault's, its credential id and salt as bytes for WebAuthn. */
const askable = (unlock: UnlockSummary & { method: 'passkey' }) => {
  try {
    return {
      credentialId:    unlock.credential_id,
      credentialBytes: fromB64(unlock.credential_id) as Uint8Array<ArrayBuffer>,
      saltBytes:       fromB64(unlock.prf_salt_b64) as Uint8Array<ArrayBuffer>,
    }
  } catch (err) {
    throw new VaultError('corrupt_record', "One of this vault's passkeys is stored with a credential_id or prf_salt_b64 that is not base64url: the bundle is damaged. Unlock with a passphrase.", { cause: err })
  }
}

/** A PasskeyProof of the credential `credentialId`, answering `answer` over `saltBytes`. */
const proofOf = (credentialId: string, saltBytes: Uint8Array, answer: BufferSource): PasskeyProof => ({
  credentialId,
  prfSaltB64: toB64(saltBytes),
  prfBytes:   bytesOf(answer),
})

/** A copy of `source`'s bytes, whichever kind of buffer the browser handed back. */
const bytesOf = (source: BufferSource): Uint8Array => (
  // ArrayBuffer.isView, not instanceof, holds across realms (an iframe's buffers, say).
  Uint8Array.from(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
)

/** `{ [field]: val }`, or nothing when `val` is undefined: WebAuthn's options take a field left out, never one set to undefined. */
const optional = <FieldT extends string, ValT>(field: FieldT, val: ValT | undefined): Partial<Record<FieldT, ValT>> => (
  val === undefined ? {} : { [field]: val } as Record<FieldT, ValT>
)

const ensureAvailable = () => {
  if (! passkeysAvailable()) {
    throw new VaultError('passkey_unavailable', 'This browser offers no passkeys (WebAuthn): unlock with a passphrase.')
  }
}

const noPrf = () => new VaultError('passkey_unavailable', "This passkey's authenticator does not offer the PRF extension a passkey unlock needs: unlock with a passphrase, or try another device or security key.")

/**
 * The credential a WebAuthn call resolves with, or null when the user dismissed it. Its other
 * refusals become VaultErrors, the browser's own error kept as the cause.
 */
const askAuthenticator = async (call: () => Promise<Credential | null>): Promise<PublicKeyCredential | null> => {
  let credential: Credential | null
  try {
    credential = await call()
  } catch (err) {
    // The browser says NotAllowedError for a dismissal, a timeout and "none of these here" alike, by design.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) { return null }
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new VaultError('bad_option', "The browser refused the passkey's relying party: its id must be this page's domain, or one it belongs to.", { cause: err })
    }
    throw new VaultError('passkey_unavailable', "The browser could not ask for a passkey: unlock with a passphrase. The browser's own error is this error's cause.", { cause: err })
  }
  return credential === null ? null : credential as PublicKeyCredential
}
