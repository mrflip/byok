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
 *   `absent_box`, `absent_vault`, `whisper_too_large`, `vault_full`, `corrupt_record`,
 *   `stale_write`, `not_permitted`, `storage_unavailable`.
 *
 * `vault_full` means a new lockbox in a vault already holding its `maxLockboxes` (a limit the
 * client keeps), and also that storage has no room for the write (a limit of the backend's own,
 * such as the Convex component's). Either way the user erases a lockbox, or the host raises
 * `maxLockboxes` where the backend allows. `whisper_too_large` is the user's value over
 * `maxWhisperBytes`, so a condition; `bad_label` is the app's own label, a misuse -- a label the
 * user types is checked first with the exported `Label`.
 *
 * The package README's *Errors* section lists what each kind means and what to do about it.
 */
export const VaultErrorKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'absent_box',          // no lockbox under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'bad_label',           // a label that does not meet the Label rules
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class instance)
  'whisper_too_large',   // a whisper over the vault's maxWhisperBytes
  'vault_full',          // a new lockbox in a vault already holding its maxLockboxes, or a write storage has no room for
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
