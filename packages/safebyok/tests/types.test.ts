import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import { EpochMillis, FarFuture, FarPast, Label, Lockbox, LockboxNote, LockboxSummary, VaultBundle, VaultScope, Whisper } from '../src/types'
import * as TH from './test-helpers'

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
  [TH.scopeOf('u1'),                                  true,   'an applabel, a user_id and a vaultlabel'],
  [TH.scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  // refused:
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id names no one'],
  [{ ...TH.scopeOf('u1'), applabel: 'Acme' },         false,  'an applabel outside the label grammar'],
  [{ applabel: 'acme', user_id: 'u1' },            false,  'a scope missing its vaultlabel'],
] as const

describe("VaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(VaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'
const { registered_at: _bundleTime, ...bundleWithoutTime } = TH.bundleOf('u1')

const BundleCases = [
  // regular usage:
  [TH.bundleOf('u1'),                                         true,   'a whole bundle'],
  // refused, as a damaged or foreign record:
  [{ ...TH.bundleOf('u1'), format: 'safebyok-vault-v2' },    false,  'a format this version does not know'],
  [{ ...TH.bundleOf('u1'), passphrase_epoch: 0 },            false,  'an epoch starts at one'],
  [{ ...TH.bundleOf('u1'), passphrase_epoch: 1.5 },          false,  'an epoch is a whole number'],
  [{ ...TH.bundleOf('u1'), vault_id: '' },                   false,  'an empty vault_id'],
  [{ ...TH.bundleOf('u1'), vault_key_passphrase_wrapped: { cipher_iv_b64: 'iv' } }, false, 'an envelope missing its ciphertext'],
  [{ ...TH.bundleOf('u1'), registered_at: 1_792_022_400 },   false,  'a registered_at in epoch seconds'],
  [{ ...TH.bundleOf('u1'), registered_at: Infinity },        false,  'a registered_at that never comes'],
  [{ ...TH.bundleOf('u1'), registered_at: OldIso },          false,  'a registered_at as an ISO string'],
  [bundleWithoutTime,                                      false,  'a bundle missing its registered_at'],
  [{ ...bundleWithoutTime, created_at: OldIso, updated_at: OldIso }, false, 'a bundle from before its time was named registered_at'],
] as const

describe("VaultBundle", () => {
  for (const [candidate, expected, blurb] of BundleCases) {
    it(blurb, () => { expect(VaultBundle.safeParse(candidate).success).to.eq(expected) })
  }
})

const { note: _note, ...notelessBox } = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, changed_at: _boxChanged, ...boxWithoutTimes } = notelessBox
const LockboxCases = [
  // regular usage:
  [TH.boxOf('anthropic_api_key', 'a1'),                       true,   'a whole lockbox, with its note'],
  [notelessBox,                                            true,   'a lockbox with no note field at all'],
  // a stored vault is a contract: earlier versions wrote a lockbox with no note as `note:
  // undefined`, which IndexedDB's structured clone keeps, so it still reads as no note
  [{ ...notelessBox, note: undefined },                    true,   'a lockbox an earlier version stored with an undefined note'],
  // refused, as a damaged or foreign record:
  [{ ...notelessBox, note: null },                         false,  'a null note'],
  [{ ...notelessBox, note: 'n'.repeat(257) },              false,  'a note over 256 characters'],
  [{ ...notelessBox, format: 'safebyok-lockbox-v2' },      false,  'a format this version does not know'],
  [{ ...notelessBox, changed_at: FarFuture + 1 },          false,  'a changed_at past FarFuture'],
  [{ ...notelessBox, registered_at: Infinity },            false,  'a registered_at that never comes'],
  [{ ...notelessBox, changed_at: null },                   false,  'a null changed_at'],
  [boxWithoutTimes,                                        false,  'a lockbox missing its times'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso }, false, 'a lockbox from before its times were named registered_at and changed_at'],
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
    const summary = LockboxSummary.parse(TH.boxOf('anthropic_api_key', 'a1'))
    expect(Object.keys(summary)).to.have.members(['boxlabel', 'revision_id', 'note', 'registered_at', 'changed_at'])
  })
})

describe("FarFuture", () => {
  it("is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer", () => {
    expect(FarFuture).to.eq(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    expect(Number.isSafeInteger(FarFuture * 1000)).to.be.true
    expect(Number.isSafeInteger((FarFuture + 1) * 1000)).to.be.false
  })

  it("falls in 2255, a valid Date", () => {
    expect(new Date(FarFuture).toISOString()).to.eq('2255-06-05T23:47:34.740Z')
  })

  it("lets a host show 'until locked' for a deadline equal to it, and a date for any other", () => {
    const shown = (askPassphraseAt: number): string => (askPassphraseAt === FarFuture ? 'until locked' : new Date(askPassphraseAt).toISOString())
    expect(shown(FarFuture)).to.eq('until locked')
    expect(shown(Date.UTC(2026, 9, 22))).to.eq('2026-10-22T00:00:00.000Z')
  })
})

describe("FarPast", () => {
  it("is the first instant of 1981", () => {
    expect(FarPast).to.eq(Date.UTC(1981, 0, 1))
    expect(new Date(FarPast).toISOString()).to.eq('1981-01-01T00:00:00.000Z')
  })
})

const NowMs = Date.UTC(2026, 9, 15)

const EpochMillisCases = [
  // regular usage:
  [NowMs,                     true,   'today, in epoch milliseconds'],
  [FarPast,                   true,   'the floor itself'],
  [FarFuture,                 true,   'the ceiling itself'],
  // unit mistakes:
  [NowMs / 1000,              false,  'epoch seconds, which land in January 1970'],
  [NowMs * 1000,              false,  'epoch microseconds, which land tens of thousands of years out'],
  // edge cases:
  [FarPast - 1,               false,  'one millisecond before 1981'],
  [FarFuture + 1,             false,  'one millisecond past the ceiling'],
  [8.64e15,                   false,  'the last instant a Date holds, far past the ceiling'],
  [0,                         false,  'the epoch itself'],
  [NowMs + 0.5,               true,   'a fraction of a millisecond, as a clock may read'],
  [Infinity,                  false,  'a time that never comes'],
  [NaN,                       false,  'not a number'],
  ["1792022400000",           false,  'a time written as text'],
  [null,                      false,  'null'],
] as const

describe("EpochMillis", () => {
  for (const [candidate, expected, blurb] of EpochMillisCases) {
    it(`${expected ? 'accepts' : 'refuses'} ${blurb}`, () => {
      expect(EpochMillis.safeParse(candidate).success).to.eq(expected)
    })
  }

  it("says which unit a refused number likely was", () => {
    const tooSmall = EpochMillis.safeParse(NowMs / 1000)
    const tooLarge = EpochMillis.safeParse(NowMs * 1000)
    expect(tooSmall.error?.issues[0]?.message).to.match(/epoch seconds/)
    expect(tooLarge.error?.issues[0]?.message).to.match(/epoch microseconds/)
    expect(EpochMillis.safeParse(1e300).error?.issues[0]?.message).to.match(/epoch microseconds/)
  })

  it("passes a time through unchanged, as its examples show", () => {
    expect(EpochMillis.parse(Date.UTC(2026, 9, 15))).to.eq(1_792_022_400_000)
    expect(EpochMillis.safeParse(1_792_022_400).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000_000).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000.5).success).to.be.true
    expect(EpochMillis.safeParse(Infinity).success).to.be.false
  })
})

describe("the exported validators, inside a host's own Zod", () => {
  // A host on classic Zod holds them in its own schemas, as a form checking a lockbox might.
  const BoxForm = ZClassic.object({ scope: VaultScope, boxlabel: Label, note: ZClassic.optional(LockboxNote) })

  it("compose into a classic Zod schema and check as they do alone", () => {
    const form = { scope: TH.scopeOf('u1'), boxlabel: 'anthropic_api_key', note: 'work account' }
    expect(BoxForm.parse(form)).to.deep.equal(form)
  })

  it("refuse inside a classic Zod schema what they refuse alone", () => {
    expect(BoxForm.safeParse({ scope: TH.scopeOf('u1'), boxlabel: 'ANTHROPIC' }).success).to.be.false
    expect(BoxForm.safeParse({ scope: TH.scopeOf('u1'), boxlabel: 'anthropic', note: 'n'.repeat(257) }).success).to.be.false
  })
})
