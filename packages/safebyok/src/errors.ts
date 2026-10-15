/**
 * Every way a vault call can refuse, as a caller branches on them -- and every kind any safebyok
 * package throws: the storage adapters' kinds are these same strings. Each belongs to one of two
 * families, told apart by who must act:
 *
 * - **Misuse**: a programming error, the host developer's to fix, and loud. `bad_label`,
 *   `bad_whisper`, `bad_option`, `vault_closed`, `unknown_key_deriver`. Let it reach an error
 *   boundary or the dev overlay; do not show it to the user, and do not retry.
 * - **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or tell them to free room. `vault_locked`, `wrong_passphrase`,
 *   `wrong_passkey`, `passkey_unavailable`, `absent_box`, `absent_vault`, `absent_unlock`,
 *   `whisper_too_large`, `lockbox_too_large`, `vault_full`, `too_many_unlocks`, `last_unlock`, `corrupt_record`,
 *   `stale_write`, `not_permitted`, `storage_unavailable`.
 *
 * `vault_full` means a new lockbox in a vault already holding its `maxLockboxes` (a limit the
 * client keeps), and also that storage has no room for the write (a limit of the backend's own,
 * such as the Convex component's or the Postgres server's). Either way the user erases a lockbox,
 * or the host raises `maxLockboxes` where the backend allows. `whisper_too_large` is the user's value over
 * `maxWhisperBytes`, so a condition, and `lockbox_too_large` the user's whisper and note together
 * over what storage holds in one record. `bad_label` is a label the app passed that fails the
 * vault's check, a misuse -- a label the user types is checked first, with `Label` or with the
 * host's own `validators.boxlabel`.
 *
 * The package README's *Errors* section lists what each kind means and what to do about it.
 */
export const VaultErrorKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'wrong_passkey',       // the passkey's answer did not unlock the vault, or was for another salt
  'passkey_unavailable', // this browser or authenticator cannot answer for a passkey unlock (no WebAuthn, or no PRF)
  'absent_box',          // no lockbox under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'absent_unlock',       // no unlock envelope of that unlock_id, or none of the method asked for
  'bad_label',           // a label, or the userId, that fails the vault's check for it
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class), or a non-string
  'whisper_too_large',   // a whisper over the vault's maxWhisperBytes
  'lockbox_too_large',   // a lockbox -- whisper, names and note together -- over what storage holds in one record
  'vault_full',          // a new lockbox in a vault already holding its maxLockboxes, or a write storage has no room for
  'too_many_unlocks',    // a new unlock envelope in a vault already holding MaxUnlocks
  'last_unlock',         // removing the vault's last passphrase, which would leave no sure way in
  'bad_option',          // an option or argument out of its range: openVault's, mask's, argon2idDeriver's, a store()'s note, a VaultDB write's record
  'vault_closed',        // the vault handle was closed and cannot be used again
  'corrupt_record',      // a stored record failed validation or decryption verification
  'unknown_key_deriver', // the vault names a key deriver this handle was not built with
  'stale_write',         // storage changed since this device read it, so the write was refused
  'not_permitted',       // the storage backend refused this user: signed out, or not theirs to reach
  'storage_unavailable', // the storage backend could not be reached, or failed
] as const
export type VaultErrorKind = typeof VaultErrorKindVals[number]

/**
 * Error thrown by every vault operation that refuses: a calm message saying what went wrong and
 * what to do, and a `kind` to branch on. It never carries a whisper, a passphrase, or any other
 * secret material -- not in the message, not as a property.
 *
 * @example
 *   try { await vault.read('ANTHROPIC_API_KEY') } catch (err) {
 *     if (err instanceof VaultError && err.kind === 'vault_locked') { promptForPassphrase() }
 *   }
 */
export class VaultError extends Error {
  readonly kind: VaultErrorKind

  /**
   * @param kind - What went wrong, from {@link VaultErrorKindVals}: what a caller branches on.
   * @param message - What went wrong and what to do, calmly. Never quotes secret material.
   * @param opts - `cause`: the lower-level failure behind this one, such as a storage adapter's
   *   own error, kept for debugging. Never a value that holds secret material.
   */
  constructor(kind: VaultErrorKind, message: string, opts?: ErrorOptions) {
    super(message, opts)
    this.name = 'VaultError'
    this.kind = kind
  }
}

/** True when `err` is a VaultError of the given kind. */
export const isVaultError = (err: unknown, kind?: VaultErrorKind): err is VaultError => (
  err instanceof VaultError && (kind === undefined || err.kind === kind)
)

/**
 * The two families a VaultError kind belongs to, told apart by who must act. `misuse` is a
 * programming error, the host developer's to fix: let it reach an error boundary or the dev
 * overlay, never show it to the user, never retry. `condition` is something the app handles at
 * run time, which may reach the user: ask again, show a message, retry.
 */
export const VaultErrorFamilyVals = ['misuse', 'condition'] as const
export type VaultErrorFamily = typeof VaultErrorFamilyVals[number]

/**
 * Which family each kind belongs to: every kind in {@link VaultErrorKindVals}, exactly once.
 *
 * @example VaultErrorFamilyForKind.bad_option           // 'misuse'
 * @example VaultErrorFamilyForKind.storage_unavailable  // 'condition'
 */
export const VaultErrorFamilyForKind = {
  vault_locked:        'condition',
  wrong_passphrase:    'condition',
  wrong_passkey:       'condition',
  passkey_unavailable: 'condition',
  absent_box:          'condition',
  absent_vault:        'condition',
  absent_unlock:       'condition',
  bad_label:           'misuse',
  bad_whisper:         'misuse',
  whisper_too_large:   'condition',
  lockbox_too_large:   'condition',
  vault_full:          'condition',
  too_many_unlocks:    'condition',
  last_unlock:         'condition',
  bad_option:          'misuse',
  vault_closed:        'misuse',
  corrupt_record:      'condition',
  unknown_key_deriver: 'misuse',
  stale_write:         'condition',
  not_permitted:       'condition',
  storage_unavailable: 'condition',
} as const satisfies Readonly<Record<VaultErrorKind, VaultErrorFamily>>

/**
 * True when `err` is a VaultError of the `condition` family: one the app may show the user, or
 * retry. Anything else -- misuse, an error that is not a VaultError, a thrown non-error -- is
 * false, and belongs with an error boundary.
 *
 * @example
 *   try { await vault.store(boxlabel, whisper) } catch (err) {
 *     if (! isVaultCondition(err)) { throw err }
 *     showGripe(err.message)
 *   }
 */
export const isVaultCondition = (err: unknown): err is VaultError => (
  isVaultError(err) && VaultErrorFamilyForKind[err.kind] === 'condition'
)
