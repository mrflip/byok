import * as Z from 'zod/mini'
import { VaultError } from './errors'
import * as Sanitizer from './sanitizer'
import { VaultScope } from './types'
import { AnyTextValidators, DefaultValidators, type NameValidator, type VaultValidators } from './validators'

/**
 * The one place a name or a note meets its check: the vault's own calls and every VaultDB verb
 * go through here, with the host's validators where it gave them and ours where not. A check
 * decides pass or fail and nothing more: what passes is kept exactly as handed in.
 */

/** Which check: one of the fields of {@link VaultValidators}. */
export type NameField = keyof VaultValidators

/** A check for every field: the host's where it gave one, ours where not. */
export type NameRules = Readonly<Record<NameField, NameValidator>>

/** A schema a host may hand in `validators`: a Zod 4 schema, classic or mini, which carries `_zod`. */
const nameValidator = Z.optional(Z.custom<NameValidator>((candidate: unknown) => typeof candidate === 'object' && candidate !== null && '_zod' in candidate))

/** What `validators` may hold: a schema or undefined for each field it knows, and no other field. */
const validatorsShape = Z.optional(Z.strictObject({
  applabel:   nameValidator,
  vaultlabel: nameValidator,
  boxlabel:   nameValidator,
  userId:     nameValidator,
  note:       nameValidator,
}))

/**
 * A host's `validators` bag, exactly as handed in, once its shape passes: each field one of
 * applabel, vaultlabel, boxlabel, userId and note, and each a Zod schema or undefined. Kind
 * 'bad_option' otherwise, so a misspelt field (`boxLabel`) is refused rather than leaving the
 * default check quietly in its place. Only the shape is checked: the schemas are the host's.
 * openVault runs it on its `validators` option; a binding or wrapper that takes the bag apart
 * runs it first, once, on the bag it was handed.
 *
 * @example checkValidators({ boxlabel: z.string().max(200) })  // the same bag
 * @example checkValidators({ boxLabel: z.string() })           // throws: bad_option
 */
export const checkValidators = (validators: VaultValidators | undefined): VaultValidators | undefined => {
  if (! validatorsShape.safeParse(validators).success) {
    throw new VaultError('bad_option', 'validators is a bag of Zod schemas, each checking one of applabel, vaultlabel, boxlabel, userId and note: leave out any field to keep its default check, and check the spelling of each one given.')
  }
  return validators
}

/**
 * The checks a vault runs, from a host's `validators`: each field it gives replaces ours, and
 * each it leaves out (or passes as undefined) keeps ours. A bag of another shape is refused, as
 * {@link checkValidators} refuses it.
 *
 * @example rulesOf({ boxlabel: z.string().max(200) }).applabel === Label  // true
 */
export const rulesOf = (validators: VaultValidators = {}): NameRules => {
  checkValidators(validators)
  return {
    applabel:   validators.applabel ?? DefaultValidators.applabel,
    vaultlabel: validators.vaultlabel ?? DefaultValidators.vaultlabel,
    boxlabel:   validators.boxlabel ?? DefaultValidators.boxlabel,
    userId:     validators.userId ?? DefaultValidators.userId,
    note:       validators.note ?? DefaultValidators.note,
  }
}

/**
 * True when `candidate` is text that passes the `field` check. A check that throws rather than
 * answering -- an async one, or a host's own bug -- is misuse: kind 'bad_option', carrying nothing
 * of what it threw, which may quote the candidate.
 */
export const admits = (rules: NameRules, field: NameField, candidate: unknown): candidate is string => (
  typeof candidate === 'string' && verdictOf(rules, field, candidate).success
)

/**
 * `candidate`, exactly as handed in, once it passes the `field` check: kind 'bad_label' when it
 * does not ('bad_option' for a note). The refusal names the field, never the candidate, and says
 * what one of safebyok's own checks found wrong; a host's check it names only.
 */
export const check = (rules: NameRules, field: NameField, candidate: unknown): string => {
  if (typeof candidate !== 'string') {
    throw new VaultError(kindFor(field), `That ${field} is missing, or is not text.`)
  }
  const verdict = verdictOf(rules, field, candidate)
  if (verdict.success) { return candidate }
  // Our own checks' messages quote nothing, so they may say just what was wrong; a host's may
  // quote the candidate, so its refusal is never passed on.
  const said = OurChecks.has(rules[field]) ? verdict.error.issues[0]?.message : undefined
  if (said === undefined) {
    throw new VaultError(kindFor(field), `That ${field} does not pass the ${field} check passed in openVault's validators.`)
  }
  throw new VaultError(kindFor(field), `That ${field} does not pass the vault's ${field} check. ${said}.`)
}

/** `scope`, once its three names pass their checks: kind 'bad_label' otherwise. */
export const checkScope = (rules: NameRules, scope: unknown): VaultScope => {
  const checked = VaultScope.safeParse(scope)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A vault scope is an applabel, a user_id and a vaultlabel, each text that passes its check.')
  }
  check(rules, 'applabel', checked.data.applabel)
  check(rules, 'userId', checked.data.user_id)
  check(rules, 'vaultlabel', checked.data.vaultlabel)
  return checked.data
}

/** The `field` check's verdict on `candidate`. A check that throws rather than answering is misuse. */
const verdictOf = (rules: NameRules, field: NameField, candidate: string) => {
  try {
    return Z.safeParse(rules[field], candidate)
  } catch (err) {
    throw Sanitizer.refusalFor(err, 'bad_option', `The ${field} check in openVault's validators threw rather than answering: each must be a Zod schema that checks synchronously, and returns its refusals rather than throwing them.`)
  }
}

/** safebyok's own checks, whose refusals quote nothing and so may be passed on. */
const OurChecks: ReadonlySet<NameValidator> = new Set([...Object.values(DefaultValidators), ...Object.values(AnyTextValidators)])

const kindFor = (field: NameField) => (field === 'note' ? 'bad_option' : 'bad_label')
