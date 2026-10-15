/**
 * safebyok-react's public surface: the thin React binding over safebyok. No vault logic lives here
 * -- only the provider that follows the host's signed-in user, the snapshot hooks, and
 * `withUnlockedVault`, the wrapper that asks for the passphrase on demand.
 */
export { VaultProvider, useVault, useVaultSnapshot } from './vault-provider'
export type { VaultContextShape, VaultProviderProps } from './vault-provider'
export { PassphraseModal } from './passphrase-modal'
