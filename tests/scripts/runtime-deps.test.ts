import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Release from '../../scripts/release'
import * as RuntimeDeps from '../../scripts/runtime-deps'

const RepoRoot = path.resolve(import.meta.dirname, '../..')

const Idb6_3 = { dependencies: { 'idb-keyval': '^6.3.0' } }
const Idb6_4 = { dependencies: { 'idb-keyval': '^6.4.0' } }
const Bumped: RuntimeDeps.RuntimeDepChange = { pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: '^6.3.0', post: '^6.4.0' }

const ChangeCases = [
  // regular usage:
  [Idb6_3,                                         Idb6_4,                                            [Bumped],                                                                  'a dependency\'s range moved'],
  [Idb6_3,                                         Idb6_3,                                            [],                                                                        'nothing moved'],
  [{ ...Idb6_3, devDependencies: { vitest: "^5.0.3" } }, { ...Idb6_3, devDependencies: { vitest: "^5.0.4" } }, [],                                                   'a devDependency is not shipped, so it never counts'],
  [{ peerDependencies: { zod: "^4.0.0" } },        { peerDependencies: { zod: "^4.1.0" } },           [{ pkgname: 'safebyok', field: 'peerDependencies', depname: 'zod', ante: "^4.0.0", post: "^4.1.0" }], 'a peer\'s range counts'],
  [{},                                             { optionalDependencies: { vitest: "^5.0.0" } },    [{ pkgname: 'safebyok', field: 'optionalDependencies', depname: 'vitest', ante: undefined, post: "^5.0.0" }], 'an optional dependency added counts'],
  // edge cases:
  [Idb6_3,                                         {},                                                [{ ...Bumped, post: undefined }],                                          'a dependency dropped counts'],
  [Idb6_3,                                         { peerDependencies: { 'idb-keyval': "^6.3.0" } },  [{ ...Bumped, post: undefined }, { ...Bumped, field: 'peerDependencies', ante: undefined, post: "^6.3.0" }], 'a dependency moved from one field to another counts in both'],
] as const

describe("runtimeDepChanges", () => {
  for (const [ante, post, expected, blurb] of ChangeCases) {
    it(blurb, () => { expect(RuntimeDeps.runtimeDepChanges('safebyok', ante, post)).to.deep.equal(expected) })
  }
})

describe("describeChange", () => {
  it("says which package, which field and which dependency, and its range before and after", () => {
    expect(RuntimeDeps.describeChange(Bumped)).to.eq('safebyok: dependencies.idb-keyval ^6.3.0 -> ^6.4.0')
  })

  it("says (none) for a side the dependency is missing from", () => {
    expect(RuntimeDeps.describeChange({ ...Bumped, ante: undefined })).to.eq('safebyok: dependencies.idb-keyval (none) -> ^6.4.0')
  })
})

describe("changedRuntimeDeps, in the workspace as it stands", () => {
  it("finds nothing moved between a commit and itself", async () => {
    const run = Release.processRunner(RepoRoot)
    const packages = Release.publicPackages(await Release.listWorkspace(run), RepoRoot)
    expect(await RuntimeDeps.changedRuntimeDeps(run, RepoRoot, packages, 'HEAD', 'HEAD')).to.deep.equal([])
  })
})

// A scratch repository of two packages, a base commit and a head commit on top of it.
describe("changedRuntimeDeps, between two commits", () => {
  let scratch = ''
  let run: Release.Runner = Release.processRunner('.')
  const git = async (...args: string[]) => {
    const result = await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args])
    expect(result.exitCode, result.stderr).to.eq(0)
  }
  const writeManifest = (dir: string, manifest: object) => {
    mkdirSync(path.join(scratch, dir), { recursive: true })
    writeFileSync(path.join(scratch, dir, 'package.json'), JSON.stringify(manifest, null, 2))
  }
  const pkgAt = (pkgname: string, dir: string): Release.WorkspacePackage => (
    { name: pkgname, path: path.join(scratch, dir), private: false }
  )

  beforeEach(async () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'runtime-deps-'))
    run = Release.processRunner(scratch)
    await git('init', '--quiet')
    writeManifest('packages/core', { name: 'core', ...Idb6_3, devDependencies: { vitest: "^5.0.3" } })
    await git('add', '.')
    await git('commit', '--quiet', '--message', 'base')
    await git('tag', 'base')
  })
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }) })

  it("finds nothing moved by a devDependency bump", async () => {
    writeManifest('packages/core', { name: 'core', ...Idb6_3, devDependencies: { vitest: "^5.0.4" } })
    await git('commit', '--quiet', '--all', '--message', 'head')
    const changes = await RuntimeDeps.changedRuntimeDeps(run, scratch, [pkgAt('core', 'packages/core')], 'base', 'HEAD')
    expect(changes).to.deep.equal([])
  })

  it("finds a runtime dependency's range moved", async () => {
    writeManifest('packages/core', { name: 'core', ...Idb6_4, devDependencies: { vitest: "^5.0.3" } })
    await git('commit', '--quiet', '--all', '--message', 'head')
    const changes = await RuntimeDeps.changedRuntimeDeps(run, scratch, [pkgAt('core', 'packages/core')], 'base', 'HEAD')
    expect(changes).to.deep.equal([{ ...Bumped, pkgname: 'core' }])
  })

  it("counts every runtime dependency of a package new since the base", async () => {
    writeManifest('packages/react', { name: 'react-binding', peerDependencies: { react: "^19.0.0" } })
    await git('add', '.')
    await git('commit', '--quiet', '--message', 'head')
    const packages = [pkgAt('core', 'packages/core'), pkgAt('react-binding', 'packages/react')]
    const changes = await RuntimeDeps.changedRuntimeDeps(run, scratch, packages, 'base', 'HEAD')
    expect(changes).to.deep.equal([{ pkgname: 'react-binding', field: 'peerDependencies', depname: 'react', ante: undefined, post: "^19.0.0" }])
  })

  it("refuses a base that is not a commit here, rather than reading every dependency as new", async () => {
    const changing = RuntimeDeps.changedRuntimeDeps(run, scratch, [pkgAt('core', 'packages/core')], 'f'.repeat(40), 'HEAD')
    await expect(changing).rejects.toThrow('is not a commit in this repository')
  })
})
