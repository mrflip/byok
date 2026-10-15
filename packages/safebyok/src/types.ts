import * as Z from 'zod/mini'
import { Ciphered } from './crypto'

/**
 * The JSON a whisper is made of. `null` is legal here -- inside an array or object -- because
 * real JSON payloads carry it; see {@link Whisper} for why a whisper can't be null as a whole.
 */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/**
 * The secret kept in a lockbox: a JSON value -- a string, number, boolean, array or plain object.
 * Two shapes are refused rather than silently mangled:
 *  * `undefined`, anywhere in the value: JSON cannot carry it.
 *  * a bare `null` as the whole whisper: nobody's secret is "nothing here", and emptying a
 *    lockbox is `erase`'s job. (`null` inside a structure is fine: {@link WhisperJson}.)
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/**
 * True for a plain key-value object: one built by a literal or Object.create(null), nothing with
 * its own prototype (a Date, a Map) that JSON would silently flatten.
 */
const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

const whisperJson: Z.ZodMiniType<WhisperJson> = Z.lazy(() => Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  Z.null(),
  whisperArr,
  whisperBag,
]))
const whisperRecord = Z.record(Z.string(), whisperJson)
const whisperBag = Z.pipe(Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object'), whisperRecord)
const whisperArr = Z.array(whisperJson)

/**
 * Validator for a {@link Whisper}: accepts exactly what JSON can carry, refuses what JSON would
 * mangle (undefined, functions, class instances such as Date or Map), and refuses a bare null.
 *
 * @example Whisper.parse('sk-ant-...')                  // a string passes through
 * @example Whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example Whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example Whisper.safeParse(null).success              // false: emptying a lockbox is erase's job
 * @example Whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const Whisper: Z.ZodMiniType<Whisper> = Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  whisperArr,
  whisperBag,
])

/**
 * A freely chosen identifier (STYLE.md tag glossary): lowercase words of letters and digits
 * joined by single underscores, starting with a letter, two to forty characters. Shared by every
 * label in the package: `applabel`, `vaultlabel`, `boxlabel`. (A scope's `user_id` is the host's
 * auth identity, deliberately not a Label.)
 *
 * @example Label.parse('anthropic_api_key')
 * @example Label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 * @example Label.safeParse('_nope').success              // false
 */
export const Label = Z.string().check(
  Z.maxLength(40, "A label is at most forty characters"),
  Z.regex(/^[a-z](_?[a-z0-9])+$/, "A label is lowercase words of letters and digits joined by single underscores, starting with a letter"),
)

/**
 * The latest instant the package accepts, in epoch ms: the microsecond epochalypse, the last
 * millisecond whose epoch *microseconds* still fit a safe integer, 2255-06-05T23:47:34.740Z. No
 * time the vault keeps lies past it, and a stored record holding a later one fails validation;
 * see {@link EpochMillis}.
 *
 * `askPassphraseAt` equals it when the vault never asks for the passphrase again on this device
 * until `lock()`: `forcePassphraseReentryHours: Infinity`, or a window so large its deadline
 * would pass it. A host compares against it to show "until locked" rather than a date in 2255.
 *
 * @example askPassphraseAt === FarFuture ? 'until locked'
 *     : new Date(askPassphraseAt).toLocaleString()
 * @example new Date(FarFuture).toISOString()   // '2255-06-05T23:47:34.740Z'
 */
export const FarFuture = 9_007_199_254_740 // Math.floor(Number.MAX_SAFE_INTEGER / 1000)

/**
 * The earliest instant the package accepts, in epoch ms: 1981-01-01T00:00:00Z. A stored
 * record holding an earlier time fails validation; see {@link EpochMillis}.
 *
 * @example new Date(FarPast).toISOString()   // '1981-01-01T00:00:00.000Z'
 */
export const FarPast = 347_155_200_000 // Date.UTC(1981, 0, 1)

/**
 * Validator for an instant as whole UTC epoch milliseconds, from {@link FarPast} (1981) to
 * {@link FarFuture} (2255), both included. Every time the package keeps is one -- a lockbox's
 * `registered_at` and `changed_at`, a vault bundle's `registered_at`, a remembered unlock's
 * `ask_passphrase_at` -- and a stored record holding anything else fails validation. A host can
 * check its own times with it.
 *
 * The bounds catch a unit mistake either way: epoch *seconds* read as milliseconds land in
 * January 1970, below the floor; epoch *microseconds* read as milliseconds land tens of thousands
 * of years out, above the ceiling. `Infinity` and `NaN` never pass. (The host's {@link Clock} may
 * return a fraction of a millisecond; the vault rounds each reading down before keeping it.)
 *
 * @example EpochMillis.parse(Date.UTC(2026, 9, 15))                // 1792022400000
 * @example EpochMillis.safeParse(1_792_022_400).success            // false: seconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000_000).success    // false: microseconds, not ms
 * @example EpochMillis.safeParse(1_792_022_400_000.5).success
 *     // false: whole milliseconds only
 * @example EpochMillis.safeParse(Infinity).success                 // false: never a time
 */
export const EpochMillis = Z.number().check(
  Z.gte(FarPast, "An instant is epoch milliseconds no earlier than 1981; a smaller number is likely epoch seconds"),
  Z.lte(FarFuture, "An instant is epoch milliseconds no later than 2255; a larger number is likely epoch microseconds"),
  Z.int("An instant is whole epoch milliseconds"),
)

/**
 * What names one vault: the host application's label, the authenticated user, and the vault's own
 * label. Two users may each have a vault labelled `main` without collision; so may two apps
 * sharing a backend.
 */
export const VaultScope = Z.object({
  applabel:   Label,
  user_id:    Z.string().check(Z.minLength(1)),
  vaultlabel: Label,
})
export type VaultScope = Z.infer<typeof VaultScope>

/** A WebCrypto key handle, as a record holds one. Never bytes: a handle, and nothing but. */
const cryptoKeyHandle = Z.custom<CryptoKey>((val) => val instanceof CryptoKey, 'a CryptoKey handle')

/**
 * A lockbox's public note, shown beside it while the vault is locked: text of at most 256
 * characters. Never put secret material here. A host's form can check a note with it before
 * `store()`, which refuses one that fails with kind 'bad_option'.
 *
 * @example LockboxNote.parse('work account')
 * @example LockboxNote.safeParse('n'.repeat(257)).success  // false: 256 characters at most
 */
export const LockboxNote = Z.string().check(Z.maxLength(256))

/**
 * One lockbox as the storage layer holds it: the whisper ciphered under its own lockboxKey, that
 * lockboxKey wrapped under the vaultKey, and the public shell -- boxlabel, note, the times it
 * was first stored and last changed -- a locked vault may show. Nothing in this record opens
 * without the vaultKey.
 *
 * `revision_id` is minted fresh on every write and bound into both encryptions, so ciphertext
 * moved between revisions (or boxes, or vaults) refuses to open.
 *
 * Stored fields are underbar_case: this record is written to the storage layer as-is, and it is
 * plain JSON -- any backend that can hold text can hold it.
 */
export const Lockbox = Z.object({
  format:              Z.literal('safebyok-lockbox-v1'),
  boxlabel:            Label,
  revision_id:         Z.string().check(Z.minLength(1)),
  /** This lockbox's lockboxKey, wrapped under the vaultKey. */
  lockbox_key_wrapped: Ciphered,
  /** The whisper, ciphered under this lockbox's lockboxKey. */
  whisper_ciphered:    Ciphered,
  /**
   * The lockbox's {@link LockboxNote}. Written only when there is one; read as absent when
   * undefined too, as earlier versions stored it and IndexedDB keeps it.
   */
  note:                Z.optional(LockboxNote),
  /**
   * When this boxlabel was first stored, an {@link EpochMillis}: every later store carries it
   * forward.
   */
  registered_at:       EpochMillis,
  /**
   * When the whisper last changed, an {@link EpochMillis}: a store whose whisper serializes the
   * same as the one it replaces writes a new revision and leaves this standing.
   */
  changed_at:          EpochMillis,
})
export type Lockbox = Z.infer<typeof Lockbox>

/**
 * The public face of a lockbox: everything but its two encrypted fields, with `note` null when
 * the lockbox has none -- never absent, never undefined, however the record was stored. This is
 * what a VaultDB's `listBoxes` returns and a vault's snapshot holds, readable while locked.
 *
 * @example LockboxSummary.parse({ boxlabel: 'anthropic', revision_id: 'r1', registered_at,
 *     changed_at }).note  // null
 */
export const LockboxSummary = Z.extend(
  Z.omit(Lockbox, { format: true, lockbox_key_wrapped: true, whisper_ciphered: true }),
  { note: Z._default(Z.nullable(LockboxNote), null) },
)
export type LockboxSummary = Z.infer<typeof LockboxSummary>

/**
 * The per-vault record the storage layer holds so any device can unlock the vault: the
 * passphraseSalt, the keyDeriverLabel saying how the passphraseKey is made, and the vaultKey
 * wrapped under that passphraseKey. All of it is safe in the open; none of it opens without
 * the passphrase.
 *
 * `passphrase_epoch` goes up by one on every passphrase change, so other devices and remembered
 * unlocks know to ask again.
 */
export const VaultBundle = Z.object({
  format:              Z.literal('safebyok-vault-v1'),
  applabel:            Label,
  user_id:             Z.string().check(Z.minLength(1)),
  vaultlabel:          Label,
  /** Random id minted when the vault is made, and never changed; bound into every encryption. */
  vault_id:            Z.string().check(Z.minLength(1)),
  passphrase_epoch:    Z.int().check(Z.positive()),
  /**
   * Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, as stored vaults self-describe.
   */
  key_deriver_label:   Z.string().check(Z.minLength(1)),
  passphrase_salt_b64: Z.string().check(Z.minLength(1)),
  /** The vaultKey, wrapped under the passphraseKey: decrypting this IS the passphrase check. */
  vault_key_passphrase_wrapped: Ciphered,
  /** When the vault was made, an {@link EpochMillis}; never changed. */
  registered_at:       EpochMillis,
})
export type VaultBundle = Z.infer<typeof VaultBundle>

/**
 * The device-local record of a remembered unlock: this browser's localUnlockKey (a
 * non-extractable handle -- it cannot leave the device even through the code that made it) and
 * the vaultKey wrapped under it. Held only by structured-clone storage (IndexedDB) or memory;
 * it has no JSON form, and nothing in it ever goes to the backend.
 */
export const DeviceUnlock = Z.object({
  format:           Z.literal('safebyok-unlock-v1'),
  applabel:         Label,
  user_id:          Z.string().check(Z.minLength(1)),
  vaultlabel:       Label,
  vault_id:         Z.string().check(Z.minLength(1)),
  /** The bundle's passphrase_epoch when this unlock was remembered; a mismatch voids it. */
  passphrase_epoch: Z.int().check(Z.positive()),
  /** This browser's localUnlockKey: non-extractable, usable only to unwrap what it wrapped. */
  local_unlock_key: cryptoKeyHandle,
  /** The vaultKey, wrapped under the localUnlockKey. */
  vault_key_local_wrapped: Ciphered,
  /**
   * The instant from which the remembered unlock no longer counts, and the vault asks for the
   * passphrase: an {@link EpochMillis}.
   */
  ask_passphrase_at: EpochMillis,
})
export type DeviceUnlock = Z.infer<typeof DeviceUnlock>

/**
 * How many hours an entered passphrase lasts on the device before the vault asks for it again,
 * unless the caller says otherwise: seven days.
 */
export const ForcePassphraseReentryHours = 168 // seven days

/**
 * The largest whisper a vault stores unless the caller says otherwise, in bytes of its JSON:
 * several times the beefiest credential (an RSA-8192 private key as PEM is about 6.4 KB), and
 * well inside what every storage backend can hold. A larger whisper is usually a sign that the
 * wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/**
 * The most lockboxes a vault holds unless the caller says otherwise: room for every API key a
 * person plausibly keeps, at the largest default whisper, inside what every in-tree storage
 * adapter can hold and still erase in one go. A vault that needs more raises its `maxLockboxes`.
 */
export const MaxLockboxes = 100

/**
 * Injected time source, so expiry is testable; defaults to the wall clock. `now()` returns epoch
 * milliseconds, as `Date.now()` does, from {@link FarPast} to {@link FarFuture}; a fraction is
 * fine, and rounded down. The vault checks every reading, and refuses a clock that reads outside
 * those bounds -- counting in seconds or microseconds, say -- or throws, with kind 'bad_option':
 * at `openVault`, and at any later call that reads it so, which drops the vaultKey first.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
