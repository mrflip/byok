import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import * as Names from '../src/names'
import { VaultError, type VaultErrorKind } from '../src/errors'
import { DefaultValidators, Label, LockboxNote, UserId } from '../src/validators'
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

  it("refuses a check that throws as misuse, with the host's own error as the cause", () => {
    const hostTrouble = new Error('the host check fell over')
    const throwing = Names.rulesOf({ note: ZClassic.string().refine(() => { throw hostTrouble }) })
    const err = refusalOf(() => Names.admits(throwing, 'note', 'work account'), 'bad_option')
    expect(err.cause).to.eq(hostTrouble)
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
