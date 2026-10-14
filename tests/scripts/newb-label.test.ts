import { describe, expect, it } from 'vitest'
import * as NewbLabel from '../../scripts/newb-label'

const BranchLabelCases = [
  // regular usage:
  [["z9foo_bar_baz"],                   "z9foo_bar_baz",              'a label passes through unchanged'],
  [["++9FOO", "", "bar", "!!baz"],      "z9foo_bar_baz",              'words are joined, lowercased, and their punctuation collapsed'],
  [["20260928-++9FOO", "bar", "!!baz"], "z9foo_bar_baz",              'a leading datestamp comes off'],
  [["9foo-bar-baz"],                    "z9foo_bar_baz",              'hyphens become underscores, and a leading digit gets a letter'],
  [["20260928-migration_scripts"],      "migration_scripts",          'another branch\'s name gives back its label'],
  // trivial cases:
  [[],                                  "",                           'no words give no label'],
  [["20260928-"],                       "",                           'a bare datestamp gives no label'],
  // weird cases:
  [["migration", "20260928-scripts"],   "migration_20260928_scripts", 'a datestamp away from the start stays, as words'],
  [["éclair!"],                         "eclair",                     'a leading accented letter is deburred, not stripped as punctuation'],
  [["__20260928-foo"],                  "z20260928_foo",              'a datestamp behind punctuation is not at the start, so stays'],
] as const

describe('branchLabel', () => {
  for (const [words, expected, blurb] of BranchLabelCases) {
    it(blurb, () => { expect(NewbLabel.branchLabel(words)).to.eq(expected) })
  }
})

const NormalizeCases = [
  // regular usage:
  ["Hello, World!",   "hello_world", 'punctuation and spaces collapse to one underscore'],
  ["  ",              "",            'a blank string gives no label'],
  // edge cases:
  ["!!!",             "zz",          'nothing but punctuation is padded out to the shortest label'],
  ["a",               "az",          'one letter is padded out to the shortest label'],
  ["x".repeat(39) + " y", "x".repeat(39), 'a label cut at its longest drops the underscore it ends on'],
] as const

describe('normalize', () => {
  for (const [str, expected, blurb] of NormalizeCases) {
    it(blurb, () => { expect(NewbLabel.normalize(str)).to.eq(expected) })
  }

  it('never gives a label longer than Label.max', () => {
    expect(NewbLabel.normalize('word '.repeat(20))).to.have.lengthOf.at.most(NewbLabel.Label.max)
  })
})
