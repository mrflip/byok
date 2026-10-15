import { describe, expect, it } from 'vitest'
import { boxCkey, bundleCkey, isBoxCkeyOf, scopePath } from '../src/ckeys'
import * as TH from './test-helpers'

describe("the ckeys", () => {
  it("keys a bundle and its lockboxes under the scope, as they have always been keyed", () => {
    expect(scopePath(TH.scopeOf('u1'))).to.eq('acme:u1:main')
    expect(bundleCkey(TH.scopeOf('u1'))).to.eq('vault:acme:u1:main')
    expect(boxCkey(TH.scopeOf('u1'), 'anthropic')).to.eq('box:acme:u1:main:anthropic')
  })
})

const BoxCkeyCases = [
  // regular usage:
  ["box:acme:u1:main:anthropic",      true,   'a lockbox of the vault'],
  // other rows on the shelf:
  ["vault:acme:u1:main",              false,  "the vault's own bundle"],
  ["box:acme:u1:spare:anthropic",     false,  "a lockbox of the user's other vault"],
  ["box:acme:u12:main:anthropic",     false,  'a lockbox of a user whose id starts the same'],
  ["box:acme:u1:main:x:anthropic",    false,  "user u1:main's vault x, whose ckey shares the prefix"],
  [42,                                false,  'a ckey that is not text'],
] as const

describe("isBoxCkeyOf", () => {
  for (const [ckey, expected, blurb] of BoxCkeyCases) {
    it(blurb, () => { expect(isBoxCkeyOf(TH.scopeOf('u1'), ckey)).to.eq(expected) })
  }

  it("finds a colon-holding user's own lockboxes", () => {
    expect(isBoxCkeyOf(TH.scopeOf('u1:main', 'x'), 'box:acme:u1:main:x:anthropic')).to.be.true
  })
})
