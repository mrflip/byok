/** Every way a vault call can refuse, as a caller branches on them. */
export const VaultErrorKindVals = [
  'vault_locked',     // a whisper was asked for before the vault was unlocked
  'wrong_passphrase', // the passphrase given did not unlock the vault
  'absent_box',       // no lockbox under that label
  'bad_label',        // a label that does not meet the Label rules
  'bad_whisper',      // a whisper JSON cannot carry (undefined, a function, a class instance)
  'vault_closed',     // the vault handle was closed and cannot be used again
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

  constructor(kind: VaultErrorKind, message: string) {
    super(message)
    this.name = 'VaultError'
    this.kind = kind
  }
}

/** True when `err` is a VaultError of the given kind. */
export const isVaultError = (err: unknown, kind?: VaultErrorKind): err is VaultError => (
  err instanceof VaultError && (kind === undefined || err.kind === kind)
)
