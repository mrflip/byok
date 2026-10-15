import { useState, type SubmitEvent } from 'react'
import { FarFuture, FarPast, ForcePassphraseReentryHours, VaultError, isVaultCondition, isVaultError, type Vault } from 'safebyok'
import { Boundary } from './boundary'
import { PasskeyUnlockButton } from './passkey-unlock-button'

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour
const MsPerHour = 3_600_000

/** A count with its unit spelled out and pluralized: 'minute' to '15 minutes', in English. */
const counted = (count: number, unit: 'day' | 'hour' | 'minute'): string => (
  new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long', useGrouping: false }).format(count)
)

/**
 * What the dialog promises about how long an unlock lasts, from the vault's
 * `forcePassphraseReentryHours`: a whole number of days, else of hours, else of minutes; and a
 * window as long as the vault can count (`Infinity` hours among them) reads as lasting until the
 * user locks it.
 */
const unlockedFor = (reentryHours: number): string => {
  if (Number.isNaN(reentryHours) || reentryHours <= 0) {
    throw new VaultError('bad_option', 'PassphraseModal\'s reentryHours is a number of hours greater than zero; Infinity means never. Pass the forcePassphraseReentryHours the vault was opened with.')
  }
  if (reentryHours * MsPerHour >= FarFuture - FarPast) { return 'Stays unlocked on this device until you lock it.' }
  const minutes = Math.max(1, Math.round(reentryHours * MinutesPerHour))
  if (minutes % MinutesPerDay === 0) { return `Stays unlocked on this device for ${counted(minutes / MinutesPerDay, 'day')}.` }
  if (minutes % MinutesPerHour === 0) { return `Stays unlocked on this device for ${counted(minutes / MinutesPerHour, 'hour')}.` }
  return `Stays unlocked on this device for ${counted(minutes, 'minute')}.`
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
 * try again or cancel. Anything else -- misuse, such as a closed vault handle or a `reentryHours`
 * of no hours, or a failure that is no VaultError -- never reaches the host's page: the dialog
 * shows a calm notice in its place, "Something went wrong", whose Close calls `onDone(false)`,
 * and React reports the error through the root's `onCaughtError` (the console, by default, with
 * the component stack), where the developer and an error tracker meet it. A passkey that fails
 * that way takes its button away and leaves the passphrase.
 *
 * `reentryHours` is the `forcePassphraseReentryHours` the vault was opened with, for the dialog's
 * promise about how long an unlock lasts: 'for 7 days', 'for 15 minutes', 'until you lock it' for
 * `Infinity`. VaultProvider passes it; a host rendering the dialog by hand does too, when it
 * opened the vault with anything but the default ({@link ForcePassphraseReentryHours}).
 *
 * @example
 *   <PassphraseModal vault={vault} reentryHours={0.25} onDone={(unlocked) => { setAsking(false) }} />
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <Boundary fallback={<DialogTrouble onDone={props.onDone} />}>
    <UnlockForm {...props} />
  </Boundary>
)

/** What PassphraseModal is handed. */
type PassphraseModalProps = {
  vault:         Vault
  onDone:        (unlocked: boolean) => void
  reentryHours?: number | undefined
}

/**
 * What the dialog shows once something has gone wrong inside it that is not the user's to mend:
 * a calm word, and the way out.
 */
const DialogTrouble = ({ onDone }: { onDone: (unlocked: boolean) => void }) => (
  <div className="modal-scrim">
    <div className="modal">
      <h3>Something went wrong</h3>
      <p className="gripe" role="alert">
        This app ran into a problem of its own, not one you caused, and could not unlock your vault. Your secrets are safe. Close this, reload the page, and try again.
      </p>
      <div className="row">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the field that held focus is gone; the WAI-ARIA dialog pattern moves focus to the dialog's one control */}
        <button type="button" autoFocus onClick={() => { onDone(false) }}>Close</button>
      </div>
    </div>
  </div>
)

/** The dialog itself, inside PassphraseModal's boundary. */
const UnlockForm = ({ vault, onDone, reentryHours = ForcePassphraseReentryHours }: PassphraseModalProps) => {
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
      // Misuse, or no VaultError at all: not for the user. Rethrown in render, where
      // PassphraseModal's boundary catches it; thrown from here it would miss every boundary.
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
        <p className="quiet">{unlockedFor(reentryHours)}</p>
        <div className="row">
          <button type="submit">{creating ? 'Create vault' : 'Unlock'}</button>
          {! creating && <PasskeyUnlockButton vault={vault} onDone={onDone} onGripe={setGripe} />}
          <button type="button" onClick={() => { onDone(false) }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
