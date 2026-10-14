import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isVaultError, openVault, type DeviceDB, type Vault, type VaultDB, type VaultSnapshot } from '../byok'
import { PassphraseModal } from './passphrase-modal'
import type { Auth, Session } from './auth'

/**
 * SCAFFOLDING a real host application would adapt rather than copy: one provider that follows the
 * auth session, opens the signed-in user's vault, and owns the ask-for-the-passphrase-when-needed
 * flow. The pieces a host keeps are the patterns: vault-follows-session, `useSyncExternalStore`
 * off the vault's snapshot, and `guard()` wrapping any action that touches a whisper.
 */

type VaultContextShape = {
  vault: Vault | null
  /**
   * Run an action that may need the vault unlocked. If it refuses with 'vault_locked', the
   * passphrase modal opens; after a successful unlock the action runs again. Returns null when
   * the user dismisses the modal instead.
   */
  guard: <ResultT>(action: () => Promise<ResultT>) => Promise<ResultT | null>
}

const VaultContext = createContext<VaultContextShape | null>(null)

/** The session from the auth scaffold, live. */
export const useSession = (auth: Auth): Session | null => useSyncExternalStore(auth.subscribe, auth.getSnapshot)

/** The vault handle and the guard, from the nearest VaultProvider. */
export const useVault = (): VaultContextShape => {
  const shape = useContext(VaultContext)
  if (shape === null) { throw new Error('useVault needs a <VaultProvider> above it.') }
  return shape
}

const emptySnapshot: VaultSnapshot = {
  state:     'opening',
  scope:     { applabel: 'none', user_id: 'none', vaultlabel: 'none' },
  boxes:     [],
  expiresAt: null,
}
const getEmptySnapshot = () => emptySnapshot
const subscribeToNothing = () => () => { /* nothing to hear */ }

/** The vault's live snapshot: lockbox summaries, lock state, unlock expiry. */
export const useVaultSnapshot = (): VaultSnapshot => {
  const { vault } = useVault()
  return useSyncExternalStore(
    vault === null ? subscribeToNothing : vault.subscribe,
    vault === null ? getEmptySnapshot : vault.getSnapshot,
  )
}

type VaultProviderProps = {
  auth:       Auth
  applabel:   string
  vaultlabel: string
  vaultDB:    VaultDB
  deviceDB:   DeviceDB
  children:   ReactNode
}

/**
 * Opens the signed-in user's vault and keeps it matched to the session: sign-out closes the
 * handle, a different sign-in opens a different vault. Renders the passphrase modal when some
 * guarded action finds the vault locked.
 */
export const VaultProvider = ({ auth, applabel, vaultlabel, vaultDB, deviceDB, children }: VaultProviderProps) => {
  const session = useSession(auth)
  const [vault, setVault] = useState<Vault | null>(null)
  const [asking, setAsking] = useState<{ settle: (unlocked: boolean) => void } | null>(null)

  useEffect(() => {
    if (session === null) { return undefined }
    let handle: Vault | null = null
    let gone = false
    void openVault({ applabel, vaultlabel, userId: session.userId, vaultDB, deviceDB }).then((opened) => {
      if (gone) { opened.close(); return }
      handle = opened
      setVault(opened)
    })
    return () => {
      gone = true
      handle?.close()
      setVault(null)
    }
  }, [session, applabel, vaultlabel, vaultDB, deviceDB])

  const guard = useCallback(async <ResultT,>(action: () => Promise<ResultT>): Promise<ResultT | null> => {
    try {
      return await action()
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { throw err }
      const unlocked = await new Promise<boolean>((settle) => { setAsking({ settle }) })
      if (! unlocked) { return null }
      return await action()
    }
  }, [])

  return (
    <VaultContext.Provider value={{ vault, guard }}>
      {children}
      {asking !== null && vault !== null && (
        <PassphraseModal
          vault={vault}
          onDone={(unlocked) => { setAsking(null); asking.settle(unlocked) }}
        />
      )}
    </VaultContext.Provider>
  )
}
