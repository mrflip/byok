import { describe, expect, it } from 'vitest'
import { Label, Whisper } from '../src/types'

const WhisperCases = [
  // every JSON shape a whisper may take:
  ["sk-ant-api03-fake-fake",          true,   'a string, the common case'],
  ["",                                true,   'even an empty string'],
  [42,                                true,   'a number'],
  [true,                              true,   'a boolean'],
  [null,                              true,   'null: an emptied slot is still a whisper'],
  [["a", "b"],                        true,   'an array'],
  [{ apiToken: "fake", tier: 2 },     true,   'a plain object'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
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
    const bag = { apiToken: 'fake', scopes: ['read', 'write'] }
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
