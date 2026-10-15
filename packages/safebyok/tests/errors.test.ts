import { describe, expect, it } from 'vitest'
import { VaultError, VaultErrorFamilyForKind, VaultErrorFamilyVals, VaultErrorKindVals, isVaultCondition } from '../src/errors'

describe("VaultErrorFamilyForKind", () => {
  it("names a family for every kind, and only for kinds", () => {
    expect(Object.keys(VaultErrorFamilyForKind)).to.have.members([...VaultErrorKindVals])
  })

  it("uses only the families in VaultErrorFamilyVals, and uses both", () => {
    expect([...new Set(Object.values(VaultErrorFamilyForKind))]).to.have.members([...VaultErrorFamilyVals])
  })

  it("matches the @examples", () => {
    expect(VaultErrorFamilyForKind.bad_option).to.eq('misuse')
    expect(VaultErrorFamilyForKind.storage_unavailable).to.eq('condition')
  })
})

const FamilyCases = [
  // misuse: the host developer's code is wrong, and no user action fixes it
  ["bad_label",           "misuse",    'a label the app chose that breaks the rules is a bug'],
  ["bad_whisper",         "misuse",    'storing what JSON cannot carry is a bug'],
  ["bad_option",          "misuse",    'an openVault option out of range is a bug'],
  ["vault_closed",        "misuse",    'using a handle after close() is a bug'],
  ["unknown_key_deriver", "misuse",    'opening with the wrong key deriver is a bug'],
  // conditions: normal operation, which may reach the user
  ["vault_locked",        "condition", 'a locked vault asks for the passphrase'],
  ["wrong_passphrase",    "condition", 'a mistyped passphrase asks again'],
  ["absent_box",          "condition", 'a lockbox erased elsewhere is a fact of syncing'],
  ["absent_vault",        "condition", 'a vault never made is made by the first unlock'],
  ["whisper_too_large",   "condition", "an oversized whisper is the user's value, not the code"],
  ["vault_full",          "condition", 'a full vault tells the user to erase a lockbox'],
  ["corrupt_record",      "condition", 'a damaged record is told to the user, not thrown at the developer'],
  ["stale_write",         "condition", 'another device writing first is a fact of syncing'],
  ["not_permitted",       "condition", 'a signed-out user signs in again'],
  ["storage_unavailable", "condition", 'unreachable storage is tried again shortly'],
] as const

describe("each kind's family", () => {
  it("covers every kind in the cases below", () => {
    expect(FamilyCases.map(([kind]) => kind)).to.have.members([...VaultErrorKindVals])
  })

  for (const [kind, family, blurb] of FamilyCases) {
    it(blurb, () => { expect(VaultErrorFamilyForKind[kind]).to.eq(family) })
  }
})

const ConditionCases = [
  [new VaultError('storage_unavailable', 'The vault storage could not be reached.'), true,  'a condition VaultError'],
  [new VaultError('not_permitted', 'Sign in to reach this vault.'),                  true,  'a signed-out refusal'],
  [new VaultError('bad_label', 'A label is 2-40 lowercase letters.'),                false, 'a misuse VaultError'],
  [new VaultError('vault_closed', 'This vault handle was closed.'),                  false, 'a closed handle, misuse too'],
  [new Error('storage_unavailable'),                                                false, 'a plain Error, even one whose message names a condition'],
  [{ kind: 'storage_unavailable', message: 'down' },                                false, 'an object shaped like a VaultError, but not one'],
  [null,                                                                            false, 'a thrown null'],
  [undefined,                                                                       false, 'a thrown undefined'],
  ['storage_unavailable',                                                           false, 'a thrown string'],
] as const

describe("isVaultCondition", () => {
  for (const [thrown, expected, blurb] of ConditionCases) {
    it(`is ${String(expected)} for ${blurb}`, () => { expect(isVaultCondition(thrown)).to.eq(expected) })
  }

  it("narrows to a VaultError, so the caller can read its kind and message", () => {
    const err: unknown = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    if (! isVaultCondition(err)) { throw new Error('expected a condition') }
    expect(err.kind).to.eq('storage_unavailable')
    expect(err.message).to.eq('The vault storage could not be reached.')
  })

  it("matches the @example: a condition is shown, anything else is rethrown", () => {
    const shown: string[] = []
    const handle = (err: unknown) => {
      if (! isVaultCondition(err)) { throw err }
      shown.push(err.message)
    }
    handle(new VaultError('whisper_too_large', 'That whisper is over the limit.'))
    expect(shown).to.deep.equal(['That whisper is over the limit.'])
    expect(() => { handle(new VaultError('bad_whisper', 'A whisper must be a JSON value.')) }).to.throw('A whisper must be a JSON value.')
  })
})
