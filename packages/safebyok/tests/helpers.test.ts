import { describe, expect, it } from 'vitest'
import { tweakB64 } from './helpers'

const TweakCases = [
  // regular usage:
  ["Zm9v",  "am9v",  'swaps the first character for an a'],
  ["am9v",  "bm9v",  'swaps an a for a b, so the text still differs'],
  ["A",     "a",     'works on a single character'],
  // edge cases:
  ["",      "a",     'blank text comes back as an a'],
] as const

describe("tweakB64", () => {
  for (const [b64, expected, blurb] of TweakCases) {
    it(blurb, () => {
      expect(tweakB64(b64)).to.eq(expected)
    })
  }

  it("never returns what it was given", () => {
    for (const first of 'AaBbZz09-_') {
      expect(tweakB64(`${first}m9v`)).to.not.eq(`${first}m9v`)
    }
  })
})
