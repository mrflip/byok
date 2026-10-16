import { describe, expect, it } from 'vitest'
import * as Ckeys from '../src/ckeys'
import type { VaultScope } from '../src/types'
import { memoryStore } from '../src/string-store'
import * as TH from './test-helpers'

const u1 = TH.scopeOf('u1')

describe("Ckeys, the ckey of each row", () => {
  it("files a bundle under its kind and scope, as JSON", () => {
    expect(Ckeys.bundle(u1)).to.eq('["vault","acme","u1","main"]')
  })

  it("files a lockbox under its kind, scope and boxlabel, as JSON", () => {
    expect(Ckeys.box(u1, 'anthropic')).to.eq('["box","acme","u1","main","anthropic"]')
  })

  it("files a remembered unlock under its kind and scope, as JSON", () => {
    expect(Ckeys.unlock(u1)).to.eq('["unlock","acme","u1","main"]')
  })

  it("files a device mark under its kind and scope, as JSON", () => {
    expect(Ckeys.mark(u1)).to.eq('["mark","acme","u1","main"]')
  })

  it("begins every lockbox ckey of a scope with its box prefix", () => {
    expect(Ckeys.boxPrefix(u1)).to.eq('["box","acme","u1","main",')
    expect(Ckeys.box(u1, 'anthropic').startsWith(Ckeys.boxPrefix(u1))).to.be.true
  })

  it("picks a scope's lockbox ckeys out of a store, and nothing else", () => {
    const store = memoryStore()
    for (const ckey of [Ckeys.bundle(u1), Ckeys.box(u1, 'anthropic'), Ckeys.box(u1, 'openai'), Ckeys.unlock(u1), Ckeys.box(TH.scopeOf('u2'), 'anthropic'), 'box:acme:u1:main:legacy']) {
      store.write(ckey, '{}')
    }
    expect(store.ckeys().filter(Ckeys.isBoxIn(u1))).to.have.members([Ckeys.box(u1, 'anthropic'), Ckeys.box(u1, 'openai')])
  })

  it("passes over a ckey that is not text, as IndexedDB may hold", () => {
    const isBox = Ckeys.isBoxIn(u1)
    expect(isBox(42)).to.be.false
    expect(isBox(undefined)).to.be.false
    expect(isBox(['box', 'acme', 'u1', 'main', 'anthropic'])).to.be.false
  })

  it("decodes back to the tuple it encodes, whatever text the names hold", () => {
    const scope = { applabel: 'a:"b"', user_id: '\\,[]\n\0', vaultlabel: 'עברית ไทย' }
    expect(JSON.parse(Ckeys.box(scope, '\u{D800}')) as unknown).to.deep.equal(['box', 'a:"b"', '\\,[]\n\0', 'עברית ไทย', '\u{D800}'])
  })
})

/** A scope from a tuple, for the tables below. */
const scopeFrom = ([applabel = '', userId = '', vaultlabel = '']: readonly string[]): VaultScope => ({ applabel, user_id: userId, vaultlabel })

/**
 * Pairs of addresses -- applabel, user_id, vaultlabel, boxlabel -- that a naive join would
 * confuse. Each must get two different ckeys, and neither's scope may list the other's lockbox.
 */
const NearTwins = [
  // a separator, slid across a boundary:
  [["acme", "u1:x", "main", "box"],       ["acme", "u1", "x:main", "box"],         'a colon moved from the user_id into the vaultlabel'],
  [["acme", "u1", "main:x", "box"],       ["acme", "u1", "main", "x:box"],         'a colon moved from the vaultlabel into the boxlabel'],
  [["acme", "u1,x", "main", "box"],       ["acme", "u1", "x,main", "box"],         'a comma moved across a boundary'],
  [["acme", 'u1","x', "main", "box"],     ["acme", "u1", 'x","main', "box"],       'a quoted comma moved across a boundary'],
  // a name spelling out the encoding of the names after it:
  [["acme", 'u1","main', "x", "box"],     ["acme", "u1", "main", 'x","box'],       'a user_id holding what the vaultlabel would encode as'],
  [["acme", 'u1","main","box', "x", "y"], ["acme", "u1", "main", "box"],           'a user_id holding a whole encoded tail'],
  [["acme", "u1", 'main"]', "box"],       ["acme", "u1", "main", '"]box'],         'a closing bracket moved across a boundary'],
  // names that differ only by one character a join or an escape might lose:
  [["acme", "u1", "main", "box"],         ["acme", "u1:", "main", "box"],          'a trailing colon'],
  [["acme", "u1", "main", "box"],         ["acme", 'u1"', "main", "box"],          'a trailing quote'],
  [["acme", "u1", "main", "box"],         ["acme", String.raw`u1\\`, "main", "box"],   'trailing backslashes'],
  [["acme", String.raw`u1\"`, "main", "box"], ["acme", 'u1"', "main", "box"],     'a backslash before a quote'],
  [["acme", "u1", "main", "box"],         ["acme", "u1,", "main", "box"],          'a trailing comma'],
  [["acme", "u1", "main", "box"],         ["acme", "[u1]", "main", "box"],         'brackets'],
  [["acme", "u1", "main", "box"],         ["acme", "u1\n", "main", "box"],         'a newline'],
  [["acme", "u1", "main", "box"],         ["acme", "u1\0", "main", "box"],         'a NUL'],
  [["acme", "é", "main", "box"],          ["acme", "e\u{301}", "main", "box"],     'two spellings of the same accented letter, kept apart as given'],
  [["", "u1", "main", "box"],             ["u1", "", "main", "box"],               'an empty name moved'],
] as const

describe("Ckeys, between near twins", () => {
  for (const [one, two, blurb] of NearTwins) {
    it(`never confuses ${blurb}`, () => {
      const [oneScope, twoScope] = [scopeFrom(one), scopeFrom(two)]
      const [oneBox, twoBox] = [Ckeys.box(oneScope, one[3]), Ckeys.box(twoScope, two[3])]
      expect(oneBox).to.not.eq(twoBox)
      expect(Ckeys.isBoxIn(oneScope)(twoBox)).to.be.false
      expect(Ckeys.isBoxIn(twoScope)(oneBox)).to.be.false
    })
  }
})

describe("Ckeys, over every split of one awkward string", () => {
  // Every way to cut this string into applabel, user_id, vaultlabel and boxlabel: 220 addresses
  // made of the same characters in the same order, which any join by a separator would confuse.
  const awkward = String.raw`a:"b\,[c]`
  const cuts = Array.from({ length: awkward.length + 1 }, (_unused, ii) => ii)
  const addresses = cuts.flatMap((one) => cuts.flatMap((two) => cuts.flatMap((three) => (
    one <= two && two <= three ? [[awkward.slice(0, one), awkward.slice(one, two), awkward.slice(two, three), awkward.slice(three)]] : []
  ))))

  it("gives each a ckey of its own", () => {
    const boxCkeys = new Set(addresses.map((address) => Ckeys.box(scopeFrom(address), address[3] ?? '')))
    expect(addresses).to.have.lengthOf(220)
    expect(boxCkeys.size).to.eq(addresses.length)
  })

  it("lists each scope's lockboxes alone", () => {
    const leaks = addresses.map((address) => scopeFrom(address)).flatMap((scope) => {
      const isBox = Ckeys.isBoxIn(scope)
      return addresses.filter((address) => {
        const owner = scopeFrom(address)
        const isOwn = owner.applabel === scope.applabel && owner.user_id === scope.user_id && owner.vaultlabel === scope.vaultlabel
        return ! isOwn && isBox(Ckeys.box(owner, address[3] ?? ''))
      })
    })
    expect(leaks).to.have.lengthOf(0)
  })
})

describe("Ckeys.boxlabelOf", () => {
  it("reads the boxlabel back from a lockbox's ckey, whatever text it holds", () => {
    expect(Ckeys.boxlabelOf(Ckeys.box(u1, 'anthropic'))).to.eq('anthropic')
    expect(Ckeys.boxlabelOf(Ckeys.box(u1, ''))).to.eq('')
    expect(Ckeys.boxlabelOf(Ckeys.box(u1, 'OpenAI: "work", [1]\n\u{D800}'))).to.eq('OpenAI: "work", [1]\n\u{D800}')
  })

  const Unreachable = [
    ['["box","acme","u1","main",',               'text that is not JSON'],
    ['["box","acme","u1","main"]',               'a tuple too short'],
    ['["box","acme","u1","main","x","y"]',       'a tuple too long'],
    ['["box","acme","u1","main",42]',            'a boxlabel that is not text'],
    ['["unlock","acme","u1","main","x"]',        'another kind'],
    ['["box","acme","u1","main", "x"]',          'a space box() never writes'],
    [String.raw`["box","acme","u1","main","\u0078"]`, 'an escape box() never writes'],
    ['{"box":"x"}',                              'an object'],
  ] as const
  for (const [ckey, blurb] of Unreachable) {
    it(`gives null, never throwing, for ${blurb}`, () => {
      expect(Ckeys.boxlabelOf(ckey)).to.be.null
    })
  }
})

describe("Ckeys.isUnlock", () => {
  it("knows an unlock's ckey, for any scope", () => {
    expect(Ckeys.isUnlock(Ckeys.unlock(u1))).to.be.true
    expect(Ckeys.isUnlock(Ckeys.unlock({ applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: '' }))).to.be.true
  })

  it("refuses an earlier version's ckey, another kind's, and anything that is not text", () => {
    expect(Ckeys.isUnlock('unlock:acme:u1:main')).to.be.false
    expect(Ckeys.isUnlock(Ckeys.bundle(u1))).to.be.false
    expect(Ckeys.isUnlock('["unlocked","acme","u1","main"]')).to.be.false
    expect(Ckeys.isUnlock(['unlock', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys.isMark", () => {
  it("knows a mark's ckey, for any scope", () => {
    expect(Ckeys.isMark(Ckeys.mark(u1))).to.be.true
    expect(Ckeys.isMark(Ckeys.mark({ applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: '' }))).to.be.true
  })

  it("refuses an unlock's ckey, another kind's, and anything that is not text", () => {
    expect(Ckeys.isMark(Ckeys.unlock(u1))).to.be.false
    expect(Ckeys.isMark('["marked","acme","u1","main"]')).to.be.false
    expect(Ckeys.isMark(['mark', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys, between kinds", () => {
  it("never takes a bundle or an unlock for a lockbox, nor one kind's ckey for another's", () => {
    const isBox = Ckeys.isBoxIn(u1)
    expect(isBox(Ckeys.bundle(u1))).to.be.false
    expect(isBox(Ckeys.unlock(u1))).to.be.false
    expect(isBox(Ckeys.mark(u1))).to.be.false
    expect(new Set([Ckeys.bundle(u1), Ckeys.unlock(u1), Ckeys.mark(u1), Ckeys.box(u1, 'main')]).size).to.eq(4)
  })
})
