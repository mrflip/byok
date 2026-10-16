import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import * as Validators from '../src/validators'
import { AnyTextValidators, DefaultValidators, Label, LabelPattern, LockboxNote, MaxLabelChars, MaxNoteChars, MaxUserIdChars, UserId } from '../src/validators'
import { VaultScope } from '../src/types'
import * as TH from './test-helpers'

describe("safebyok/validators, as an entry point", () => {
  it("exports the default checks, their bounds, and the schemas a host's forms use, and no record schema", () => {
    expect(Object.keys(Validators)).to.have.members([
      'AnyTextValidators', 'DefaultValidators', 'Label', 'LabelPattern', 'LockboxNote', 'MaxLabelChars', 'MaxNoteChars', 'MaxUserIdChars', 'UserId',
    ])
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

const UserIdCases = [
  // regular usage:
  ["u1",                         true,   'a short id'],
  ["user|2fJ8:google",           true,   'an id in whatever form the host app issues, colons and capitals and all'],
  ["u".repeat(100),              true,   'a hundred characters is the ceiling'],
  ["\u{4E00}".repeat(100),       true,   'a hundred characters, however many bytes each'],
  ["user_\u{1F511}",              true,   'an emoji, whole: both halves of its surrogate pair'],
  // refused:
  ["",                           false,  'an empty id names no one'],
  ["u".repeat(101),              false,  'a hundred and one is one too many'],
  [42,                           false,  'a number is not an id'],
  [null,                         false,  'null names no one'],
  ["user_\u{D83D}",                false,  'half of an emoji: a lone high surrogate'],
  ["\u{DD11}user",                 false,  'the other half, alone at the start: a lone low surrogate'],
] as const

describe("UserId", () => {
  for (const [candidate, expected, blurb] of UserIdCases) {
    it(blurb, () => { expect(UserId.safeParse(candidate).success).to.eq(expected) })
  }

  it("names its bound when it refuses, and never quotes the id", () => {
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const refusals = [UserId.safeParse(overlong), UserId.safeParse('')].map((checked) => JSON.stringify(checked.error?.issues.map((issue) => issue.message)))
    expect(refusals[0]).to.include('at most 100 characters')
    expect(refusals[1]).to.include("can't be empty")
    expect(refusals.join(' ')).to.not.include('alice')
  })

  it("passes and refuses as its examples show", () => {
    expect(UserId.parse('user|2fJ8:google')).to.eq('user|2fJ8:google')
    expect(UserId.safeParse('').success).to.be.false
    expect(UserId.safeParse('u'.repeat(101)).success).to.be.false
    expect(UserId.safeParse('u\u{D800}').success).to.be.false
  })

  it("says, without quoting the id, that it holds half of a character", () => {
    const said = JSON.stringify(UserId.safeParse('alice\u{D800}').error?.issues.map((issue) => issue.message))
    expect(said).to.include('well-formed Unicode')
    expect(said).to.include('lone surrogate')
    expect(said).to.not.include('alice')
  })
})

describe("MaxLabelChars and LabelPattern", () => {
  it("are the bounds Label checks: forty characters, and the pattern alone", () => {
    expect(Label.safeParse('x'.repeat(MaxLabelChars)).success).to.be.true
    expect(Label.safeParse('x'.repeat(MaxLabelChars + 1)).success).to.be.false
    const withinLength = LabelCases.filter(([label]) => label.length <= MaxLabelChars)
    for (const [candidate, expected] of withinLength) {
      expect(LabelPattern.test(candidate)).to.eq(expected)
    }
  })

  it("gives a form's input its pattern and length, as its example shows", () => {
    const input = { pattern: LabelPattern.source, maxLength: MaxLabelChars }
    expect(new RegExp(input.pattern).test('anthropic_api_key')).to.be.true
    expect(new RegExp(input.pattern).test('Anthropic')).to.be.false
    expect(input.maxLength).to.eq(40)
  })
})

const NoteCases = [
  // regular usage:
  ["work account",         true,   'a few words'],
  ["",                     true,   'even empty text'],
  ["n".repeat(256),        true,   'two hundred fifty-six characters is the ceiling'],
  ["rotated\tin March",     true,   'a tab'],
  ["work\nrotated in March", true,  'a newline'],
  ["key \u{1F511}",          true,   'an emoji, whole'],
  ["Mixed: עברית, ไทย",     true,   'any script'],
  // refused:
  ["n".repeat(257),        false,  'two hundred fifty-seven is one too many'],
  ["work\r\naccount",       false,  'a carriage return, which a textarea never hands up'],
  ["beep\u{7}",            false,  'a C0 control character: the bell'],
  ["nul\0",             false,  'a NUL'],
  ["esc\u{1B}[31mred",      false,  'an escape, as a terminal colour code starts'],
  ["del\u{7F}",             false,  'DEL'],
  ["next\u{85}line",        false,  'a C1 control character: next line'],
  ["csi\u{9B}",             false,  'the last C1 control character'],
  ["key \u{D83D}",            false,  'half of an emoji: a lone surrogate'],
  [null,                   false,  'null: a lockbox with no note stores no note field'],
  [42,                     false,  'a number is not a note'],
] as const

/** What LockboxNote says of a note it refuses: its issues' messages, as one text. */
const noteRefusalSaid = (note: string) => JSON.stringify(LockboxNote.safeParse(note).error?.issues.map((issue) => issue.message))

describe("LockboxNote", () => {
  for (const [candidate, expected, blurb] of NoteCases) {
    it(blurb, () => { expect(LockboxNote.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands a note back as it is, as its examples show", () => {
    expect(LockboxNote.parse('work account')).to.eq('work account')
    expect(LockboxNote.parse('work account\nrotated in March')).to.eq('work account\nrotated in March')
    expect(LockboxNote.safeParse('beep\u{7}').success).to.be.false
  })

  it("says which characters it refuses, without quoting the note", () => {
    expect(noteRefusalSaid('secret-ish\u{7}')).to.include('no control characters but tab and newline')
    expect(noteRefusalSaid('secret-ish\u{D800}')).to.include('lone surrogate')
    expect(noteRefusalSaid('secret-ish\u{7}') + noteRefusalSaid('secret-ish\u{D800}')).to.not.include('secret-ish')
  })
})

describe("MaxNoteChars", () => {
  it("is the bound LockboxNote checks", () => {
    expect(LockboxNote.safeParse('n'.repeat(MaxNoteChars)).success).to.be.true
    expect(LockboxNote.safeParse('n'.repeat(MaxNoteChars + 1)).success).to.be.false
  })

  it("names its bound when a note is refused, and never quotes the note", () => {
    const refused = LockboxNote.safeParse(`secret-ish ${'n'.repeat(MaxNoteChars)}`)
    const said = JSON.stringify(refused.error?.issues.map((issue) => issue.message))
    expect(said).to.include('at most 256 characters')
    expect(said).to.not.include('secret-ish')
  })
})

describe("AnyTextValidators", () => {
  it("admits any well-formed text in every field, and nothing that is not text", () => {
    for (const check of Object.values(AnyTextValidators)) {
      expect(check.safeParse('').success).to.be.true
      expect(check.safeParse('Mixed: English, עברית, العربية, ไทย, \u{202E}').success).to.be.true
      expect(check.safeParse('control\u{7} and\r\nemoji \u{1F511}').success).to.be.true
      expect(check.safeParse('n'.repeat(100_000)).success).to.be.true
      expect(check.safeParse(42).success).to.be.false
    }
    expect(Object.isFrozen(AnyTextValidators)).to.be.true
  })

  it("refuses, in every field, text holding a lone surrogate: half of a character", () => {
    for (const check of Object.values(AnyTextValidators)) {
      expect(check.safeParse('key \u{D83D}').success).to.be.false
      expect(check.safeParse('\u{DD11} key').success).to.be.false
      expect(check.safeParse('\u{DD11}\u{D83D}').success).to.be.false
    }
  })

  it("answers for text of millions of characters, refusing a lone surrogate at its very end", () => {
    const vast = 'n'.repeat(12_000_000)
    expect(AnyTextValidators.note.safeParse(vast).success).to.be.true
    expect(AnyTextValidators.note.safeParse(`${vast}\u{D800}`).success).to.be.false
    const said = JSON.stringify(LockboxNote.safeParse(`${vast}\u{0007}\u{D800}`).error?.issues.map((issue) => issue.message))
    expect(said).to.include('at most 256 characters')
    expect(said).to.include('no control characters')
    expect(said).to.include('lone surrogate')
  })

  it("passes and refuses as its examples show", () => {
    expect(AnyTextValidators.boxlabel.safeParse('Work: מפתח API').success).to.be.true
    expect(AnyTextValidators.boxlabel.safeParse('key \u{D83D}').success).to.be.false
  })

  it("composes with a default, as its second example shows", () => {
    const validators = { ...AnyTextValidators, userId: UserId }
    expect(validators.boxlabel.safeParse('Anthropic API key').success).to.be.true
    expect(validators.userId.safeParse('').success).to.be.false
  })
})

describe("DefaultValidators", () => {
  it("checks each label with Label, the user with UserId, and a note with LockboxNote", () => {
    expect(DefaultValidators).to.deep.equal({ applabel: Label, vaultlabel: Label, boxlabel: Label, userId: UserId, note: LockboxNote })
    expect(DefaultValidators.applabel).to.eq(Label)
    expect(DefaultValidators.userId).to.eq(UserId)
    expect(DefaultValidators.note).to.eq(LockboxNote)
  })

  it("is frozen: a host replaces a check in openVault's validators, never here", () => {
    expect(Object.isFrozen(DefaultValidators)).to.be.true
  })

  it("passes and refuses as its example shows", () => {
    expect(DefaultValidators.boxlabel.safeParse('anthropic_api_key').success).to.be.true
    expect(DefaultValidators.boxlabel.safeParse('Anthropic API key').success).to.be.false
  })
})

describe("the default validators, inside a host's own Zod", () => {
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
