/**
 * `pnpm changeset`: the changesets CLI, with the changeset it writes named for the thread. The
 * CLI names a new changeset with random words (`wacky-deserts-start.md`); this runs it as given,
 * then renames each changeset it wrote to the thread's branch name, `YYYYMMDD-<label>.md`, adding
 * `-2`, `-3`, ... when that name is taken. Off a thread branch (main, a detached HEAD, a bot's
 * branch) the random name stays, and it says so.
 *
 *   node scripts/changeset.ts [changeset arguments...]
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { Label } from './newb-label.ts'
import { processRunner, type Runner } from './release.ts'

/** One changeset renamed: its file name as the CLI wrote it, and as it is now */
export interface Renamed {
  from: string
  to:   string
}

/**
 * The thread a branch is, if it is one: `YYYYMMDD-<label>`, as PROCESS.md names a thread's branch.
 *
 * @param branch - A branch name, as `git branch --show-current` prints it.
 * @returns The branch name, or undefined when it is not a thread's.
 *
 * @example threadOf('20261015-roadmap_fruit')  // => '20261015-roadmap_fruit'
 * @example threadOf('main')                    // => undefined
 */
export function threadOf(branch: string): string | undefined {
  const label = /^20\d{6}-(.+)$/.exec(branch)?.[1] ?? ''
  return Label.re.test(label) ? branch : undefined
}

/**
 * The file name for a thread's changeset: `<thread>.md`, or the first of `<thread>-2.md`,
 * `<thread>-3.md`, ... not already taken.
 *
 * @param thread - The thread's branch name.
 * @param taken  - File names already in .changeset/.
 * @returns A file name not in `taken`.
 *
 * @example changesetFilename('20261015-roadmap_fruit', new Set(['20261015-roadmap_fruit.md']))  // => '20261015-roadmap_fruit-2.md'
 */
export function changesetFilename(thread: string, taken: ReadonlySet<string>): string {
  return firstFree(thread, taken, 1)
}

function firstFree(thread: string, taken: ReadonlySet<string>, suffix: number): string {
  const filename = suffix === 1 ? `${thread}.md` : `${thread}-${String(suffix)}.md`
  return taken.has(filename) ? firstFree(thread, taken, suffix + 1) : filename
}

/**
 * The Markdown files in a changeset directory: the changesets, and its README.
 *
 * @param changesetDir - The .changeset directory.
 * @returns Their file names.
 */
export function markdownFiles(changesetDir: string): Set<string> {
  return new Set(readdirSync(changesetDir).filter((filename) => filename.endsWith('.md')))
}

/**
 * The changesets written since `before` was listed, in order of file name.
 *
 * @param changesetDir - The .changeset directory.
 * @param before       - Its Markdown files before the CLI ran, from `markdownFiles`.
 * @returns Their file names.
 */
export function newChangesets(changesetDir: string, before: ReadonlySet<string>): string[] {
  return readdirSync(changesetDir)
    .filter((filename) => filename.endsWith('.md') && ! before.has(filename))
    .toSorted((left, right) => left.localeCompare(right))
}

/**
 * Renames each changeset written since `before` was listed to a name of the thread's.
 *
 * @param changesetDir - The .changeset directory.
 * @param before       - Its Markdown files before the CLI ran, from `markdownFiles`.
 * @param thread       - The thread's branch name.
 * @returns Each changeset renamed.
 */
export function renameNewChangesets(changesetDir: string, before: ReadonlySet<string>, thread: string): Renamed[] {
  const taken = new Set(before)
  return newChangesets(changesetDir, before).map((from) => {
    const to = changesetFilename(thread, taken)
    taken.add(to)
    renameSync(path.join(changesetDir, from), path.join(changesetDir, to))
    return { from, to }
  })
}

async function currentBranch(run: Runner): Promise<string> {
  const result = await run('git', ['branch', '--show-current'])
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

async function main(argv: readonly string[]): Promise<number> {
  const rootDir = path.resolve(import.meta.dirname, '..')
  const changesetDir = path.join(rootDir, '.changeset')
  const before = markdownFiles(changesetDir)
  const result = spawnSync(path.join(rootDir, 'node_modules', '.bin', 'changeset'), argv, { cwd: rootDir, stdio: 'inherit' })
  const branch = await currentBranch(processRunner(rootDir))
  const thread = threadOf(branch)
  if (! thread) {
    const written = newChangesets(changesetDir, before)
    if (written.length > 0) {
      process.stderr.write(`changeset: ${branch || 'this HEAD'} is not a thread branch (YYYYMMDD-<label>), so ${written.join(', ')} keeps its name.\n`)
    }
    return result.status ?? 1
  }
  for (const { from, to } of renameNewChangesets(changesetDir, before, thread)) {
    process.stdout.write(`changeset: .changeset/${from} is renamed .changeset/${to}, for the thread.\n`)
  }
  return result.status ?? 1
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
