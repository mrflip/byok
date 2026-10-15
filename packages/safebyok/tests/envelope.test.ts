import { describe, expect, it, vi } from 'vitest'
import { cipherBinding, deriveWrappingKey, makeVaultKey, toB64, unwrapKeyUnder } from '../src/crypto'
import * as Envelope from '../src/envelope'
import { VaultError } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import { VaultBundle, type PasskeyEnvelope, type PasskeyProof, type PassphraseEnvelope, type UnlockEnvelope } from '../src/types'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
/** The bundle every envelope here is sealed for: its `vault_id` and `registered_at` are what a wrap binds of it. */
const identity = TH.bundleOf('u1')

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** A real passphrase envelope around `vaultKey`, labelled `unlocklabel`. */
const sealed = async (passphrase: string, unlocklabel: string, vaultKey: CryptoKey, keyDeriver: KeyDeriver = TH.testDeriver) => {
  const { envelope } = await Envelope.sealPassphrase(keyDeriver, passphrase, scope, identity, { unlock_id: `unlock-${unlocklabel}`, unlocklabel }, vaultKey)
  return envelope
}

/** A bundle of `unlocks`, validated as storage would read it back. */
const bundleWith = (unlocks: UnlockEnvelope[]): VaultBundle => VaultBundle.parse(TH.bundleOf('u1', { unlocks }))

/** Expect `operation` to reject with a VaultError of `kind`. */
const expectRefusal = async (operation: Promise<unknown>, kind: VaultError['kind']): Promise<VaultError> => {
  try {
    await operation
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq(kind)
    return err as VaultError
  }
  throw new Error(`expected a VaultError of kind '${kind}', but nothing was thrown`)
}

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

describe("Envelope.sealPassphrase", () => {
  it("makes a valid passphrase envelope that names its deriver and a fresh salt", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'passphrase', vaultKey)
    const two = await sealed('pw', 'home_phrase', vaultKey)
    expect(VaultBundle.safeParse(TH.bundleOf('u1', { unlocks: [one, two] })).success).to.be.true
    expect(one).to.include({ method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one.salt_b64).to.not.eq(two.salt_b64)
  })

  it("hands back a session handle on the vaultKey that cannot be exported", async () => {
    const vaultKey = await makeVaultKey()
    const { sessionKey } = await Envelope.sealPassphrase(TH.testDeriver, 'pw', scope, identity, { unlock_id: 'unlock-one', unlocklabel: 'one' }, vaultKey)
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })
})

describe("Envelope.openWithPassphrase", () => {
  it("opens the envelope the passphrase belongs to, and says which", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'passphrase', vaultKey), await sealed('second', 'home_phrase', vaultKey)])
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'second', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-home_phrase')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
  })

  it("tries the envelopes in order, one derivation each, and stops at the first that opens", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey), await sealed('third', 'three', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("refuses a wrong passphrase only after trying every envelope", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const err = await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'neither', scope, bundle), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(err.message).to.not.include('neither')
  })

  it("aimed at one envelope, derives once, and refuses a passphrase that is another's", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle, 'unlock-two')
    expect(opened.unlockId).to.eq('unlock-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'unlock-two'), 'wrong_passphrase')
  })

  it("refuses an aim at an unlock_id the bundle does not hold", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'unlock-gone'), 'absent_unlock')
  })

  it("refuses as unknown_key_deriver when no envelope it would try was made by this deriver", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    await expectRefusal(Envelope.openWithPassphrase(alienDeriver, 'first', scope, bundle), 'unknown_key_deriver')
  })

  it("refuses as corrupt_record, deriving nothing, when an envelope it would try has a salt of another length", async () => {
    const vaultKey = await makeVaultKey()
    // 'c2FsdA' is four bytes: base64url that decodes, so it passes the schema, but no 16-byte deriver made it.
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
    const { keyDeriver, derivations } = countingDeriver()
    await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'first', scope, bundle), 'corrupt_record')
    expect(derivations).not.toHaveBeenCalled()
  })

  for (const [saltB64, blurb] of [['not base64!', 'text that is not base64url'], ['aaaaa', 'base64url letters that decode to no whole bytes']] as const) {
    it(`refuses as corrupt_record, deriving nothing, when an envelope it would try has a salt of ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: saltB64 }])
      const { keyDeriver, derivations } = countingDeriver()
      await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'first', scope, bundle), 'corrupt_record')
      expect(derivations).not.toHaveBeenCalled()
    })
  }

  it("passes over envelopes another deriver made, and opens one this deriver did", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey, alienDeriver), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'wrong_passphrase')
  })
})

/** Each of an envelope's public fields altered: every one is in its wrap's binding. */
const TamperCases: readonly (readonly [Partial<PassphraseEnvelope>, string])[] = [
  [{ unlock_id: 'unlock-elsewhere' },            'its unlock_id swapped'],
  [{ unlocklabel: 'relabelled' },                'its unlocklabel swapped'],
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
]

describe("an envelope's binding", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([{ ...await sealed('pw', 'passphrase', vaultKey), ...altered }])
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: (bundle.unlocks[0] as PassphraseEnvelope).key_deriver_label }
      await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'pw', scope, bundle), 'wrong_passphrase')
    })
  }

  it("refuses to open with its salt swapped for another envelope's", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'one', vaultKey)
    const two = await sealed('pw', 'two', vaultKey)
    const bundle = bundleWith([{ ...one, salt_b64: two.salt_b64 }])
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const vaultKey = await makeVaultKey()
    const envelope = await sealed('pw', 'passphrase', vaultKey)
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, otherVault), 'wrong_passphrase')
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', TH.scopeOf('u2'), bundleWith([envelope])), 'wrong_passphrase')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, redated), 'wrong_passphrase')
  })

  it("does not bind the unlock epoch: an envelope opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = VaultBundle.parse(TH.bundleOf('u1', { unlock_epoch: 7, unlocks: [await sealed('pw', 'passphrase', vaultKey)] }))
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-passphrase')
  })
})

describe("Envelope.summarize", () => {
  it("gives the method, id and label, and nothing of the salt or wrap", async () => {
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey())
    expect(Envelope.summarize(envelope)).to.deep.equal({ method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase' })
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and not its wrap", () => {
    const envelope = TH.passkeyEnvelopeOf('laptop')
    expect(Envelope.summarize(envelope)).to.deep.equal({
      method: 'passkey', unlock_id: 'unlock-laptop', unlocklabel: 'laptop', credential_id: 'cred-laptop', prf_salt_b64: envelope.prf_salt_b64,
    })
  })
})

/** A real passkey envelope around `vaultKey`, labelled `unlocklabel`, for the passkey `passkey` answered. */
const sealedPasskey = async (passkey: PasskeyProof, unlocklabel: string, vaultKey: CryptoKey) => {
  const { envelope } = await Envelope.sealPasskey(passkey, scope, identity, { unlock_id: `unlock-${unlocklabel}`, unlocklabel }, vaultKey)
  return envelope
}

describe("Envelope.sealPasskey", () => {
  it("makes a valid passkey envelope that keeps the credential and its salt, and never the answer", async () => {
    const passkey = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(passkey, 'laptop', await makeVaultKey())
    const bundle = TH.bundleOf('u1', { unlocks: [TH.envelopeOf('passphrase'), envelope] })
    expect(VaultBundle.safeParse(bundle).success).to.be.true
    expect(envelope).to.include({ method: 'passkey', unlock_id: 'unlock-laptop', unlocklabel: 'laptop', credential_id: passkey.credentialId, prf_salt_b64: passkey.prfSaltB64 })
    expect(JSON.stringify(envelope)).to.not.include(toB64(passkey.prfBytes))
  })

  it("hands back a session handle on the vaultKey that cannot be exported", async () => {
    const { sessionKey } = await Envelope.sealPasskey(await TH.passkeyOf('laptop'), scope, identity, { unlock_id: 'unlock-laptop', unlocklabel: 'laptop' }, await makeVaultKey())
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })
})

describe("Envelope.openWithPasskey", () => {
  it("opens the envelope of the credential that answered, among passphrases and other passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const phone = await TH.passkeyOf('phone')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey), await sealedPasskey(phone, 'phone', vaultKey)])
    const opened = await Envelope.openWithPasskey(phone, scope, bundle)
    expect(opened.unlockId).to.eq('unlock-phone')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
    const aimed = await Envelope.openWithPasskey(laptop, scope, bundle, 'unlock-laptop')
    expect(aimed.unlockId).to.eq('unlock-laptop')
  })

  it("refuses as absent_unlock a passkey the vault does not hold, or one aimed at another way in", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    await expectRefusal(Envelope.openWithPasskey(await TH.passkeyOf('stranger'), scope, bundle), 'absent_unlock')
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, bundle, 'unlock-passphrase'), 'absent_unlock')
  })

  it("refuses as wrong_passkey an answer over another salt, or one that does not open the envelope", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', vaultKey)])
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    await expectRefusal(Envelope.openWithPasskey(await TH.passkeyOf('laptop', otherSalt), scope, bundle), 'wrong_passkey')
    await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, scope, bundle), 'wrong_passkey')
  })

  it("refuses as corrupt_record an envelope whose salt is not base64url of 32 bytes", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', vaultKey)
    for (const prfSaltB64 of ['not base64url!', toB64(new Uint8Array(16))]) {
      const bundle = bundleWith([{ ...envelope, prf_salt_b64: prfSaltB64 }])
      await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfSaltB64 }, scope, bundle), 'corrupt_record')
    }
  })

  it("never refuses with the answer in the error", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfBytes: laptop.prfBytes.toReversed() }, scope, bundle), 'wrong_passkey')
    expect(JSON.stringify({ kind: err.kind, message: err.message, cause: err.cause })).to.not.include(toB64(laptop.prfBytes))
  })
})

const PasskeyTamperCases = [
  [{ unlock_id: 'unlock-other' },     'its unlock_id changed'],
  [{ unlocklabel: 'other' },          'its unlocklabel changed'],
  [{ credential_id: 'Y3JlZC1vdGhlcg' }, 'its credential_id swapped, the answer kept'],
] as const

describe("a passkey envelope's binding", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const laptop = await TH.passkeyOf('laptop')
      const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), ...altered }])
      const answering = { ...laptop, credentialId: (bundle.unlocks[0] as PasskeyEnvelope).credential_id }
      await expectRefusal(Envelope.openWithPasskey(answering, scope, bundle), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), prf_salt_b64: otherSalt }])
    await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfSaltB64: otherSalt }, scope, bundle), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, otherVault), 'wrong_passkey')
    await expectRefusal(Envelope.openWithPasskey(laptop, TH.scopeOf('u2'), bundleWith([envelope])), 'wrong_passkey')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, redated), 'wrong_passkey')
  })
})

/** Unwrap `envelope` under the key HKDF makes of `prfBytes` with `info`, its wrap bound to `binding`. */
const unwrapsUnder = async (envelope: PasskeyEnvelope, prfBytes: Uint8Array, info: Uint8Array, binding: Uint8Array) => {
  const passkeyKey = await deriveWrappingKey(prfBytes, info)
  return await unwrapKeyUnder(passkeyKey, envelope.vault_key_wrapped, binding, { extractable: false, usage: ['wrapKey'] })
}

describe("a passkey envelope's key", () => {
  it("is HKDF over the answer with the wrap's whole binding as its info: scope, vault_id, registered_at, purpose and header", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wrapped: _wrapped, ...header } = envelope
    const binding = cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    expect(await unwrapsUnder(envelope, laptop.prfBytes, binding, binding)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wrapped: _wrapped, ...header } = envelope
    const binding = cipherBinding('safebyok-vault-v1', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    const vaultlessInfo = cipherBinding('safebyok-vault-v1', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(envelope, laptop.prfBytes, vaultlessInfo, binding)).rejects.toThrow()
  })
})

describe("Envelope.open", () => {
  it("opens with a passphrase as openWithPassphrase does, passing over the passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealedPasskey(await TH.passkeyOf('laptop'), 'laptop', vaultKey), await sealed('pw', 'passphrase', vaultKey)])
    const opened = await Envelope.open(keyDeriver, 'pw', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.open(keyDeriver, 'pw', scope, bundle, 'unlock-laptop'), 'absent_unlock')
  })

  it("opens with a passkey's answer as openWithPasskey does, with no key derivation", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    const opened = await Envelope.open(keyDeriver, laptop, scope, bundle)
    expect(opened.unlockId).to.eq('unlock-laptop')
    expect(derivations).not.toHaveBeenCalled()
  })
})
