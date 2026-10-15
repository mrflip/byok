import { describe, expect, it } from 'vitest'
import * as safebyokGraphqlServer from '../src/server'

describe("the server's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyokGraphqlServer)).to.have.members(['VaultSchemaSdl', 'vaultResolvers'])
  })
})
