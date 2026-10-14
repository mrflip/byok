import { useState, type SubmitEvent } from 'react'
import { isVaultError, type Vault } from 'safebyok'

/**
 * The dialog withUnlockedVault summons when the vault turns out to be locked. Unstyled markup
 * under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the host's stylesheet
 * to dress. Its two behaviors are the contract: a first-ever unlock reads as "choose a
 * passphrase" (it creates the vault), and a wrong passphrase stays in the dialog with a calm
 * message rather than failing the action.
 */
export const PassphraseModal = ({ vault, onDone }: { vault: Vault, onDone: (unlocked: boolean) => void }) => {
  const [passphrase, setPassphrase] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)
  const creating = vault.getSnapshot().state === 'absent'

  const submit = async (evt: SubmitEvent) => {
    evt.preventDefault()
    try {
      await vault.unlock(passphrase)
      onDone(true)
    } catch (err) {
      if (isVaultError(err, 'wrong_passphrase')) { setGripe(err.message); return }
      throw err
    }
  }

  return (
    <div className="modal-scrim">
      <form className="modal" onSubmit={(evt) => { void submit(evt) }}>
        <h3>{creating ? 'Choose a vault passphrase' : 'Unlock your vault'}</h3>
        <p className="quiet">
          {creating
            ? "This passphrase encrypts your secrets on your device. Nobody can recover it for you -- not even us."
            : 'Your secrets are encrypted with this passphrase; enter it to continue.'}
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
        <p className="quiet">Stays unlocked on this device for seven days.</p>
        <div className="row">
          <button type="submit">{creating ? 'Create vault' : 'Unlock'}</button>
          <button type="button" onClick={() => { onDone(false) }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
