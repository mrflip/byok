import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Changeset from '../../scripts/changeset'
import * as TH from '../test-helpers'

const ThreadCases = [
  // regular usage:
  ["20261015-roadmap_fruit",       "20261015-roadmap_fruit", 'a thread branch is its own thread'],
  ["20261015-tamper_test_helper2", "20261015-tamper_test_helper2", 'a label may hold digits'],
  // not a thread:
  ["main",                         undefined,                'main is no thread'],
  ["",                             undefined,                'a detached HEAD, with no branch, is no thread'],
  ["changeset-release/main",       undefined,                'the Version PR\'s branch is no thread'],
  ["dependabot/npm_and_yarn/foo",  undefined,                'a bot\'s branch is no thread'],
  // edge cases:
  ["20261015-",                    undefined,                'a bare datestamp is no thread'],
  ["20261015-tamper-test-helper",  undefined,                'a label with hyphens is not a label'],
  ["2026101-roadmap_fruit",        undefined,                'a short datestamp is no datestamp'],
] as const

describe("threadOf", () => {
  for (const [branch, expected, blurb] of ThreadCases) {
    it(blurb, () => { expect(Changeset.threadOf(branch)).to.eq(expected) })
  }
})

const Thread = '20261015-roadmap_fruit'

const FilenameCases = [
  // regular usage:
  [[],                                                          `${Thread}.md`,   'the first changeset takes the thread\'s name'],
  [['README.md', 'config.json', 'wacky-deserts-start.md'],      `${Thread}.md`,   'other files take nothing from it'],
  [[`${Thread}.md`],                                            `${Thread}-2.md`, 'a second changeset gets a suffix'],
  // edge cases:
  [[`${Thread}.md`, `${Thread}-2.md`],                          `${Thread}-3.md`, 'the suffix counts on'],
  [[`${Thread}.md`, `${Thread}-3.md`],                          `${Thread}-2.md`, 'a gap is filled first'],
  [[`${Thread}-2.md`],                                          `${Thread}.md`,   'the plain name, free again, is taken first'],
] as const

describe("changesetFilename", () => {
  for (const [taken, expected, blurb] of FilenameCases) {
    it(blurb, () => { expect(Changeset.changesetFilename(Thread, new Set(taken))).to.eq(expected) })
  }
})

describe("renameNewChangesets", () => {
  let scratch: string
  beforeEach(() => {
    scratch = TH.makeScratchDir('changeset-rename-')
    writeFileSync(path.join(scratch, 'README.md'), '# Changesets\n')
    writeFileSync(path.join(scratch, 'config.json'), '{}\n')
  })

  it("renames the changeset the CLI wrote for the thread, and keeps its contents", () => {
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'wacky-deserts-start.md'), '---\n"safebyok": patch\n---\n\nA fix.\n')
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([{ from: 'wacky-deserts-start.md', to: `${Thread}.md` }])
    expect(readFileSync(path.join(scratch, `${Thread}.md`), 'utf8')).to.include('A fix.')
    expect(readdirSync(scratch)).to.have.members(['README.md', 'config.json', `${Thread}.md`])
  })

  it("gives a second changeset on the thread a suffix", () => {
    writeFileSync(path.join(scratch, `${Thread}.md`), '---\n---\n')
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'brave-owls-sing.md'), '---\n---\n')
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([{ from: 'brave-owls-sing.md', to: `${Thread}-2.md` }])
  })

  it("leaves alone the changesets that were there before", () => {
    writeFileSync(path.join(scratch, 'releases-bootstrap.md'), '---\n---\n')
    const before = Changeset.markdownFiles(scratch)
    expect(Changeset.renameNewChangesets(scratch, before, Thread)).to.deep.equal([])
    expect(readdirSync(scratch)).to.include('releases-bootstrap.md')
  })

  it("names several new changesets apart", () => {
    const before = Changeset.markdownFiles(scratch)
    writeFileSync(path.join(scratch, 'brave-owls-sing.md'), '---\n---\n')
    writeFileSync(path.join(scratch, 'wacky-deserts-start.md'), '---\n---\n')
    const renamed = Changeset.renameNewChangesets(scratch, before, Thread)
    expect(renamed.map(({ to }) => to)).to.deep.equal([`${Thread}.md`, `${Thread}-2.md`])
  })
})
