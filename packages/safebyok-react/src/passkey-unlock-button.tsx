import { useState } from 'react'
import { isVaultCondition, isVaultError, type Vault } from 'safebyok'
import { askPasskey, passkeysAvailable } from './passkey'

/**
 * A button that unlocks the vault with one of its passkeys: rendered only when the vault has one
 * and the browser offers WebAuthn, so a dialog can place it beside its passphrase field
 * unconditionally. `PassphraseModal` does. A press asks the user to touch a passkey, then unlocks
 * with its answer.
 *
 * `onDone(true)` once unlocked; `onDone(false)` when a `lock()` called meanwhile wins, as the
 * passphrase dialog does. A dismissed prompt does nothing; a condition (a wrong or removed passkey,
 * an authenticator without PRF) goes to `onGripe` with its calm message, for the dialog to show;
 * misuse is thrown while rendering, for the nearest error boundary.
 *
 * @example <PasskeyUnlockButton vault={vault} onDone={close} onGripe={setGripe} />
 * @example <PasskeyUnlockButton vault={vault} rpId="acme.example" onDone={close} onGripe={setGripe} />  // passkeys made under that rp.id
 */
export const PasskeyUnlockButton = ({ vault, onDone, onGripe, rpId }: {
  vault:   Vault
  onDone:  (unlocked: boolean) => void
  onGripe: (gripe: string) => void
  rpId?:   string | undefined
}) => {
  const [asking, setAsking] = useState(false)
  // Wrapped, so that a rejection carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  if (failure !== null) { throw failure.err }
  if (! passkeysAvailable()) { return null }
  const { unlocks } = vault.getSnapshot()
  if (unlocks.every((unlock) => unlock.method !== 'passkey')) { return null }

  const press = async () => {
    setAsking(true)
    try {
      const passkey = await askPasskey(unlocks, { rpId })
      if (passkey === null) { return }
      await vault.unlock(passkey)
      onDone(true)
    } catch (err) {
      // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
      if (isVaultError(err, 'vault_locked')) { onDone(false); return }
      if (isVaultCondition(err)) { onGripe(err.message); return }
      setFailure({ err })
    } finally {
      setAsking(false)
    }
  }

  return (
    <button type="button" disabled={asking} onClick={() => { void press() }}>
      Use a passkey
    </button>
  )
}
