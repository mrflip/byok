import { describe, expect, it } from 'vitest'
import * as utils from '../src/utils'

describe("the utils entry point", () => {
  it("exports exactly mask", () => {
    expect(Object.keys(utils)).to.have.members(['mask'])
  })

  it("exports a mask that masks", () => {
    expect(utils.mask('sk-ant-abcd1234')).to.eq('sk*********1234')
  })
})
