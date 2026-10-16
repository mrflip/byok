import { describe, expect, it } from 'vitest'
import { boxCkey, bundleCkey, isBoxCkeyOf } from '../src/ckeys'
import * as TH from './test-helpers'

describe("the ckeys", () => {
  it("keys a bundle and its lockboxes under the JSON text of the scope, spelled out because they are stored", () => {
    expect(bundleCkey(TH.scopeOf('u1'))).to.eq('["vault","acme","u1","main"]')
    expect(boxCkey(TH.scopeOf('u1'), 'anthropic')).to.eq('["box","acme","u1","main","anthropic"]')
  })
})

const BoxCkeyCases = [
  // regular usage:
  ['["box","acme","u1","main","anthropic"]',       true,   'a lockbox of the vault'],
  // other rows on the shelf:
  ['["vault","acme","u1","main"]',                 false,  "the vault's own bundle"],
  ['["box","acme","u1","spare","anthropic"]',      false,  "a lockbox of the user's other vault"],
  ['["box","acme","u12","main","anthropic"]',      false,  'a lockbox of a user whose id starts the same'],
  [boxCkey(TH.scopeOf('u1","main', 'x'), 'anthropic'), false,  "a lockbox of a user named `u1\",\"main`, whose name only looks like the prefix"],
  [42,                                             false,  'a ckey that is not text'],
] as const

describe("isBoxCkeyOf", () => {
  for (const [ckey, expected, blurb] of BoxCkeyCases) {
    it(blurb, () => { expect(isBoxCkeyOf(TH.scopeOf('u1'), ckey)).to.eq(expected) })
  }

  it("finds the lockboxes of a user whose id holds a colon, a quote or a comma", () => {
    const odd = TH.scopeOf('u1:"x,')
    expect(isBoxCkeyOf(odd, boxCkey(odd, 'anthropic'))).to.be.true
  })
})
