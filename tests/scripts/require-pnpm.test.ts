import { describe, expect, it } from 'vitest'
import { pnpmRefusal } from '../../scripts/require-pnpm'

const GoesOnCases = [
  ["pnpm/12.4.2 npm/? node/v24.21.0 linux x64",            'pnpm goes on'],
] as const

const RefusedCases = [
  // regular usage:
  ["npm/11.19.0 node/v24.21.0 linux x64 workspaces/false", 'npm is refused'],
  // edge cases:
  ["yarn/4.9.1 npm/? node/v24.21.0 linux x64",             'any other package manager is refused'],
  [undefined,                                              'no package manager at all is refused'],
  ["",                                                     'a blank user agent is refused'],
  ["npm/11.19.0 pnpm/12.4.2",                              'pnpm named anywhere but first is not pnpm running'],
] as const

describe("pnpmRefusal", () => {
  for (const [userAgent, blurb] of GoesOnCases) {
    it(blurb, () => { expect(pnpmRefusal(userAgent)).to.be.null })
  }
  for (const [userAgent, blurb] of RefusedCases) {
    it(blurb, () => { expect(pnpmRefusal(userAgent)).to.be.a('string') })
  }

  it("says what to do instead, and why", () => {
    expect(pnpmRefusal('npm/11.19.0')).to.include('pnpm publish')
    expect(pnpmRefusal('npm/11.19.0')).to.include('@safebyok/source')
  })
})
