import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isVaultCondition, isVaultError, openVault, type OpenVaultOpts, type Vault, type VaultError, type VaultSnapshot } from 'safebyok'
import { PassphraseModal } from './passphrase-modal'

/**
 * What the provider hands down: the vault handle (null while opening, signed out, or when the
 * open failed), why the open failed and a way to try again, and `withUnlockedVault`, which owns
 * the ask-for-the-passphrase-when-needed flow.
 */
export type VaultContextShape = {
  vault: Vault | null
  /**
   * Why the vault could not be opened, when it is a condition the app can show in place:
   * storage that cannot be reached (`storage_unavailable`), a user storage will not serve
   * (`not_permitted`), a stored record that fails verification (`corrupt_record`). Null while
   * opening, once open, and while signed out. Misuse -- a bad label or option -- never lands
   * here: the provider throws it to the nearest error boundary.
   *
   * @example
   *   if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
   */
  openError: VaultError | null
  /**
   * Open the vault again after `openError`, clearing it while the new attempt runs. Does
   * nothing while there is no openError to retry.
   */
  retryOpen: () => void
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
  state:           'opening',
  scope:           { applabel: 'none', user_id: 'none', vaultlabel: 'none' },
  boxes:           [],
  askPassphraseAt: null,
}
const getEmptySnapshot = () => emptySnapshot
const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing

/** The vault's live snapshot: lockbox summaries, lock state, when it next asks for the passphrase. */
export const useVaultSnapshot = (): VaultSnapshot => {
  const { vault } = useVault()
  return useSyncExternalStore(
    vault === null ? subscribeToNothing : vault.subscribe,
    vault === null ? getEmptySnapshot : vault.getSnapshot,
  )
}

/**
 * Every openVault option, passed through as given (an option left out gets openVault's default),
 * except that `userId` may be null. In a browser, spread `browserOpts()` from `safebyok/browser`
 * for the `keyDeriver` and `deviceDB` openVault asks for.
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
 * If openVault rejects with a condition (`isVaultCondition` from safebyok) -- storage that
 * cannot be reached, a signed-out user, a damaged record -- the provider hands it down as
 * `openError`, for the app to show in place beside a `retryOpen` button. Anything else it
 * rejects with -- misuse, such as a bad label or option, or a value that is no VaultError at
 * all -- the provider throws while rendering, for the nearest error boundary to catch.
 *
 * @example
 *   <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
 *     vaultDB={vaultDB}>
 *     <App />
 *   </VaultProvider>
 */
export const VaultProvider = ({ userId, children, ...opts }: VaultProviderProps) => {
  const { applabel, vaultlabel, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger } = opts
  const [vault, setVault] = useState<Vault | null>(null)
  const [asking, setAsking] = useState<{ settle: (unlocked: boolean) => void } | null>(null)
  // Wrapped, so that a rejection carrying any value at all (null, say) still reads as "failed".
  const [openFailure, setOpenFailure] = useState<{ err: unknown } | null>(null)
  const [openError, setOpenError] = useState<VaultError | null>(null)
  // Bumped by retryOpen: a fresh value re-runs the open effect.
  const [openAttempt, setOpenAttempt] = useState(0)

  useEffect(() => {
    if (userId === null) { return }
    let handle: Vault | null = null
    let gone = false
    // Listed one by one so the effect re-runs on each; `satisfies` fails the build if an openVault
    // option is ever added and not passed through.
    const openOpts = { applabel, vaultlabel, userId, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger } satisfies Record<keyof OpenVaultOpts, unknown>
    void openVault(openOpts).then((opened) => {
      if (gone) { opened.close(); return }
      handle = opened
      setVault(opened)
    }).catch((err: unknown) => {
      if (gone) { return }
      if (isVaultCondition(err)) {
        setOpenError(err)
      } else {
        setOpenFailure({ err })
      }
    })
    return () => {
      gone = true
      handle?.close()
      setVault(null)
      setOpenFailure(null)
      setOpenError(null)
    }
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, openAttempt])

  const retryOpen = useCallback(() => {
    if (openError !== null) { setOpenAttempt((prev) => prev + 1) }
  }, [openError])

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

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (openFailure !== null) { throw openFailure.err }

  return (
    <VaultContext.Provider value={{ vault, openError, retryOpen, withUnlockedVault }}>
      {children}
      {asking !== null && vault !== null && (
        <PassphraseModal
          vault={vault}
          reentryHours={forcePassphraseReentryHours}
          onDone={(unlocked) => { setAsking(null); asking.settle(unlocked) }}
        />
      )}
    </VaultContext.Provider>
  )
}
