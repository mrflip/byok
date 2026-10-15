/** Every way a vault call can refuse, as a caller branches on them. */
export const VaultErrorKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'absent_box',          // no lockbox under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'bad_label',           // a label that does not meet the Label rules
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class instance)
  'whisper_too_large',   // a whisper over the vault's maxWhisperBytes
  'vault_full',          // a new lockbox in a vault already holding its maxLockboxes
  'bad_option',          // an option out of its range: openVault's, or a store()'s note
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
  absent_box:          'condition',
  absent_vault:        'condition',
  bad_label:           'misuse',
  bad_whisper:         'misuse',
  whisper_too_large:   'condition',
  vault_full:          'condition',
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
