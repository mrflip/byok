/**
 * The runtime dependencies a change moves in the public packages: their `dependencies`,
 * `peerDependencies` and `optionalDependencies`, which ship to every host that installs them. CI
 * asks it of a Dependabot pull request (.github/workflows/ci.yml): one that moves none ships
 * nothing new and needs no changeset; one that moves any needs a changeset like any other pull
 * request, and the Coach writes it by hand.
 *
 * Prints one line per dependency moved, and nothing when none moved:
 *
 *   node scripts/runtime-deps.ts <base-commit> [<head-commit>]
 *   safebyok: dependencies.idb-keyval ^6.3.0 -> ^6.4.0
 */
import path from 'node:path'
import { listWorkspace, processRunner, publicPackages, type Runner, type WorkspacePackage } from './release.ts'

/** The `package.json` fields that ship to a host, as ranges it will install */
export const RuntimeFields = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

/** One of the `package.json` fields that ship to a host */
export type RuntimeField = typeof RuntimeFields[number]

/** A `package.json`, as far as its runtime dependencies go */
export type Manifest = Partial<Record<RuntimeField, Record<string, string>>>

/** One runtime dependency moved: added, dropped, or its range changed */
export interface RuntimeDepChange {
  pkgname: string
  field:   RuntimeField
  depname: string
  /** Its range before the change; undefined when the change adds it */
  ante:    string | undefined
  /** Its range after the change; undefined when the change drops it */
  post:    string | undefined
}

/**
 * Each runtime dependency that differs between two versions of one package's manifest.
 *
 * @param pkgname - The package the manifests are of.
 * @param ante    - Its manifest before the change; `{}` when the package is new.
 * @param post    - Its manifest after the change.
 * @returns The dependencies moved, field by field, in the order the manifests list them.
 *
 * @example runtimeDepChanges('safebyok', { dependencies: { 'idb-keyval': '^6.3.0' } }, { dependencies: { 'idb-keyval': '^6.4.0' } })
 *   // => [{ pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: '^6.3.0', post: '^6.4.0' }]
 */
export function runtimeDepChanges(pkgname: string, ante: Manifest, post: Manifest): RuntimeDepChange[] {
  return RuntimeFields.flatMap((field) => {
    const anteDeps = ante[field] ?? {}
    const postDeps = post[field] ?? {}
    const depnames = [...new Set([...Object.keys(anteDeps), ...Object.keys(postDeps)])]
    return depnames
      .filter((depname) => anteDeps[depname] !== postDeps[depname])
      .map((depname) => ({ pkgname, field, depname, ante: anteDeps[depname], post: postDeps[depname] }))
  })
}

/**
 * One change as a line for a person to read.
 *
 * @param change - The dependency moved.
 * @returns The line, without a newline.
 *
 * @example describeChange({ pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: '^6.3.0', post: '^6.4.0' })
 *   // => 'safebyok: dependencies.idb-keyval ^6.3.0 -> ^6.4.0'
 * @example describeChange({ pkgname: 'safebyok', field: 'dependencies', depname: 'idb-keyval', ante: undefined, post: '^6.4.0' })
 *   // => 'safebyok: dependencies.idb-keyval (none) -> ^6.4.0'
 */
export function describeChange(change: RuntimeDepChange): string {
  return `${change.pkgname}: ${change.field}.${change.depname} ${change.ante ?? '(none)'} -> ${change.post ?? '(none)'}`
}

/**
 * The runtime dependencies moved in the given packages between two commits, reading each
 * package's `package.json` from git at both. A package absent at the base is new, and every
 * runtime dependency it has counts as moved.
 *
 * @param run      - Runs `git`, in the repository.
 * @param rootDir  - The repository's root.
 * @param packages - The packages to compare: the public ones.
 * @param base     - The commit the change starts from.
 * @param head     - The commit the change ends at.
 * @returns The dependencies moved, package by package.
 */
export async function changedRuntimeDeps(run: Runner, rootDir: string, packages: readonly WorkspacePackage[], base: string, head: string): Promise<RuntimeDepChange[]> {
  await verifyCommit(run, base)
  await verifyCommit(run, head)
  const changes = await Promise.all(packages.map(async (pkg) => {
    const manifestPath = path.relative(rootDir, path.join(pkg.path, 'package.json')).split(path.sep).join('/')
    const [ante, post] = await Promise.all([manifestAt(run, base, manifestPath), manifestAt(run, head, manifestPath)])
    return runtimeDepChanges(pkg.name, ante, post)
  }))
  return changes.flat()
}

async function verifyCommit(run: Runner, commit: string): Promise<void> {
  const result = await run('git', ['rev-parse', '--verify', '--quiet', `${commit}^0`])
  if (result.exitCode !== 0) { throw new Error(`runtime-deps: ${commit} is not a commit in this repository; fetch it first.`) }
}

async function manifestAt(run: Runner, commit: string, manifestPath: string): Promise<Manifest> {
  const present = await run('git', ['cat-file', '-e', `${commit}:${manifestPath}`])
  if (present.exitCode !== 0) { return {} }
  const result = await run('git', ['show', `${commit}:${manifestPath}`])
  if (result.exitCode !== 0) { throw new Error(`runtime-deps: git could not show ${manifestPath} at ${commit}: ${result.stderr.trim()}`) }
  return JSON.parse(result.stdout) as Manifest
}

async function main(argv: readonly string[]): Promise<number> {
  const [base, head = 'HEAD'] = argv
  if (! base) {
    process.stderr.write('Usage: node scripts/runtime-deps.ts <base-commit> [<head-commit>]\n')
    return 2
  }
  const rootDir = path.resolve(import.meta.dirname, '..')
  const run = processRunner(rootDir)
  const packages = publicPackages(await listWorkspace(run), rootDir)
  const changes = await changedRuntimeDeps(run, rootDir, packages, base, head)
  for (const change of changes) { process.stdout.write(`${describeChange(change)}\n`) }
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
