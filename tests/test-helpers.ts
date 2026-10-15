/**
 * The root's test helpers, for the tests of its tooling in `scripts/`: star-import it as `TH`
 * (`import * as TH from '../test-helpers'`).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { onTestFinished } from 'vitest'

/**
 * A fresh, empty directory under the system's temp directory, removed with everything in it
 * once the test that made it finishes, pass or fail. Call it inside a test or a `beforeEach`.
 *
 * @param prefix - The start of the directory's name, saying which suite made it.
 * @returns The directory's path.
 *
 * @example beforeEach(() => { scratch = TH.makeScratchDir('release-pack-') })
 */
export const makeScratchDir = (prefix: string): string => {
  const scratch = mkdtempSync(path.join(tmpdir(), prefix))
  onTestFinished(() => { rmSync(scratch, { recursive: true, force: true }) })
  return scratch
}
