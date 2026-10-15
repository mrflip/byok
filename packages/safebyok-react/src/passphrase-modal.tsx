import { useState, type SubmitEvent } from 'react'
import { ForeverMs, isVaultCondition, isVaultError, type Vault } from 'safebyok'

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour
const MsPerMinute = 60_000

/** The locale the window's count and relative phrase are formatted in. */
const Locale = 'en'

type Unit = 'day' | 'hour' | 'minute'

/** The window as a count of whole days, else of whole hours, else of minutes (at least one). */
const windowCount = (reentryWindowMs: number): { count: number, unit: Unit } => {
  const minutes = Math.max(1, Math.round(reentryWindowMs / MsPerMinute))
  if (minutes % MinutesPerDay === 0) { return { count: minutes / MinutesPerDay, unit: 'day' } }
  if (minutes % MinutesPerHour === 0) { return { count: minutes / MinutesPerHour, unit: 'hour' } }
  return { count: minutes, unit: 'minute' }
}

/**
 * What the dialog promises about how long an unlock lasts, from the vault's `reentryWindowMs`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". The longest window a vault
 * keeps (`ForeverMs`, which `Infinity` hours becomes) reads as lasting until the user locks it.
 */
const unlockedFor = (reentryWindowMs: number, creating: boolean): string => {
  if (reentryWindowMs >= ForeverMs) { return 'Stays unlocked on this device until you lock it.' }
  const { count, unit } = windowCount(reentryWindowMs)
  // numeric 'always', so that one day reads 'in 1 day' and never 'tomorrow'.
  const relativeTime = new Intl.RelativeTimeFormat(Locale, { numeric: 'always', style: 'long' })
  const relative = relativeTime.format(count, unit)
  return `Locks ${creating ? '' : 'again '}on this device ${relative}.`
}

/**
 * The dialog withUnlockedVault summons when the vault turns out to be locked. Unstyled markup
 * under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the host's stylesheet
 * to dress. Its behaviors are the contract: a first-ever unlock reads as "choose a passphrase"
 * (it creates the vault); a wrong passphrase stays in the dialog with a calm message rather than
 * failing the action; and an unlock that loses to a `lock()` called while it ran closes the
 * dialog as if dismissed. Whichever the case, it says plainly that a forgotten passphrase cannot
 * be recovered, and how long an unlock lasts on this device.
 *
 * A condition the unlock meets (storage that cannot be reached, a record that fails
 * verification) shows in the dialog in place, in the vault's own calm words, and the user may
 * try again or cancel. Misuse, or anything that is no VaultError, is thrown while rendering, for
 * the nearest error boundary above the dialog to catch.
 *
 * How long an unlock lasts it reads from the vault itself (its `reentryWindowMs`, the
 * `forcePassphraseReentryHours` it was opened with): 'Locks again on this device in 7 days', 'in 15
 * minutes', 'Stays unlocked on this device until you lock it' for `Infinity`. Nobody need tell the
 * dialog the window again.
 *
 * @example
 *   <PassphraseModal vault={vault} onDone={(unlocked) => { setAsking(false) }} />
 */
export const PassphraseModal = ({ vault, onDone }: {
  vault:  Vault
  onDone: (unlocked: boolean) => void
}) => {
  const [passphrase, setPassphrase] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  if (failure !== null) { throw failure.err }
  const creating = vault.getSnapshot().state === 'absent'

  const submit = async (evt: SubmitEvent) => {
    evt.preventDefault()
    try {
      await vault.unlock(passphrase)
      onDone(true)
    } catch (err) {
      // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
      if (isVaultError(err, 'vault_locked')) { onDone(false); return }
      // A condition (a wrong passphrase, storage out of reach): shown calmly, to try again.
      if (isVaultCondition(err)) { setGripe(err.message); return }
      // Misuse, or no VaultError at all: not for the user. Rethrown in render, where a boundary
      // catches it; thrown from here it would vanish into the voided promise.
      setFailure({ err })
    }
  }

  return (
    <div className="modal-scrim">
      <form className="modal" onSubmit={(evt) => { void submit(evt) }}>
        <h3>{creating ? 'Choose a vault passphrase' : 'Unlock your vault'}</h3>
        <p className="quiet">
          {creating
            ? "This passphrase encrypts your secrets on your device. Nobody can recover it for you -- not even us."
            : 'Your secrets are encrypted with this passphrase; enter it to continue. A forgotten passphrase cannot be recovered -- you would start a new vault and re-enter your secrets.'}
        </p>
        <input
          type="password"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- moving focus to the dialog's first field on open is the WAI-ARIA dialog pattern; the rule aims at page-load autofocus
          autoFocus
          placeholder="vault passphrase"
          value={passphrase}
          onChange={(evt) => { setPassphrase(evt.target.value); setGripe(null) }}
        />
        {gripe !== null && <p className="gripe">{gripe}</p>}
        <p className="quiet">{unlockedFor(vault.reentryWindowMs, creating)}</p>
        <div className="row">
          <button type="submit">{creating ? 'Create vault' : 'Unlock'}</button>
          <button type="button" onClick={() => { onDone(false) }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
