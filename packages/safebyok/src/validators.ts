import * as Z from 'zod/mini'

/**
 * The checks safebyok runs on every name and note, and the bounds behind its defaults, in an entry
 * point of their own: `import { Label, DefaultValidators } from 'safebyok/validators'`. A form, a
 * server, or a library of its own can check a name as the vault will before calling it. Each is
 * exported from the main entry too.
 *
 * Every default is replaceable: a host passes its own schema for any field in openVault's
 * `validators` ({@link VaultValidators}), and it replaces ours outright.
 */

/** The most characters a default {@link Label} holds. */
export const MaxLabelChars = 40

/**
 * The pattern a default {@link Label} matches: lowercase words of letters and digits joined by
 * single underscores, starting with a letter, two characters at least. Its `source` suits an
 * HTML input's `pattern` attribute.
 *
 * @example <input pattern={LabelPattern.source} maxLength={MaxLabelChars} />
 */
export const LabelPattern = /^[a-z](_?[a-z0-9])+$/

/**
 * The default check for every label in the package: `applabel`, `vaultlabel` and `boxlabel`.
 * Lowercase words of letters and digits joined by single underscores, starting with a letter,
 * two to forty characters (STYLE.md's tag glossary). A host that wants other labels passes its own
 * schema in openVault's `validators`. (A scope's `user_id` is the host's auth identity,
 * deliberately not a Label: see {@link UserId}.)
 *
 * @example Label.parse('anthropic_api_key')
 * @example Label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 * @example Label.safeParse('_nope').success              // false
 */
export const Label = Z.string().check(
  Z.maxLength(MaxLabelChars, "A label is at most forty characters"),
  Z.regex(LabelPattern, "A label is lowercase words of letters and digits joined by single underscores, starting with a letter"),
)

/**
 * Well-formed Unicode: no surrogate standing alone, half of a character such as an emoji, as text
 * cut off mid-character has. Such text has no UTF-8 form, and Convex requires valid Unicode. Under
 * the `u` flag a surrogate pair reads as the one character it encodes, so `\p{Cs}` (the Unicode
 * category of surrogates) finds only a lone one. It searches for one rather than matching the
 * whole text, which on text of millions of characters would overflow the regex engine's stack.
 */
const WellFormed = Z.refine<string>((text) => ! /\p{Cs}/u.test(text), "Text must be well-formed Unicode, and this holds a lone surrogate: half of a character such as an emoji, as text cut off mid-character does")

/** The most characters a default {@link UserId} holds (UTF-16 code units, as JavaScript counts them). */
export const MaxUserIdChars = 100

/**
 * The default check for a scope's `user_id`: the signed-in user's id from the host's own auth,
 * well-formed text of 1 to {@link MaxUserIdChars} (100) characters. Not a {@link Label}: it takes
 * whatever form the host's auth issues, colons and capitals and all, and is bounded only in length.
 * `openVault` refuses a `userId` that fails it with kind 'bad_label'; a host whose ids look
 * otherwise passes its own schema as `validators.userId`.
 *
 * @example UserId.parse('user|2fJ8:google')
 * @example UserId.safeParse('').success                // false: an empty id names no one
 * @example UserId.safeParse('u'.repeat(101)).success   // false: 100 characters at most
 * @example UserId.safeParse('u\uD800').success          // false: half of a character
 */
export const UserId = Z.string().check(
  Z.minLength(1, "A user_id names the signed-in user, so it can't be empty"),
  Z.maxLength(MaxUserIdChars, `A user_id is at most ${String(MaxUserIdChars)} characters`),
  WellFormed,
)

/** The most characters a default {@link LockboxNote} holds (UTF-16 code units). */
export const MaxNoteChars = 256

/**
 * A note's characters: any but the control characters (Unicode's `Cc`: C0, DEL and C1), save tab
 * and newline. Carriage return is refused with the rest; a browser's textarea hands up newlines alone.
 * It searches for a control character that is neither tab nor newline, rather than matching the
 * whole note, so that an overlong note is refused for its length and never overflows the regex stack.
 */
const NoteChars = Z.refine<string>((note) => ! /(?![\t\n])\p{Cc}/u.test(note), "A note holds no control characters but tab and newline")

/**
 * The default check for a lockbox's public note, shown beside it while the vault is locked:
 * well-formed text of at most {@link MaxNoteChars} (256) characters, with no control characters
 * but tab and newline. Never put secret material in a note. `store()` refuses a note that fails
 * the vault's note check with kind 'bad_option'; a host that wants longer notes, or other
 * characters, passes its own schema as `validators.note`.
 *
 * @example LockboxNote.parse('work account')
 * @example LockboxNote.parse('work account\nrotated in March')
 * @example LockboxNote.safeParse('n'.repeat(257)).success  // false: 256 characters at most
 * @example LockboxNote.safeParse('beep\u0007').success      // false: a control character
 */
export const LockboxNote = Z.string().check(
  Z.maxLength(MaxNoteChars, `A note is at most ${String(MaxNoteChars)} characters`),
  NoteChars,
  WellFormed,
)

/**
 * A schema a host hands the vault in place of one of ours: any Zod 4 schema whose output is
 * text, classic (`zod`) or mini (`zod/mini`). It must check synchronously.
 */
export type NameValidator = Z.core.$ZodType<string>

/**
 * The checks a vault runs on every name and note, as openVault's `validators` option: each field
 * a host gives **replaces** ours outright, and each it leaves out keeps ours
 * ({@link DefaultValidators}). Build the bag once, at module level, not anew on each call or render.
 *
 * Each runs as a check and nothing more: the vault keeps what it was handed, never what the schema
 * makes of it, as every name is bound into the ciphertext and names its rows. A schema that trims
 * or lowercases still decides only pass or fail. A refusal is the vault's own (kind 'bad_label',
 * 'bad_option' for a note), and never quotes the schema's issues, which may quote the name.
 *
 * The vault checks with them everywhere a name passes: at openVault for the scope; at store,
 * read, use and erase for the boxlabel; at store for the note; and on every record read back. So
 * a host that narrows a check later finds a lockbox stored under a name or note the new one
 * refuses listed as damaged: `read()` refuses it, `erase()` still reaches it by the name it was
 * stored under, and `store()` writes over it only where the name passes.
 *
 * @example
 *   import * as z from 'zod'
 *   // Labels in any script, up to 200 characters, and Clerk's user ids.
 *   const validators: VaultValidators = {
 *     boxlabel: z.string().min(1).max(200),
 *     userId:   z.string().regex(/^user_[A-Za-z0-9]{27}$/),
 *   }
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, validators, ...browserOpts() })
 */
export type VaultValidators = {
  /** Checks the host application's label. Default: {@link Label}. */
  applabel?:   NameValidator | undefined
  /** Checks the vault's label. Default: {@link Label}. */
  vaultlabel?: NameValidator | undefined
  /** Checks each lockbox's label. Default: {@link Label}. */
  boxlabel?:   NameValidator | undefined
  /** Checks the signed-in user's id. Default: {@link UserId}. */
  userId?:     NameValidator | undefined
  /** Checks each lockbox's public note. Default: {@link LockboxNote}. */
  note?:       NameValidator | undefined
}

/**
 * The checks a vault runs when its host passes none: {@link Label} for each label,
 * {@link UserId} for the user, {@link LockboxNote} for a note. Frozen.
 *
 * @example DefaultValidators.boxlabel.safeParse('anthropic_api_key').success  // true
 */
export const DefaultValidators = Object.freeze({
  applabel:   Label,
  vaultlabel: Label,
  boxlabel:   Label,
  userId:     UserId,
  note:       LockboxNote,
})

/** A check for any well-formed text: each of {@link AnyTextValidators} is one of its own. */
const anyText = () => Z.string().check(WellFormed)

/**
 * Checks that admit any well-formed text in every field: what a host keeping labels and notes in
 * any script, of any length, may pass whole, or start from. Text holding a lone surrogate, half of
 * a character, is refused, as storage such as Convex's refuses it too. A VaultDB's public verbs
 * check with these when handed no validators. Frozen. Text of any kind reaches the host's UI as a
 * name: one that shows labels from others should mind what bidirectional, invisible and control
 * characters can make a label look like.
 *
 * @example openVault({ ...opts, validators: AnyTextValidators })
 * @example openVault({ ...opts, validators: { ...AnyTextValidators, userId: UserId } })
 * @example AnyTextValidators.boxlabel.safeParse('Work: מפתח API').success  // true
 * @example AnyTextValidators.boxlabel.safeParse('key \uD83D').success      // false: half of an emoji
 */
export const AnyTextValidators = Object.freeze({
  applabel:   anyText(),
  vaultlabel: anyText(),
  boxlabel:   anyText(),
  userId:     anyText(),
  note:       anyText(),
})
