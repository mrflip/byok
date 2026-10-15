import * as Z from 'zod'
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

/** True for a plain key-value object: one built by a literal or Object.create(null), nothing with its own prototype (a Date, a Map) that JSON would silently flatten. */
const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

const whisperJson: Z.ZodType<WhisperJson> = Z.lazy(() => Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  Z.null(),
  whisperArr,
  whisperBag,
]))
const whisperRecord = Z.record(Z.string(), whisperJson)
const whisperBag = Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object').pipe(whisperRecord)
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
export const Whisper: Z.ZodType<Whisper> = Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  whisperArr,
  whisperBag,
])

/**
 * A freely chosen identifier (STYLE.md tag glossary): lowercase words of letters and digits
 * joined by single underscores, starting with a letter, two to forty characters. Shared by every
 * label in the package: `applabel`, `vaultlabel`, `boxlabel`, `userlabel`.
 *
 * @example Label.parse('anthropic_api_key')
 * @example Label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 * @example Label.safeParse('_nope').success              // false
 */
export const Label = Z.string()
  .max(40, "A label is at most forty characters")
  .regex(/^[a-z](_?[a-z0-9])+$/, "A label is lowercase words of letters and digits joined by single underscores, starting with a letter")

/**
 * What names one vault: the host application's label, the authenticated user, and the vault's own
 * label. Two users may each have a vault labelled `main` without collision; so may two apps
 * sharing a backend.
 */
export const VaultScope = Z.object({
  applabel:   Label,
  user_id:    Z.string().min(1),
  vaultlabel: Label,
})
export type VaultScope = Z.infer<typeof VaultScope>

/** A WebCrypto key handle, as a record holds one. Never bytes: a handle, and nothing but. */
const cryptoKeyHandle = Z.custom<CryptoKey>((val) => val instanceof CryptoKey, 'a CryptoKey handle')

/**
 * One lockbox as the storage layer holds it: the whisper ciphered under its own lockboxKey, that
 * lockboxKey wrapped under the vaultKey, and the public shell -- boxlabel, note, timestamps --
 * a locked vault may show. Nothing in this record opens without the vaultKey.
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
  revision_id:         Z.string().min(1),
  /** This lockbox's lockboxKey, wrapped under the vaultKey. */
  lockbox_key_wrapped: Ciphered,
  /** The whisper, ciphered under this lockbox's lockboxKey. */
  whisper_ciphered:    Ciphered,
  /**
   * Public note shown beside the lockbox while locked. Never put secret material here. Written
   * only when there is one; read as absent when undefined too, as earlier versions stored it and
   * IndexedDB keeps it.
   */
  note:                Z.string().max(256).optional(),
  created_at:          Z.string(),
  updated_at:          Z.string(),
})
export type Lockbox = Z.infer<typeof Lockbox>

/**
 * The public face of a lockbox: everything but its two encrypted fields. This is what `list()`
 * returns and what a locked vault may show.
 */
export const LockboxSummary = Lockbox.omit({ format: true, lockbox_key_wrapped: true, whisper_ciphered: true })
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
  user_id:             Z.string().min(1),
  vaultlabel:          Label,
  /** Random id minted when the vault is made, and never changed; bound into every encryption. */
  vault_id:            Z.string().min(1),
  passphrase_epoch:    Z.number().int().positive(),
  /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, as stored vaults self-describe. */
  key_deriver_label:   Z.string().min(1),
  passphrase_salt_b64: Z.string().min(1),
  /** The vaultKey, wrapped under the passphraseKey: decrypting this IS the passphrase check. */
  vault_key_passphrase_wrapped: Ciphered,
  created_at:          Z.string(),
  updated_at:          Z.string(),
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
  user_id:          Z.string().min(1),
  vaultlabel:       Label,
  vault_id:         Z.string().min(1),
  /** The bundle's passphrase_epoch when this unlock was remembered; a mismatch voids it. */
  passphrase_epoch: Z.number().int().positive(),
  /** This browser's localUnlockKey: non-extractable, usable only to unwrap what it wrapped. */
  local_unlock_key: cryptoKeyHandle,
  /** The vaultKey, wrapped under the localUnlockKey. */
  vault_key_local_wrapped: Ciphered,
  /** Epoch milliseconds after which the remembered unlock no longer counts. */
  expires_at:       Z.number(),
})
export type DeviceUnlock = Z.infer<typeof DeviceUnlock>

/** How long an entered passphrase is remembered on the device, unless the caller says otherwise. */
export const SevenDaysMs = 7 * 24 * 60 * 60 * 1000

/**
 * The largest whisper a vault stores unless the caller says otherwise, in bytes of its JSON:
 * several times the beefiest credential (an RSA-8192 private key as PEM is about 6.4 KB), and
 * well inside what every storage backend can hold. A larger whisper is usually a sign that the
 * wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/** Injected time source, so expiry is testable; defaults to the wall clock. */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
