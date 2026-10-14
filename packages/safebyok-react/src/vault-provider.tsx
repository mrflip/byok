import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isVaultError, openVault, type OpenVaultOpts, type Vault, type VaultSnapshot } from 'safebyok'
import { PassphraseModal } from './passphrase-modal'

/**
 * What the provider hands down: the vault handle (null while opening or signed out) and
 * `withUnlockedVault`, which owns the ask-for-the-passphrase-when-needed flow.
 */
export type VaultContextShape = {
  vault: Vault | null
  /**
   * Run an action that may need the vault unlocked. If it refuses with kind 'vault_locked', the
   * passphrase dialog opens; after a successful unlock the action runs again. Resolves null when
   * the user dismisses the dialog instead -- unambiguously for whisper reads, since a whisper is
   * never null. Only an action whose own result could be null needs to wrap it in an object.
   *
   * @example const whisper = await withUnlockedVault(() => vault.read('anthropic_api_key'))
   *          // whisper === null: the user dismissed the dialog
   */
  withUnlockedVault: <ResultT>(action: () => Promise<ResultT>) => Promise<ResultT | null>
}

const VaultContext = createContext<VaultContextShape | null>(null)

/** The vault handle and withUnlockedVault, from the nearest VaultProvider. */
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

/**
 * Every openVault option, passed through as given (an option left out gets openVault's default),
 * except that `userId` may be null.
 */
export type VaultProviderProps = Omit<OpenVaultOpts, 'userId'> & {
  /** The signed-in user from the host's auth, or null when nobody is: then there is no vault. */
  userId:   string | null
  children: ReactNode
}

/**
 * Opens the vault for the signed-in user and keeps it matched to that identity: a null userId
 * closes the handle, a different userId opens a different vault. Renders the passphrase dialog
 * when an action run through withUnlockedVault finds the vault locked. The dialog is unstyled markup under the
 * `modal-scrim` / `modal` class names; the host's stylesheet dresses it.
 *
 * @example
 *   <VaultProvider applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
 *     vaultDB={vaultDB} deviceDB={deviceDB}>
 *     <App />
 *   </VaultProvider>
 */
export const VaultProvider = ({ userId, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultlabel, vaultDB, deviceDB, rememberForMs, clock, keyDeriver, maxWhisperBytes } = opts
  const [vault, setVault] = useState<Vault | null>(null)
  const [asking, setAsking] = useState<{ settle: (unlocked: boolean) => void } | null>(null)

  useEffect(() => {
    if (userId === null) { return undefined }
    let handle: Vault | null = null
    let gone = false
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if an openVault
    // option is ever added and not passed through.
    const openOpts = { applabel, vaultlabel, userId, vaultDB, deviceDB, rememberForMs, clock, keyDeriver, maxWhisperBytes } satisfies Record<keyof OpenVaultOpts, unknown>
    void openVault(openOpts).then((opened) => {
      if (gone) { opened.close(); return }
      handle = opened
      setVault(opened)
    })
    return () => {
      gone = true
      handle?.close()
      setVault(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, rememberForMs, clock, keyDeriver, maxWhisperBytes])

  const withUnlockedVault = useCallback(async <ResultT,>(action: () => Promise<ResultT>): Promise<ResultT | null> => {
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
    <VaultContext.Provider value={{ vault, withUnlockedVault }}>
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
