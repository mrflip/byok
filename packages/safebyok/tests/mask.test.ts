import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../src/errors'
import { mask } from '../src/mask'
import type { MaskOpts } from '../src/mask'

const KeyEmoji = '\u{1F511}'
const Rocket = '\u{1F680}'
const Family = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'
const EAcute = 'e\u{0301}'

const withoutSegmenter = (run: () => void): void => {
  const real = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true })
  try {
    run()
  } finally {
    Object.defineProperty(Intl, 'Segmenter', real)
  }
}

const thrownBy = (run: () => void): unknown => {
  try {
    run()
  } catch (err) {
    return err
  }
  return undefined
}

const HeadTails: readonly (readonly [number, number])[] = [[0, 0], [0, 1], [1, 0], [2, 4], [4, 0]]

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

    // the short end, where head and then tail are given up:
    ["abcdefghijkl",                            undefined,             "ab******ijkl",     'exactly head + tail + minStars long keeps head and tail'],
    ["abcdefghijk",                             undefined,             "a******hijk",      'one short of that gives up one head character'],
    ["abcdefghij",                              undefined,             "******ghij",       'two short of that gives up the whole head'],
    ["abcdefg",                                 undefined,             "******g",          'a tail is given up only after the head is gone'],
    ["abcdef",                                  undefined,             "******",           'exactly minStars long shows only stars'],
    ["a",                                       undefined,             "******",           'one character gets minStars stars'],
    ["abcdefg",                                 { head: 5, tail: 0 },  "a******",          'asked for no tail, the head is what survives'],
    ["abcdefghij",                              { head: 3, tail: 3 },  "a******hij",       'a custom head and tail give way the same way'],

    // maxLen:
    ["abcdefghijklmno",                         undefined,             "ab*********lmno",  'fifteen characters is the longest to show whole'],
    ["abcdefghijklmnop",                        undefined,             "ab***...***mnop",  'one character over maxLen collapses'],
    ["abcdefghijklmnop",                        { maxLen: 16 },        "ab**********mnop", 'a larger maxLen lets it through'],
    ["abcdefghijklmnop",                        { maxLen: Infinity },  "ab**********mnop", 'a maxLen of Infinity never collapses'],
    ["abcdefghijklmnop",                        { head: 0, tail: 0 },  "***...***",        'stars only collapses too'],
    ["abcdefghijklmnop",                        { head: 4, tail: 4, maxLen: 20 }, "abcd********mnop", 'a custom head and tail within maxLen'],
    ["abcdefghijklmnopqrstuvwxyz0123",          { head: 10, tail: 10 }, "abcdefghij***...***uvwxyz0123", 'a generous head and tail raise the default maxLen to fit a collapse'],
    ["abcdefghijklmnopqrstuvwxyz",              { head: 4 },           "abcd***...***wxyz", 'a larger head alone raises the default maxLen with it'],
    ["abcdefghijklmnop",                        { head: 0, tail: 0, maxLen: 9 }, "***...***", 'maxLen exactly the collapsed width is allowed'],
    // a collapsed result shows what the give-up rule allows for this whisper, no more:
    ["abcdefghijklmnopqrstuvwxyz",              { minStars: 22 },      "***...***wxyz",    'a collapse of a barely showable whisper keeps only the tail it can show'],
    ["abcdefghijklmnopqrstuvwxyz",              { minStars: 24 },      "***...***yz",      'a collapse with two showable characters keeps them as tail'],
    ["abcdefghijklmnopqrstuvwxyz",              { minStars: 26 },      "***...***",        'a collapse with nothing showable shows nothing'],
    ["abcdefghijklmnopqrstuvwxyz",              { minStars: 40 },      "***...***",        'minStars beyond the whisper collapses to bare stars'],
    ["abcdefghij",                              { minStars: 2 },       "ab****ghij",       'a smaller minStars shows more'],
    ["abc",                                     { minStars: 0 },       "abc",              'a minStars of zero may show a short whisper whole'],

    // control characters, and nothing at all:
    ["",                                        undefined,             "",                 'an empty whisper has nothing to show'],
    ["\n\t\r\0\u{1B}\u{7F}",                    undefined,             "",                 'a whisper of only control characters is empty once stripped'],
    ["\u{2028}\u{2029}",                        undefined,             "",                 'line and paragraph separators are stripped too'],
    ["abc\0def\u{7F}ghi\rjkl",                  undefined,             "ab******ijkl",     'control characters inside a key vanish, and do not count toward its length'],

    // bidirectional controls and invisible characters:
    ["sk-ant-abcd12\u{202E}34",                  undefined,             "sk*********1234",  'a right-to-left override in the tail is stripped'],
    ["\u{202A}\u{2066}sk-ant-abcd1234\u{2069}\u{202C}", undefined,    "sk*********1234",  'embeddings and isolates are stripped'],
    ["sk-ant-abcd1234\u{200E}\u{200F}\u{061C}", undefined,             "sk*********1234",  'directional marks are stripped'],
    ["sk-ant-abcd1\u{200B}2\u{200B}34",         undefined,             "sk*********1234",  'zero-width spaces in the tail do not count as characters'],
    ["\u{FEFF}sk-ant-abcd1234\u{2060}",         undefined,             "sk*********1234",  'a byte-order mark and a word joiner are stripped'],
    ["\u{200B}\u{2060}\u{FEFF}\u{202E}",        undefined,             "",                 'a whisper of only invisible characters is empty once stripped'],

    // characters as a user sees them:
    [`${KeyEmoji}${KeyEmoji}abcdefghij${Rocket}${Rocket}`, undefined,  `${KeyEmoji}${KeyEmoji}********ij${Rocket}${Rocket}`, 'emoji count as one character each'],
    [`${Family}${Family}abcdefghij${Family}${Family}`,     undefined,  `${Family}${Family}********ij${Family}${Family}`,       'an emoji built of several code points is not split'],
    [EAcute.repeat(12),                         undefined,             `${EAcute}${EAcute}******${EAcute.repeat(4)}`, 'a letter with a combining accent is one character'],
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

  it("never returns more characters than maxLen", () => {
    const whisper = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const combos = [9, 10, 15, 20, 36, Infinity].flatMap((maxLen) => (
      HeadTails.flatMap(([head, tail]) => (
        [0, 6, 20, 40].map((minStars) => ({ head, tail, minStars, maxLen }))
      ))
    )).filter((opts) => opts.maxLen >= opts.head + opts.tail + 9)
    for (const opts of combos) {
      for (const len of [0, 1, 5, 12, 20, 36]) {
        expect(mask(whisper.slice(0, len), opts).length).to.be.at.most(opts.maxLen)
      }
    }
  })

  describe("without Intl.Segmenter", () => {
    it("still masks by code point, so emoji stay whole", () => {
      withoutSegmenter(() => {
        expect(mask(`${KeyEmoji}${KeyEmoji}abcdefghij${Rocket}${Rocket}`)).to.eq(`${KeyEmoji}${KeyEmoji}********ij${Rocket}${Rocket}`)
      })
    })
  })

  describe("without Intl at all", () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it("still masks by code point", () => {
      vi.stubGlobal('Intl', undefined)
      expect(mask('sk-ant-abcd1234')).to.eq("sk*********1234")
    })
  })

  describe("refusals", () => {
    const BadOpts: readonly [MaskOpts, string][] = [
      [{ head: -1 },          'a negative head'],
      [{ tail: 1.5 },         'a fractional tail'],
      [{ minStars: NaN },    'a minStars that is not a number'],
      [{ maxLen: -3 },        'a negative maxLen'],
      [{ maxLen: 2.5 },       'a fractional maxLen'],
      [{ maxLen: 14 },        'a maxLen too small for the default head and tail to collapse into'],
      [{ maxLen: 5 },         'a maxLen smaller than the collapsed marker'],
      [{ head: 6, maxLen: 18 }, 'a maxLen too small for a larger head'],
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

    it("names the options and the shortest maxLen when a maxLen is too small", () => {
      const err = thrownBy(() => mask('sk-ant-abcd1234', { head: 3, tail: 2, maxLen: 10 }))
      expect(err).to.be.instanceOf(VaultError)
      expect((err as VaultError).message).to.match(/maxLen.*head.*tail.*14/)
    })

    it("never quotes the whisper in what it throws", () => {
      const fake = 'sk-FAKE-do-not-leak-0123456789'
      for (const opts of [{ head: -1 }, { maxLen: 0.5 }, { maxLen: 10 }]) {
        const err = thrownBy(() => mask(fake, opts))
        expect(err).to.be.instanceOf(VaultError)
        expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.to.contain('FAKE')
      }
    })
  })
})
