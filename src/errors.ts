/** Every way a vault call can refuse, as a caller branches on them. */
export const VaultErrorKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'absent_box',          // no lockbox under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'bad_label',           // a label that does not meet the Label rules
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class instance)
  'whisper_too_large',   // a whisper over the vault's maxWhisperBytes
  'bad_option',          // an openVault option out of its range
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
