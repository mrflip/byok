import { describe, expect, it } from 'vitest'
import * as safebyokGraphql from '../src/index'

describe("the package's entry point, the browser's half", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyokGraphql)).to.have.members(['graphqlVaultDB'])
  })
})
