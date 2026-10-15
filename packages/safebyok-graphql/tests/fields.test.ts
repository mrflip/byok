import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import { BundleFields, ListedLockboxFields, LockboxFields, recordOf, selectionOf } from '../src/fields'

describe("selectionOf", () => {
  it("asks for each field, a ciphered one by its two halves", () => {
    expect(selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])).to.eq('boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }')
  })

  it("asks for a listed lockbox without either ciphered field", () => {
    expect(selectionOf(ListedLockboxFields)).to.eq('format boxlabel revision_id note registered_at changed_at')
  })
})

describe("recordOf", () => {
  it("keeps the fields asked for, leaving out a null one and a GraphQL client's __typename", () => {
    expect(recordOf({ boxlabel: 'openai', note: null, __typename: 'SafebyokLockbox' }, [['boxlabel', 'plain'], ['note', 'plain']])).to.deep.equal({ boxlabel: 'openai' })
  })

  it("gives back a whole lockbox as it was, and a ciphered field as its two halves alone", () => {
    const lockbox = TH.boxOf('openai', 'r1')
    expect(recordOf(lockbox, LockboxFields)).to.deep.equal(lockbox)
    const answered = { ...lockbox, whisper_ciphered: { ...lockbox.whisper_ciphered, __typename: 'SafebyokCiphered' } }
    expect(recordOf(answered, LockboxFields)).to.deep.equal(lockbox)
  })

  it("gives back a bundle's unlock envelopes as they were, never looked inside", () => {
    const bundle = TH.bundleOf('u1', { unlocks: [TH.envelopeOf('passphrase'), TH.envelopeOf('home_phrase')] })
    expect(recordOf(bundle, BundleFields)).to.deep.equal(bundle)
  })

  it("leaves out a lockbox's missing or undefined note", () => {
    const { note: _note, ...noteless } = TH.boxOf('openai', 'r1')
    expect(recordOf({ ...noteless, note: undefined }, LockboxFields)).to.deep.equal(noteless)
    expect(recordOf(noteless, LockboxFields)).to.not.have.property('note')
  })

  it("drops a field the record has not got", () => {
    expect(recordOf({ ...TH.boxOf('openai', 'r1'), vault_id: 'stray' }, LockboxFields)).to.not.have.property('vault_id')
  })

  const NotRecords = [
    [null,           'null'],
    [undefined,      'undefined'],
    ["a lockbox",    'text'],
    [[1, 2],         'a list'],
  ] as const

  for (const [sent, blurb] of NotRecords) {
    it(`gives back ${blurb} as it is, for the VaultDB's validation to refuse`, () => {
      expect(recordOf(sent, LockboxFields)).to.deep.equal(sent)
    })
  }

  it("gives back a ciphered field that is not an object as it is", () => {
    expect(recordOf({ whisper_ciphered: 'not halves' }, LockboxFields)).to.deep.equal({ whisper_ciphered: 'not halves' })
  })
})
