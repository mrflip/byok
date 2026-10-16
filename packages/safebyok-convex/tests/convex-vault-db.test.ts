import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import { toConvexLockbox } from '../src/convex-vault-db'

describe("toConvexLockbox", () => {
  const { note: _note, ...noteless } = TH.boxOf('anthropic_api_key', 'a1')

  it("keeps a lockbox's note", () => {
    expect(toConvexLockbox(TH.boxOf('anthropic_api_key', 'a1'))).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("drops an undefined note, as an earlier version's store may hold one", () => {
    const converted = toConvexLockbox({ ...noteless, note: undefined })
    expect(converted).to.deep.equal(noteless)
    expect(converted).to.not.have.property('note')
  })

  it("leaves a lockbox with no note as it is", () => {
    expect(toConvexLockbox(noteless)).to.deep.equal(noteless)
  })
})
