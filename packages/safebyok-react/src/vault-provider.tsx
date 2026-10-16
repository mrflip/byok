import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isVaultCondition, isVaultError, openVault, type OpenVaultOpts, type Vault, type VaultError, type VaultSnapshot, type VaultValidators } from 'safebyok'
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
   * storage that cannot be reached (`storage_unavailable`), a user storage no longer serves
   * (`identity_revoked`, as when signed out of the backend, or not yet signed in to it), a stored
   * record that fails verification (`corrupt_record`). Null while
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
   * Every call settles: actions that find the vault locked while the dialog is already open wait
   * on that same dialog, and each resolves null when the dialog goes without an unlock -- the
   * user signs out or switches, the vault reopens, or the provider unmounts.
   *
   * @example const whisper = await withUnlockedVault(() => vault.read('anthropic_api_key'))
   *          // whisper === null: the user dismissed the dialog
   */
  withUnlockedVault: <ResultT>(action: () => Promise<ResultT>) => Promise<ResultT | null>
}

const VaultContext = createContext<VaultContextShape | null>(null)

/** One showing of the passphrase dialog: which one, and the actions waiting on its outcome. */
type Asking = { round: number, waiters: ((unlocked: boolean) => void)[] }

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
  unlocks:         [],
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
 * for the `keyDeriver` and `deviceDB` openVault asks for. The vault reopens whenever an option
 * changes identity, so build each schema in `validators` once, at module level; the bag around
 * them may be built in render, as the provider watches each schema rather than the bag.
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
  const { applabel, vaultlabel, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, validators, whenIdentityRevoked } = opts
  // The vault reopens when a check changes, never for a bag rebuilt in render around the same ones.
  const applabelCheck = validators?.applabel
  const vaultlabelCheck = validators?.vaultlabel
  const boxlabelCheck = validators?.boxlabel
  const userIdCheck = validators?.userId
  const noteCheck = validators?.note
  const [vault, setVault] = useState<Vault | null>(null)
  // The dialog showing now, if any, and the actions waiting on it. The ref is what the callbacks
  // read, so that a dialog's outcome reaches its own waiters and no newer dialog's; the state
  // renders it.
  const [asking, setAsking] = useState<Asking | null>(null)
  const askingRef = useRef<Asking | null>(null)
  // Counts the dialog's showings, so that each is a fresh dialog with nothing kept from the last.
  const askingRounds = useRef(0)
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
    const checks = { applabel: applabelCheck, vaultlabel: vaultlabelCheck, boxlabel: boxlabelCheck, userId: userIdCheck, note: noteCheck } satisfies Record<keyof VaultValidators, unknown>
    const openOpts = { applabel, vaultlabel, userId, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, validators: checks, whenIdentityRevoked } satisfies Record<keyof OpenVaultOpts, unknown>
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
  }, [userId, applabel, vaultlabel, vaultDB, deviceDB, forcePassphraseReentryHours, clock, keyDeriver, maxWhisperBytes, maxLockboxes, logger, whenIdentityRevoked, applabelCheck, vaultlabelCheck, boxlabelCheck, userIdCheck, noteCheck, openAttempt])

  const retryOpen = useCallback(() => {
    if (openError !== null) { setOpenAttempt((prev) => prev + 1) }
  }, [openError])

  /** Closes `ending` if it is still the dialog showing, and settles every action waiting on it. */
  const endAsking = useCallback((ending: Asking | null, unlocked: boolean) => {
    if (ending === null) { return }
    if (askingRef.current === ending) {
      askingRef.current = null
      setAsking(null)
    }
    for (const settle of ending.waiters) { settle(unlocked) }
  }, [])

  /** Waits on the dialog showing now, opening one if none is. */
  const awaitUnlock = useCallback(() => new Promise<boolean>((settle) => {
    const { current } = askingRef
    if (current !== null) {
      current.waiters.push(settle)
      return
    }
    askingRounds.current += 1
    const opening = { round: askingRounds.current, waiters: [settle] }
    askingRef.current = opening
    setAsking(opening)
  }), [])

  // A dialog belongs to the vault it was opened over: when that handle goes -- a sign-out, another
  // user, a reopen, the provider unmounting -- its actions resolve null, and it closes.
  useEffect(() => () => { endAsking(askingRef.current, false) }, [vault, endAsking])

  const withUnlockedVault = useCallback(async <ResultT,>(action: () => Promise<ResultT>): Promise<ResultT | null> => {
    try {
      return await action()
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { throw err }
      const unlocked = await awaitUnlock()
      if (! unlocked) { return null }
      return await action()
    }
  }, [awaitUnlock])

  // Thrown here, in render, so the nearest error boundary (or the dev overlay) shows it: misuse,
  // the developer's to fix, which no retry would mend. Every hook has run by now, so the throw
  // leaves the rules of hooks alone.
  if (openFailure !== null) { throw openFailure.err }

  return (
    <VaultContext.Provider value={{ vault, openError, retryOpen, withUnlockedVault }}>
      {children}
      {asking !== null && vault !== null && (
        <PassphraseModal
          key={asking.round}
          vault={vault}
          onDone={(unlocked) => { endAsking(asking, unlocked) }}
        />
      )}
    </VaultContext.Provider>
  )
}
