import { describe, expect, it } from 'vitest'
import { Label, Lockbox, LockboxNote, LockboxSummary, VaultBundle, VaultScope, Whisper } from '../src/types'
import { boxOf, bundleOf, scopeOf } from './helpers'

const WhisperCases = [
  // every JSON shape a whisper may take:
  ["sk-ant-api03-fake-fake",          true,   'a string, the common case'],
  ["",                                true,   'even an empty string'],
  [42,                                true,   'a number'],
  [true,                              true,   'a boolean'],
  [["a", "b"],                        true,   'an array'],
  [{ apiKey: "fake", tier: 2 },     true,   'a plain object'],
  [{ orgId: null },                   true,   'null inside a structure: real JSON carries it'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  [null,                              false,  'a bare null: emptying a lockbox is erase\'s job'],
  [() => 'nope',                      false,  'a function is not data'],
  [new Date(),                        false,  'a Date would silently flatten to {}'],
  [new Map([["a", 1]]),               false,  'a Map would silently flatten to {}'],
  [{ when: new Date() },              false,  'a class instance hiding inside an object'],
] as const

describe("Whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(Whisper.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands back the value unchanged when it passes", () => {
    const bag = { apiKey: 'fake', scopes: ['read', 'write'] }
    expect(Whisper.parse(bag)).to.deep.equal(bag)
  })
})

const LabelCases = [
  // regular usage:
  ["anthropic_api_key",  true,   'lowercase words joined by underscores'],
  ["anthropic",          true,   'a plain lowercase word'],
  ["ab",                 true,   'two characters is enough'],
  ["a2",                 true,   'may end in a digit'],
  ["a_1_b_2",            true,   'digits may follow each underscore'],
  // edge cases:
  ["a",                  false,  'one character is too short'],
  ["2fast",              false,  'must start with a letter'],
  ["dev_",               false,  'may not end in an underscore'],
  ["_dev",               false,  'may not start with an underscore'],
  ["dev__key",           false,  'underscores come one at a time'],
  ["ANTHROPIC_API_KEY",  false,  'lowercase only'],
  ["anthropic key",      false,  'no spaces'],
  ["anthropic-key",      false,  'no hyphens'],
  ["",                   false,  'never empty'],
  ["x".repeat(41),       false,  'forty-one characters is one too many'],
  ["x".repeat(40),       true,   'forty characters is the ceiling'],
] as const

describe("Label", () => {
  for (const [candidate, expected, blurb] of LabelCases) {
    it(blurb, () => { expect(Label.safeParse(candidate).success).to.eq(expected) })
  }
})

const ScopeCases = [
  // regular usage:
  [scopeOf('u1'),                                  true,   'an applabel, a user_id and a vaultlabel'],
  [scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  // refused:
  [{ ...scopeOf('u1'), user_id: '' },              false,  'an empty user_id names no one'],
  [{ ...scopeOf('u1'), applabel: 'Acme' },         false,  'an applabel outside the label grammar'],
  [{ applabel: 'acme', user_id: 'u1' },            false,  'a scope missing its vaultlabel'],
] as const

describe("VaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(VaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

const BundleCases = [
  // regular usage:
  [bundleOf('u1'),                                         true,   'a whole bundle'],
  // refused, as a damaged or foreign record:
  [{ ...bundleOf('u1'), format: 'safebyok-vault-v2' },    false,  'a format this version does not know'],
  [{ ...bundleOf('u1'), passphrase_epoch: 0 },            false,  'an epoch starts at one'],
  [{ ...bundleOf('u1'), passphrase_epoch: 1.5 },          false,  'an epoch is a whole number'],
  [{ ...bundleOf('u1'), vault_id: '' },                   false,  'an empty vault_id'],
  [{ ...bundleOf('u1'), vault_key_passphrase_wrapped: { cipher_iv_b64: 'iv' } }, false, 'an envelope missing its ciphertext'],
] as const

describe("VaultBundle", () => {
  for (const [candidate, expected, blurb] of BundleCases) {
    it(blurb, () => { expect(VaultBundle.safeParse(candidate).success).to.eq(expected) })
  }
})

const { note: _note, ...notelessBox } = boxOf('anthropic_api_key', 'a1')
const LockboxCases = [
  // regular usage:
  [boxOf('anthropic_api_key', 'a1'),                       true,   'a whole lockbox, with its note'],
  [notelessBox,                                            true,   'a lockbox with no note field at all'],
  // a stored vault is a contract: earlier versions wrote a lockbox with no note as `note:
  // undefined`, which IndexedDB's structured clone keeps, so it still reads as no note
  [{ ...notelessBox, note: undefined },                    true,   'a lockbox an earlier version stored with an undefined note'],
  // refused, as a damaged or foreign record:
  [{ ...notelessBox, note: null },                         false,  'a null note'],
  [{ ...notelessBox, note: 'n'.repeat(257) },              false,  'a note over 256 characters'],
  [{ ...notelessBox, format: 'safebyok-lockbox-v2' },      false,  'a format this version does not know'],
] as const

describe("Lockbox", () => {
  for (const [candidate, expected, blurb] of LockboxCases) {
    it(blurb, () => { expect(Lockbox.safeParse(candidate).success).to.eq(expected) })
  }
})

const NoteCases = [
  // regular usage:
  ["work account",         true,   'a few words'],
  ["",                     true,   'even empty text'],
  ["n".repeat(256),        true,   'two hundred fifty-six characters is the ceiling'],
  // refused:
  ["n".repeat(257),        false,  'two hundred fifty-seven is one too many'],
  [null,                   false,  'null: a lockbox with no note stores no note field'],
  [42,                     false,  'a number is not a note'],
] as const

describe("LockboxNote", () => {
  for (const [candidate, expected, blurb] of NoteCases) {
    it(blurb, () => { expect(LockboxNote.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands a note back as it is", () => { expect(LockboxNote.parse('work account')).to.eq('work account') })
})

const { format: _format, lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...notelessSummary } = notelessBox
const SummaryNoteCases = [
  // however a lockbox's lack of a note was stored, its summary says null:
  [notelessSummary,                                  null,            'a lockbox stored with no note field, as one is today'],
  [{ ...notelessSummary, note: undefined },          null,            'a lockbox an earlier version stored with an undefined note'],
  [{ ...notelessSummary, note: null },               null,            'a summary already null, parsed again'],
  // and a note is kept as it is:
  [{ ...notelessSummary, note: 'work account' },     "work account",  'a lockbox with a note'],
] as const

describe("LockboxSummary", () => {
  for (const [candidate, expected, blurb] of SummaryNoteCases) {
    it(blurb, () => { expect(LockboxSummary.parse(candidate).note).to.eq(expected) })
  }

  it("refuses a note over 256 characters, as a stored lockbox does", () => {
    expect(LockboxSummary.safeParse({ ...notelessSummary, note: 'n'.repeat(257) }).success).to.be.false
  })

  it("strips the two ciphered fields and the format from a whole lockbox", () => {
    const summary = LockboxSummary.parse(boxOf('anthropic_api_key', 'a1'))
    expect(Object.keys(summary)).to.have.members(['boxlabel', 'revision_id', 'note', 'created_at', 'updated_at'])
  })
})
