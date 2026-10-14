import * as Z from 'zod'

/**
 * ⚠️ STUB of the future byok package, for interface design only. Everything in src/byok/ stores
 * whispers and passphrases in PLAINTEXT so the demo's inspector can show where each piece of data
 * lives. The real package encrypts on-device and hands its storage layer ciphertext only.
 */

/**
 * The data kept secret: any JSON value -- a string, number, boolean, null, array or plain object.
 *
 * @example 'sk-ant-api03-...'
 * @example { apiToken: 'sk-ant-...', orgId: 'acme' }
 * @example null
 */
export type Whisper = string | number | boolean | null | Whisper[] | { [ckey: string]: Whisper }

/** True for a plain key-value object: one built by a literal or Object.create(null), nothing with its own prototype (a Date, a Map) that JSON would silently flatten. */
const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/**
 * Validator for a {@link Whisper}: accepts exactly what JSON can carry, and refuses what JSON
 * would mangle (undefined, functions, class instances such as Date or Map).
 *
 * @example Whisper.parse('sk-ant-...')             // a string passes through
 * @example Whisper.safeParse(new Date()).success   // false: JSON would flatten it to {}
 */
export const Whisper: Z.ZodType<Whisper> = Z.lazy(() => Z.union([
  Z.string(),
  Z.number(),
  Z.boolean(),
  Z.null(),
  Z.array(Whisper),
  Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object').pipe(Z.record(Z.string(), Whisper)),
]))

/**
 * A freely chosen identifier (STYLE.md tag glossary): word characters only, starting with a
 * letter, ending with a letter or digit, two to sixty-four characters. Shared by every label in
 * the package: `applabel`, `vaultlabel`, `boxlabel`, `userlabel`.
 *
 * @example Label.parse('ANTHROPIC_API_KEY')
 * @example Label.safeParse('-nope').success  // false
 */
export const Label = Z.string()
  .regex(/^[A-Za-z]\w{0,62}[A-Za-z0-9]$/, "A label is 2-64 word characters, starting with a letter and ending with a letter or digit")

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

/**
 * One secret and its public shell: the whisper, the label that names it, and metadata the UI may
 * show while the vault is locked. Everything here but `whisper` is public.
 *
 * Stored fields are underbar_case: this record is written to the storage layer as-is.
 */
export const Lockbox = Z.object({
  boxlabel:   Label,
  /** ⚠️ Stored in plaintext by this stub; ciphertext in the real package. */
  whisper:    Whisper,
  /** Public note shown beside the lockbox while locked. Never put secret material here. */
  note:       Z.string().max(256).optional(),
  created_at: Z.string(),
  updated_at: Z.string(),
})
export type Lockbox = Z.infer<typeof Lockbox>

/**
 * The public face of a lockbox: everything but the whisper. This is what `list()` returns and
 * what a locked vault may show.
 */
export const LockboxSummary = Lockbox.omit({ whisper: true })
export type LockboxSummary = Z.infer<typeof LockboxSummary>

/**
 * The per-vault record the storage layer holds so a device can unlock the vault. In the real
 * package this carries a KDF salt and the vault key wrapped under the passphrase-derived key;
 * here it carries the passphrase itself, in the open, so the inspector can show the slot.
 */
export const VaultBundle = Z.object({
  format:          Z.literal('byok-stub-vault-v0'),
  applabel:        Label,
  user_id:         Z.string().min(1),
  vaultlabel:      Label,
  /** ⚠️ STUB ONLY: the real package stores a salt and a wrapped vault key, never this. */
  stub_passphrase: Z.string(),
  created_at:      Z.string(),
})
export type VaultBundle = Z.infer<typeof VaultBundle>

/**
 * The device-local record of a remembered unlock. In the real package this carries the vault key
 * wrapped under a non-extractable device key; in the stub there is no key material at all, only
 * the expiry.
 */
export const DeviceUnlock = Z.object({
  format:     Z.literal('byok-stub-unlock-v0'),
  applabel:   Label,
  user_id:    Z.string().min(1),
  vaultlabel: Label,
  /** Epoch milliseconds after which the remembered unlock no longer counts. */
  expires_at: Z.number(),
})
export type DeviceUnlock = Z.infer<typeof DeviceUnlock>

/** How long an entered passphrase is remembered on the device, unless the caller says otherwise. */
export const SevenDaysMs = 7 * 24 * 60 * 60 * 1000

/** Injected time source, so expiry is testable; defaults to the wall clock. */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
