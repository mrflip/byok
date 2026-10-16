import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import * as Names from '../src/names'
import { VaultError, type VaultErrorKind } from '../src/errors'
import { AnyTextValidators, DefaultValidators, Label, LockboxNote, UserId } from '../src/validators'
import * as TH from './test-helpers'

/** The VaultError `attempt` throws, checked for its kind. */
const refusalOf = (attempt: () => unknown, kind: VaultErrorKind): VaultError => {
  try {
    attempt()
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq(kind)
    return err as VaultError
  }
  throw new Error('expected a refusal, and none came')
}

/** A boxlabel check a 1Password-style host might pass: any text at all, up to 200 characters. */
const AnyBoxlabel = ZClassic.string().min(1).max(200)

describe("Names.checkValidators", () => {
  it("hands back the bag it was handed, as its first example shows", () => {
    const validators = { boxlabel: ZClassic.string().max(200) }
    expect(Names.checkValidators(validators)).to.eq(validators)
    expect(Names.checkValidators(undefined)).to.be.undefined
    expect(Names.checkValidators({ boxlabel: undefined, note: Z.string() })).to.have.property('note')
    expect(Names.checkValidators(AnyTextValidators)).to.eq(AnyTextValidators)
  })

  it("refuses a misspelt field as 'bad_option', as its second example shows, rather than keep the default unseen", () => {
    const err = refusalOf(() => Names.checkValidators({ boxLabel: ZClassic.string() } as never), 'bad_option')
    expect(err.message).to.include('spelling')
  })

  it("refuses a bag of anything but schemas, or no bag at all, as 'bad_option'", () => {
    const misfits = ['acme', 42, null, { boxlabel: 'Label' }, { boxlabel: /^[a-z]+$/ }, { userID: ZClassic.string() }]
    for (const misfit of misfits) {
      expect(refusalOf(() => Names.checkValidators(misfit as never), 'bad_option').message).to.include('validators')
    }
  })
})

describe("Names.rulesOf", () => {
  it("keeps ours for every field a host leaves out", () => {
    expect(Names.rulesOf()).to.deep.equal(DefaultValidators)
    expect(Names.rulesOf({})).to.deep.equal(DefaultValidators)
  })

  it("replaces ours outright with each field a host gives, and only that field", () => {
    const rules = Names.rulesOf({ boxlabel: AnyBoxlabel })
    expect(rules.boxlabel).to.eq(AnyBoxlabel)
    expect(rules.applabel).to.eq(Label)
    expect(rules.userId).to.eq(UserId)
    expect(rules.note).to.eq(LockboxNote)
  })

  it("refuses a misspelt field, as checkValidators does", () => {
    expect(refusalOf(() => Names.rulesOf({ boxLabel: ZClassic.string() } as never), 'bad_option').message).to.include('spelling')
  })

  it("keeps ours for a field given as undefined, as the example shows", () => {
    expect(Names.rulesOf({ boxlabel: undefined }).boxlabel).to.eq(Label)
    expect(Names.rulesOf({ boxlabel: Z.string() }).applabel).to.eq(Label)
  })
})

describe("Names.admits", () => {
  const rules = Names.rulesOf({ boxlabel: AnyBoxlabel })

  it("passes what the field's check passes: ours, or the host's", () => {
    expect(Names.admits(rules, 'applabel', 'acme')).to.be.true
    expect(Names.admits(rules, 'applabel', 'Acme Corp')).to.be.false
    expect(Names.admits(rules, 'boxlabel', 'Acme Corp: מפתח API')).to.be.true
  })

  it("refuses anything that is not text, whatever the check would make of it", () => {
    const coercing = Names.rulesOf({ boxlabel: ZClassic.coerce.string() })
    expect(Names.admits(coercing, 'boxlabel', 42)).to.be.false
    expect(Names.admits(coercing, 'boxlabel', null)).to.be.false
  })

  it("refuses an async check as misuse, rather than answering for it", () => {
    const asyncRules = Names.rulesOf({ boxlabel: ZClassic.string().refine(async () => { await TH.wakeupAtNextTick(); return true }) })
    const err = refusalOf(() => Names.admits(asyncRules, 'boxlabel', 'anthropic'), 'bad_option')
    expect(err.message).to.include('boxlabel')
  })

  it("refuses a check that throws as misuse, carrying nothing of what it threw, which may quote the candidate", () => {
    const quotingThrow = Names.rulesOf({ note: ZClassic.string().refine((note) => { throw new Error(`no note like ${note}`) }) })
    const err = refusalOf(() => Names.admits(quotingThrow, 'note', 'sk-ant-fake-pasted-by-mistake'), 'bad_option')
    expect(err.message).to.include('note')
    expect(err.cause).to.be.undefined
    expect(Object.getOwnPropertyNames(err)).to.have.members(['stack', 'message', 'name', 'kind'])
    expect(TH.thrownText(err)).to.not.include('sk-ant-fake')
    expect(TH.leafTexts(err).join(' ')).to.not.include('sk-ant-fake')
  })
})

describe("Names.check", () => {
  it("hands back exactly what it was handed, never what the check made of it", () => {
    const trimming = Names.rulesOf({ boxlabel: ZClassic.string().trim().min(1) })
    expect(Names.check(trimming, 'boxlabel', '  padded  ')).to.eq('  padded  ')
    const lowering = Names.rulesOf({ userId: ZClassic.string().toLowerCase() })
    expect(Names.check(lowering, 'userId', 'User_2FJ8')).to.eq('User_2FJ8')
  })

  it("refuses a name as bad_label, and a note as bad_option, naming the field and never the candidate", () => {
    const rules = Names.rulesOf()
    const labelErr = refusalOf(() => Names.check(rules, 'boxlabel', 'Not A Label sk-fake'), 'bad_label')
    expect(labelErr.message).to.include('boxlabel')
    expect(labelErr.message).to.not.include('sk-fake')
    const noteErr = refusalOf(() => Names.check(rules, 'note', `sk-fake ${'n'.repeat(300)}`), 'bad_option')
    expect(noteErr.message).to.include('note')
    expect(noteErr.message).to.not.include('sk-fake')
  })

  it("says what one of our own checks found wrong, quoting nothing", () => {
    const rules = Names.rulesOf()
    const cases = [
      ['boxlabel', 'sk-fake-UPPER',         'lowercase words'],
      ['boxlabel', `sk-fake${'x'.repeat(40)}`, 'at most forty characters'],
      ['userId',   '',                      "can't be empty"],
      ['userId',   'sk-fake\u{D800}',         'lone surrogate'],
      ['note',     'sk-fake\u{7}',         'no control characters but tab and newline'],
      ['note',     'sk-fake\u{DD11}',         'well-formed Unicode'],
    ] as const
    for (const [field, candidate, said] of cases) {
      const err = refusalOf(() => Names.check(rules, field, candidate), field === 'note' ? 'bad_option' : 'bad_label')
      expect(err.message).to.include(`vault's ${field} check`)
      expect(err.message).to.include(said)
      expect(err.message).to.not.include('sk-fake')
    }
    const anyText = Names.rulesOf(AnyTextValidators)
    expect(refusalOf(() => Names.check(anyText, 'boxlabel', 'key \u{D83D}'), 'bad_label').message).to.include('lone surrogate')
  })

  it("names a host check that refuses, and that the check is the host's, saying nothing of why", () => {
    const rules = Names.rulesOf({ boxlabel: ZClassic.string().max(5, 'too long for our forms') })
    const err = refusalOf(() => Names.check(rules, 'boxlabel', 'sk-fake-long'), 'bad_label')
    expect(err.message).to.include("boxlabel check passed in openVault's validators")
    expect(err.message).to.not.include('too long for our forms')
  })

  it("refuses a candidate that is not text, saying so", () => {
    expect(refusalOf(() => Names.check(Names.rulesOf(), 'boxlabel', undefined), 'bad_label').message).to.include('not text')
    expect(refusalOf(() => Names.check(Names.rulesOf(), 'note', 42), 'bad_option').message).to.include('not text')
  })

  it("never quotes a host check's own issues, which may quote the candidate", () => {
    const quoting = Names.rulesOf({ userId: ZClassic.string().refine(() => false, { error: (issue) => `refused ${String(issue.input)}` }) })
    const err = refusalOf(() => Names.check(quoting, 'userId', 'alice@example.com'), 'bad_label')
    expect(TH.thrownText(err)).to.not.include('alice')
  })
})

describe("Names.checkScope", () => {
  it("passes a scope whose names pass their checks, as handed in", () => {
    const scope = { applabel: 'Acme', user_id: 'user|2fJ8:google', vaultlabel: 'Главный' }
    const rules = Names.rulesOf({ applabel: ZClassic.string(), vaultlabel: ZClassic.string() })
    expect(Names.checkScope(rules, scope)).to.deep.equal(scope)
  })

  it("refuses, as bad_label, a scope with a name its check refuses, or one that is not text", () => {
    const rules = Names.rulesOf()
    expect(refusalOf(() => Names.checkScope(rules, { ...TH.scopeOf('u1'), applabel: 'Acme' }), 'bad_label').message).to.include('applabel')
    expect(refusalOf(() => Names.checkScope(rules, TH.scopeOf('')), 'bad_label').message).to.include('userId')
    expect(refusalOf(() => Names.checkScope(rules, { ...TH.scopeOf('u1'), vaultlabel: 42 }), 'bad_label').message).to.include('vault scope')
    expect(refusalOf(() => Names.checkScope(rules, null), 'bad_label').message).to.include('vault scope')
  })
})
