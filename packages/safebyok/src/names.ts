import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { VaultScope } from './types'
import { DefaultValidators, MaxLabelChars, MaxNoteChars, MaxUserIdChars, type NameValidator, type VaultValidators } from './validators'

/**
 * The one place a name or a note meets its check: the vault's own calls and every VaultDB verb
 * go through here, with the host's validators where it gave them and ours where not. A check
 * decides pass or fail and nothing more: what passes is kept exactly as handed in.
 */

/** Which check: one of the fields of {@link VaultValidators}. */
export type NameField = keyof VaultValidators

/** A check for every field: the host's where it gave one, ours where not. */
export type NameRules = Readonly<Record<NameField, NameValidator>>

/**
 * The checks a vault runs, from a host's `validators`: each field it gives replaces ours, and
 * each it leaves out (or passes as undefined) keeps ours.
 *
 * @example rulesOf({ boxlabel: z.string().max(200) }).applabel === Label  // true
 */
export const rulesOf = (validators: VaultValidators = {}): NameRules => ({
  applabel:   validators.applabel ?? DefaultValidators.applabel,
  vaultlabel: validators.vaultlabel ?? DefaultValidators.vaultlabel,
  boxlabel:   validators.boxlabel ?? DefaultValidators.boxlabel,
  userId:     validators.userId ?? DefaultValidators.userId,
  note:       validators.note ?? DefaultValidators.note,
})

/**
 * True when `candidate` is text that passes the `field` check. A check that throws rather than
 * answering -- an async one, or a host's own bug -- is misuse: kind 'bad_option'.
 */
export const admits = (rules: NameRules, field: NameField, candidate: unknown): candidate is string => {
  if (typeof candidate !== 'string') { return false }
  try {
    return Z.safeParse(rules[field], candidate).success
  } catch (err) {
    throw new VaultError('bad_option', `The ${field} check in openVault's validators threw rather than answering: each must be a Zod schema that checks synchronously. Its own error is this error's cause.`, { cause: err })
  }
}

/**
 * `candidate`, exactly as handed in, once it passes the `field` check: kind 'bad_label' when it
 * does not ('bad_option' for a note). The refusal names the field, never the candidate.
 */
export const check = (rules: NameRules, field: NameField, candidate: unknown): string => {
  if (! admits(rules, field, candidate)) { throw refusal(field) }
  return candidate
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

const LabelSaid = `2 to ${String(MaxLabelChars)} lowercase letters and digits, words joined by single underscores, starting with a letter`

/** What each default check asks, for a refusal to say. */
const DefaultSaid: Record<NameField, string> = {
  applabel:   LabelSaid,
  vaultlabel: LabelSaid,
  boxlabel:   LabelSaid,
  userId:     `the signed-in user's id from your auth, text of 1 to ${String(MaxUserIdChars)} characters`,
  note:       `text of at most ${String(MaxNoteChars)} characters, or null for none; a note is shown while the vault is locked, so never put secret material in it`,
}

const refusal = (field: NameField) => new VaultError(
  field === 'note' ? 'bad_option' : 'bad_label',
  `That ${field} does not pass the vault's ${field} check: by default ${DefaultSaid[field]}, or else the ${field} schema passed in openVault's validators.`,
)
