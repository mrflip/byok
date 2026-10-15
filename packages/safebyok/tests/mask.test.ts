import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import { mask } from '../src/mask'
import type { MaskOpts } from '../src/mask'

const KeyEmoji = '\u{1F511}'
const Rocket = '\u{1F680}'
const Man = '\u{1F468}'
const Woman = '\u{1F469}'
const Girl = '\u{1F467}'
const Family = `${Man}\u{200D}${Woman}\u{200D}${Girl}`
const EAcute = 'e\u{0301}'
const Alphabet = 'abcdefghijklmnopqrstuvwxyz'

/** What no result may contain: marks, controls, spaces of any kind, ignorables, bidi controls, blank symbols. */
const Unsafe = /[\p{M}\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\u{2800}\u{1D159}]/u

const thrownBy = (run: () => void): unknown => {
  try {
    run()
  } catch (err) {
    return err
  }
  return undefined
}

// A small seeded generator, so a failure repeats.
const randomCodePoints = (count: number, seed: number): string => {
  let state = seed
  const next = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state
  }
  return Array.from({ length: count }, () => String.fromCodePoint(next() % 0x11_00_00)).join('')
}

type MaskCase = readonly [whisper: string, opts: MaskOpts | undefined, expected: string, blurb: string]

describe("mask", () => {
  const Cases: readonly MaskCase[] = [
    // the doc block's examples:
    ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz", undefined,             "sk***...***wxyz",  'a long key collapses to its ends around ***...***'],
    ["sk-ant-abcd1234",                         undefined,             "sk*********1234",  'a key just fitting maxLen keeps every star'],
    ["sk-1234abcd",                             undefined,             "s******abcd",      'a key a little short gives up head characters first'],
    ["sk-123abcd",                              undefined,             "******abcd",       'a shorter key keeps only its tail'],
    ["abc",                                     undefined,             "******",           'a whisper shorter than minStars still gets minStars stars'],
    ["sk-1234abcd",                             { head: 0, tail: 0 },  "***********",      'head and tail of zero is stars only'],
    ["sk-\nant-\tabcd1234",                     undefined,             "sk*********1234",  'newlines and tabs are removed before masking'],
    ["sk-ant-abcd1234xyz",                      { maxLen: 8 },         "********",         'a maxLen too small for a collapse is that many stars'],

    // the short end, where head and then tail are given up:
    ["abcdefghijkl",                            undefined,             "ab******ijkl",     'exactly head + tail + minStars long keeps head and tail'],
    ["abcdefghijk",                             undefined,             "a******hijk",      'one short of that gives up one head character'],
    ["abcdefghij",                              undefined,             "******ghij",       'two short of that gives up the whole head'],
    ["abcdefg",                                 undefined,             "******g",          'a tail is given up only after the head is gone'],
    ["abcdef",                                  undefined,             "******",           'exactly minStars long shows only stars'],
    ["a",                                       undefined,             "******",           'one character gets minStars stars'],
    ["abcdefg",                                 { head: 5, tail: 0 },  "a******",          'asked for no tail, the head is what survives'],
    ["abcdefghij",                              { head: 3, tail: 3 },  "a******hij",       'a custom head and tail give way the same way'],
    ["abcdefghij",                              { minStars: 2 },       "ab****ghij",       'a smaller minStars shows more'],
    ["abc",                                     { minStars: 0 },       "abc",              'a minStars of zero may show a short whisper whole'],

    // maxLen:
    ["abcdefghijklmno",                         undefined,             "ab*********lmno",  'fifteen characters is the longest to show whole'],
    ["abcdefghijklmnop",                        undefined,             "ab***...***mnop",  'one character over maxLen collapses'],
    ["abcdefghijklmnop",                        { maxLen: 16 },        "ab**********mnop", 'a larger maxLen lets it through'],
    ["abcdefghijklmnop",                        { maxLen: Infinity },  "ab**********mnop", 'a maxLen of Infinity never collapses'],
    ["abcdefghijklmnop",                        { head: 0, tail: 0 },  "***...***",        'stars only collapses too'],
    ["abcdefghijklmnop",                        { head: 4, tail: 4, maxLen: 20 }, "abcd********mnop", 'a custom head and tail within maxLen'],
    ["abcdefghijklmnop",                        { maxLen: 9 },         "*********",        'a maxLen narrower than head + marker + tail is that many stars'],
    ["abcdefghijklmnop",                        { head: 0, tail: 0, maxLen: 9 }, "***...***", 'a maxLen exactly the marker, with no head or tail, collapses'],
    [Alphabet,                                  { head: 10, tail: 10 }, "***************", 'a generous head and tail that cannot collapse into maxLen give maxLen stars'],
    [Alphabet,                                  { head: 4 },           "***************",  'a larger head alone does not grow the default maxLen'],
    ["sk-ant-abcd1234",                         { maxLen: 5 },         "*****",            'a tiny maxLen is that many stars, no head and no tail'],
    ["abc",                                     { maxLen: 3 },         "***",              'a maxLen under minStars wins over minStars'],
    ["sk-ant-abcd1234",                         { maxLen: 0 },         "",                 'a maxLen of zero gives nothing'],
    // a collapsed result shows what the give-up rule allows for this whisper, no more:
    [Alphabet,                                  { minStars: 22 },      "***...***wxyz",    'a collapse of a barely showable whisper keeps only the tail it can show'],
    [Alphabet,                                  { minStars: 24 },      "***...***yz",      'a collapse with two showable characters keeps them as tail'],
    [Alphabet,                                  { minStars: 26 },      "***...***",        'a collapse with nothing showable shows nothing'],
    [Alphabet,                                  { minStars: 40 },      "***...***",        'minStars beyond the whisper collapses to bare stars'],
    ["abc",                                     { minStars: 2 ** 40 }, "***...***",        'a vast minStars collapses without building the stars it would discard'],

    // nothing at all, and nothing but removed characters:
    ["",                                        undefined,             "",                 'an empty whisper has nothing to show'],
    ["",                                        { minStars: 0 },       "",                 'an empty whisper stays empty'],
    ["\n\t\r\0\u{1B}\u{7F}",                        undefined,             "******",           'a whisper of only control characters is minStars stars'],
    ["\n\t\r\0\u{1B}\u{7F}",                        { minStars: 0 },       "",                 'a whisper of only control characters with minStars of zero is empty'],
    ["\u{2028}\u{2029}",                        undefined,             "******",           'line and paragraph separators are removed too'],
    ["abc\0def\u{7F}ghi\rjkl",                    undefined,             "ab******ijkl",     'control characters inside a key vanish, and do not count toward its length'],

    // spaces of every kind:
    ["sk-ant- abcd 1234",                       undefined,             "sk*********1234",  'ordinary spaces are removed'],
    ["sk-ant-\u{A0}abcd\u{3000}1234\u{2003}",   undefined,             "sk*********1234",  'no-break, ideographic and em spaces are removed'],

    // bidirectional controls and invisible characters:
    ["sk-ant-abcd12\u{202E}34",                 undefined,             "sk*********1234",  'a right-to-left override in the tail is removed'],
    ["\u{202A}\u{2066}sk-ant-abcd1234\u{2069}\u{202C}", undefined,     "sk*********1234",  'embeddings and isolates are removed'],
    ["sk-ant-abcd1234\u{200E}\u{200F}\u{61C}",  undefined,             "sk*********1234",  'directional marks are removed'],
    ["sk-ant-abcd1\u{200B}2\u{200B}34",         undefined,             "sk*********1234",  'zero-width spaces in the tail do not count as characters'],
    ["\u{FEFF}sk-ant-abcd1234\u{2060}",         undefined,             "sk*********1234",  'a byte-order mark and a word joiner are removed'],
    ["sk-ant-abcd12\u{AD}34\u{2062}",           undefined,             "sk*********1234",  'a soft hyphen and invisible operators are removed'],
    ["sk-ant-abcd12\u{3164}\u{FFA0}\u{2800}34", undefined,             "sk*********1234",  'filler characters and the blank braille pattern are removed'],
    ["a\u{1D159}cdefghijklmnop",                { head: 3, maxLen: Infinity }, "acd********mnop", 'the null notehead, a symbol drawn blank, is removed'],
    ["sk-ant-abcd123\u{FE0F}4\u{E0041}",        undefined,             "sk*********1234",  'variation selectors and tag characters are removed'],
    ["sk-ant-abcd12\u{200D}\u{200C}34",         undefined,             "sk*********1234",  'joiners are removed'],
    ["\u{200B}\u{2060}\u{FEFF}\u{202E}",        undefined,             "******",           'a whisper of only invisible characters is minStars stars'],
    ["sk-ant-abcd12\u{E000}\u{FFFF}34",         undefined,             "sk*********1234",  'private-use and unassigned code points are removed'],
    ["sk-ant-abcd12\u{D834}34",                 undefined,             "sk*********1234",  'a lone surrogate is removed'],

    // marks, composed or not:
    [EAcute.repeat(12),                         undefined,             `\u{E9}\u{E9}******${'\u{E9}'.repeat(4)}`, 'a letter with a combining accent is composed into one letter'],
    [Array.from('abcdefghijkl', (letter) => `${letter}\u{335}\u{336}\u{337}`).join(''), undefined, "ab******ijkl", 'stacked combining marks are removed, not counted'],
    ["sk-ant-abcd1234\u{300}\u{301}\u{302}\u{303}", undefined,          "sk*********1234",  'marks left on a character that does not compose are removed'],

    // characters cut by code point:
    [`${KeyEmoji}${KeyEmoji}abcdefghij${Rocket}${Rocket}`, undefined,  `${KeyEmoji}${KeyEmoji}********ij${Rocket}${Rocket}`, 'an emoji is one character, and never loses half its surrogate pair'],
    [`${Family}${Family}abcdefghij${Family}${Family}`,     undefined,  `${Man}${Woman}***...***${Girl}${Man}${Woman}${Girl}`, 'a joined emoji sequence comes apart into its emoji, which are cut whole'],
    ["\u{5D0}\u{5D1}\u{5D2}\u{5D3}\u{5D4}\u{5D5}\u{5D6}\u{5D7}\u{5D8}\u{5D9}\u{5DA}\u{5DB}", undefined, "\u{5D0}\u{5D1}******\u{5D8}\u{5D9}\u{5DA}\u{5DB}", 'letters of a right-to-left script stay: they are visible text'],
  ]

  for (const [whisper, opts, expected, blurb] of Cases) {
    it(blurb, () => { expect(mask(whisper, opts)).to.eq(expected) })
  }

  it("takes a partial bag of options, filling in the rest", () => {
    expect(mask('abcdefghijkl', { head: undefined, tail: 1 })).to.eq('ab*********l')
  })

  it("is the same every time it is asked", () => {
    expect(mask('sk-ant-abcd1234')).to.eq(mask('sk-ant-abcd1234'))
  })

  describe("whatever it is given", () => {
    const Adversaries: readonly string[] = [
      'sk-ant-api03-abcdefghijklmnopqrstuvwxyz\u{202E}',
      '\u{2066}sk-ant-\u{2069}abcd1234\u{202D}\u{202B}',
      'abc\nde\rfg\th\u{B}i\u{C}j\u{85}k',
      '\u{2028}line\u{2029}paragraph',
      `${Family}${Family}${Family}${Family}${Family}`,
      '\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}\u{1F3FD}\u{1F44D}',
      `z${'\u{300}\u{301}\u{302}\u{303}\u{304}\u{305}'.repeat(30)}a${'\u{489}\u{20DD}'.repeat(10)}`,
      '\u{D800}\u{DC00}\u{D800}x\u{DC00}y\u{DBFF}',
      '\u{E0001}\u{E0020}tag\u{E007F}\u{FE0F}\u{180B}\u{180E}\u{34F}\u{115F}\u{1160}\u{1D159}',
      '\u{A0}\u{1680}\u{2000}\u{200A}\u{202F}\u{205F}\u{3000}key\u{FEFF}',
      '\u{627}\u{644}\u{645}\u{641}\u{62A}\u{627}\u{62D}sk-12345\u{5D0}\u{5D1}\u{5D2}\u{5D3}\u{5D4}',
      '\u{E000}\u{F8FF}\u{FFFE}\u{FFFF}\u{10FFFF}\u{378}',
      ...[1, 2, 3, 4, 5, 6].map((seed) => randomCodePoints(40, seed)),
      ...[7, 8, 9].map((seed) => randomCodePoints(400, seed)),
    ]
    const Variants: readonly MaskOpts[] = [
      {},
      { head: 0, tail: 0 },
      { head: 0, tail: 1, minStars: 0 },
      { head: 6, tail: 6, minStars: 2 },
      { head: 2, tail: 4, maxLen: 0 },
      { head: 2, tail: 4, maxLen: 8 },
      { head: 2, tail: 4, maxLen: 20 },
      { maxLen: Infinity },
    ]

    for (const [idx, adversary] of Adversaries.entries()) {
      it(`always returns one safe line no longer than maxLen (adversary ${String(idx)})`, () => {
        for (const opts of Variants) {
          const masked = mask(adversary, opts)
          expect(masked).not.to.match(Unsafe)
          expect(masked).not.to.match(/[\n\r]/)
          expect(masked.normalize('NFC')).to.eq(masked)
          expect((masked.match(/./gsu) ?? []).length).to.be.at.most(opts.maxLen ?? 15)
        }
      })
    }
  })

  describe("refusals", () => {
    const BadOpts: readonly [MaskOpts, string][] = [
      [{ head: -1 },                       'a negative head'],
      [{ tail: 1.5 },                      'a fractional tail'],
      [{ minStars: NaN },                  'a minStars that is not a number'],
      [{ maxLen: -3 },                     'a negative maxLen'],
      [{ maxLen: 2.5 },                    'a fractional maxLen'],
      [{ maxLen: NaN },                    'a maxLen that is not a number'],
      [{ head: '2' as unknown as number }, 'a head that is text'],
    ]
    for (const [opts, blurb] of BadOpts) {
      it(`refuses ${blurb} as bad_option`, () => {
        expect(() => mask('sk-ant-abcd1234', opts)).to.throw(VaultError).with.property('kind', 'bad_option')
      })
    }

    it("refuses a whisper that is not a string as bad_whisper", () => {
      for (const whisper of [42, null, undefined, { key: 'x' }]) {
        expect(() => mask(whisper as unknown as string)).to.throw(VaultError).with.property('kind', 'bad_whisper')
      }
    })

    it("never quotes the whisper in what it throws", () => {
      const fake = 'sk-FAKE-do-not-leak-0123456789'
      for (const opts of [{ head: -1 }, { maxLen: 0.5 }, { tail: 'x' as unknown as number }]) {
        const err = thrownBy(() => mask(fake, opts))
        expect(err).to.be.instanceOf(VaultError)
        expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.to.contain('FAKE')
      }
    })
  })
})
