import { describe, expect, it } from 'vitest'
import { editableWhisper, parseWhisperText, showWhisper } from '../../src/lib/whisper-text'

const ParseCases = [
  // typed text, what gets stored, and why:
  ["sk-ant-fake",         "sk-ant-fake",       'ordinary text stores as the string it is'],
  ["42",                  42,                  'JSON number text stores as a number'],
  ["true",                true,                'JSON boolean text stores as a boolean'],
  ["null",                null,                'the text null parses to null, for the vault to refuse'],
  ['{"apiKey":"x"}',    { apiKey: "x" },   'JSON object text stores as an object'],
  ["[1, 2]",              [1, 2],              'JSON array text stores as an array'],
  ["{not json",           "{not json",         'almost-JSON falls back to the string'],
] as const

describe("parseWhisperText", () => {
  for (const [text, expected, blurb] of ParseCases) {
    it(blurb, () => { expect(parseWhisperText(text)).to.deep.equal(expected) })
  }
})

describe("showWhisper and editableWhisper", () => {
  it("print strings bare, with no quote marks", () => {
    expect(showWhisper('sk-ant-fake')).to.eq('sk-ant-fake')
    expect(editableWhisper('sk-ant-fake')).to.eq('sk-ant-fake')
  })

  it("print everything else as JSON, editable form indented", () => {
    expect(showWhisper({ tier: 2 })).to.eq('{"tier":2}')
    expect(editableWhisper({ tier: 2 })).to.eq('{\n  "tier": 2\n}')
  })

  it("round-trip: what the edit box shows parses back to the same whisper", () => {
    for (const whisper of ['plain text', 42, true, [1, 'two'], { deep: { bag: [] } }]) {
      expect(parseWhisperText(editableWhisper(whisper))).to.deep.equal(whisper)
    }
  })
})
