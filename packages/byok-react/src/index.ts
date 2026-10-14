/**
 * byok-react's public surface: the thin React binding over byok. No vault logic lives here --
 * only the provider that follows the host's signed-in user, the snapshot hooks, and the
 * passphrase-on-demand guard.
 */
export { VaultProvider, useVault, useVaultSnapshot } from './vault-provider'
export type { VaultContextShape, VaultProviderProps } from './vault-provider'
export { PassphraseModal } from './passphrase-modal'
