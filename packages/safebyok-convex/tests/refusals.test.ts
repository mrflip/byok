import { describe, expect, it } from 'vitest'
import { SafebyokErrorKindVals, isSafebyokErrorData } from '../src/refusals'

const ErrorDataCases = [
  // safebyok's own refusals:
  [{ kind: "not_permitted", message: "Sign in, then try again." },  true,   'a not_permitted refusal with its message'],
  // anything else a ConvexError may carry:
  [{ kind: "stale_write", message: "Read it again." },              false,  'a VaultError kind the functions never throw'],
  [{ kind: "not_permitted" },                                       false,  'a known kind without a message'],
  [{ kind: "not_permitted", message: 42 },                          false,  'a message that is not text'],
  [{ message: "Sign in, then try again." },                         false,  'a message without a kind'],
  ["not_permitted",                                                 false,  'a bare string, as a host might throw'],
  [null,                                                            false,  'null'],
  [undefined,                                                       false,  'nothing at all'],
] as const

describe("isSafebyokErrorData", () => {
  for (const [data, expected, blurb] of ErrorDataCases) {
    it(`answers ${String(expected)} for ${blurb}`, () => { expect(isSafebyokErrorData(data)).to.eq(expected) })
  }

  it("knows exactly the kinds the functions throw", () => {
    expect(SafebyokErrorKindVals).to.deep.equal(['not_permitted'])
  })
})
