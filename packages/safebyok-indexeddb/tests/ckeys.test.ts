import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { boxCkey, boxRange, bundleCkey } from '../src/ckeys'
import * as TH from './test-helpers'

describe("the ckeys", () => {
  it("keys a bundle and its lockboxes under the JSON text of the scope, spelled out because they are stored", () => {
    expect(bundleCkey(TH.scopeOf('u1'))).to.eq('["vault","acme","u1","main"]')
    expect(boxCkey(TH.scopeOf('u1'), 'anthropic')).to.eq('["box","acme","u1","main","anthropic"]')
  })
})

describe("boxRange", () => {
  const InsideLabels = ['anthropic', '', '\u{FFFF}\u{FFFF}', 'zz"}\\']

  for (const boxlabel of InsideLabels) {
    it(`holds the ckey of a lockbox labelled ${JSON.stringify(boxlabel)}`, () => {
      const ckey = boxCkey(TH.scopeOf('u1'), boxlabel)
      expect(boxRange(TH.scopeOf('u1')).includes(ckey)).to.be.true
    })
  }

  const OutsideCases = [
    ['["vault","acme","u1","main"]',                 "the vault's own bundle"],
    ['["box","acme","u1","spare","anthropic"]',      "a lockbox of the user's other vault"],
    ['["box","acme","u12","main","anthropic"]',      'a lockbox of a user whose id starts the same'],
    [boxCkey(TH.scopeOf('u1","main', 'x'), 'anthropic'), "a lockbox of a user named `u1\",\"main`, whose name only looks like the prefix"],
    ['["unlock","acme","u1","main"]',                "a remembered unlock"],
  ] as const

  for (const [ckey, blurb] of OutsideCases) {
    it(`holds not ${blurb}`, () => { expect(boxRange(TH.scopeOf('u1')).includes(ckey)).to.be.false })
  }

  it("finds the lockboxes of a user whose id holds a colon, a quote or a comma", () => {
    const odd = TH.scopeOf('u1:"x,')
    expect(boxRange(odd).includes(boxCkey(odd, 'anthropic'))).to.be.true
  })
})
