import { describe, expect, it } from 'vitest'
import * as Byok from '../src/index'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(Byok)).to.have.members(['Argon2idWebV1'])
  })
})
