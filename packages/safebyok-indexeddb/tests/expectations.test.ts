import { describe, expect, it } from 'vitest'
import { bundleMeetsExpectation, lockboxMeetsExpectation, vaultMeetsExpectation } from '../src/expectations'
import * as TH from './test-helpers'

const Bundle = TH.bundleOf('u1')
const Box = TH.boxOf('anthropic', 'one')

const BundleCases = [
  // regular usage:
  [Bundle,                                        { vault_id: "vault-id-u1", unlock_epoch: 1 },  true,   'the bundle proven against'],
  [Bundle,                                        { vault_id: "vault-id-u1", unlock_epoch: 2 },  false,  'an epoch the bundle has not reached'],
  [TH.bundleOf('u1', { unlock_epoch: 2 }),    { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'an epoch since moved on'],
  [TH.bundleOf('u1', { vault_id: 'reborn' }),     { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a vault made anew'],
  // nothing, or damage, standing:
  [undefined,                                     { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'no bundle at all'],
  [{ vault_id: "vault-id-u1" },                   { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that shows no epoch'],
  [{ vault_id: "vault-id-u1", unlock_epoch: "1" }, { vault_id: "vault-id-u1", unlock_epoch: 1 }, false, 'an epoch stored as text'],
  ["vault-id-u1",                                 { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that is no object'],
] as const

describe("bundleMeetsExpectation", () => {
  for (const [standing, expected, landed, blurb] of BundleCases) {
    it(blurb, () => { expect(bundleMeetsExpectation(standing, expected)).to.eq(landed) })
  }
})

describe("vaultMeetsExpectation", () => {
  it("holds for the vault's bundle at any epoch, and for nothing else", () => {
    expect(vaultMeetsExpectation(Bundle, { vault_id: 'vault-id-u1' })).to.be.true
    expect(vaultMeetsExpectation(TH.bundleOf('u1', { unlock_epoch: 9 }), { vault_id: 'vault-id-u1' })).to.be.true
    expect(vaultMeetsExpectation(Bundle, { vault_id: 'reborn' })).to.be.false
    expect(vaultMeetsExpectation(undefined, { vault_id: 'vault-id-u1' })).to.be.false
    expect(vaultMeetsExpectation(null, { vault_id: 'vault-id-u1' })).to.be.false
  })

  it("fails a bundle too damaged to show an epoch, though it shows the vault_id", () => {
    expect(vaultMeetsExpectation({ vault_id: 'vault-id-u1' }, { vault_id: 'vault-id-u1' })).to.be.false
    expect(vaultMeetsExpectation({ vault_id: 'vault-id-u1', unlock_epoch: '1' }, { vault_id: 'vault-id-u1' })).to.be.false
  })
})

const LockboxCases = [
  // regular usage:
  [Bundle,     undefined,                     null,       true,   'a first write, where no lockbox stands'],
  [Bundle,     Box,                           "rev-one",  true,   'a write over the revision read'],
  [Bundle,     Box,                           "rev-two",  false,  'a write over a revision never read'],
  [Bundle,     Box,                           null,       false,  'a first write where a lockbox now stands'],
  [Bundle,     undefined,                     "rev-one",  false,  'a write over a lockbox since erased'],
  // the bundle half:
  [undefined,  undefined,                     null,       false,  'a write into a scope with no bundle'],
  [TH.bundleOf('u1', { vault_id: 'reborn' }), Box,  "rev-one",  false,  'a write sealed for a vault since made anew'],
  // nothing, or damage, standing:
  [{ vault_id: "vault-id-u1" },  undefined,   null,       false,  'a bundle row that shows no epoch'],
  [Bundle,     null,                          null,       true,   'a null row reads as no lockbox, as a read does'],
  [Bundle,     { boxlabel: "anthropic" },     "rev-one",  false,  'a lockbox row that shows no revision'],
] as const

describe("lockboxMeetsExpectation", () => {
  for (const [standingBundle, standingBox, revisionId, landed, blurb] of LockboxCases) {
    it(blurb, () => {
      expect(lockboxMeetsExpectation(standingBundle, standingBox, { vault_id: 'vault-id-u1', revision_id: revisionId })).to.eq(landed)
    })
  }
})
