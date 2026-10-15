import { describe, expect, it, vi } from 'vitest'
import { makeVaultKey, toB64 } from '../src/crypto'
import * as Envelope from '../src/envelope'
import { VaultError } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import { VaultBundle, type PassphraseEnvelope, type UnlockEnvelope } from '../src/types'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
const vaultId = 'vault-id-u1'

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** A real passphrase envelope around `vaultKey`, labelled `unlocklabel`. */
const sealed = async (passphrase: string, unlocklabel: string, vaultKey: CryptoKey, keyDeriver: KeyDeriver = TH.testDeriver) => {
  const { envelope } = await Envelope.sealPassphrase(keyDeriver, passphrase, scope, vaultId, { unlock_id: `unlock-${unlocklabel}`, unlocklabel }, vaultKey)
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
    const { sessionKey } = await Envelope.sealPassphrase(TH.testDeriver, 'pw', scope, vaultId, { unlock_id: 'unlock-one', unlocklabel: 'one' }, vaultKey)
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
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: bundle.unlocks[0]!.key_deriver_label }
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

  it("does not bind the passphrase epoch: an envelope opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = VaultBundle.parse(TH.bundleOf('u1', { passphrase_epoch: 7, unlocks: [await sealed('pw', 'passphrase', vaultKey)] }))
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-passphrase')
  })
})

describe("Envelope.summarize", () => {
  it("gives the method, id and label, and nothing of the salt or wrap", async () => {
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey())
    expect(Envelope.summarize(envelope)).to.deep.equal({ method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase' })
  })
})
