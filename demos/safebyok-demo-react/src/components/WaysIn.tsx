import { useState } from 'react'
import { createPasskey, passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/**
 * The vault's ways in -- its passphrases and passkeys, listed even while locked -- and an "Add
 * fingerprint" form. The line that matters is `vault.addPasskey(passphrase, passkey, ...)`: the
 * passkey comes from `createPasskey()`, and the passphrase is the proof every change to the ways in
 * asks for, even unlocked. Once added, the passphrase dialog offers "Use a passkey".
 */
export const WaysIn = () => {
  const { vault } = useVault()
  const snapshot = useVaultSnapshot()
  const [passphrase, setPassphrase] = useState('')
  const [unlocklabel, setUnlocklabel] = useState('laptop_fingerprint')
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null || snapshot.unlocks.length === 0) { return null }

  const addFingerprint = async () => {
    setGripe(null)
    try {
      const passkey = await createPasskey({ rp: { name: 'safebyok playground' }, user: { name: snapshot.scope.user_id, displayName: snapshot.scope.user_id } })
      if (passkey === null) { return }
      await vault.addPasskey(passphrase, passkey, { unlocklabel })
      setPassphrase('')
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not add that passkey.')
    }
  }

  return (
    <section className="ways-in">
      <h2>Ways in</h2>
      <ul>
        {snapshot.unlocks.map((unlock) => (
          <li key={unlock.unlock_id}><code>{unlock.unlocklabel}</code> <span className="quiet">{unlock.method}</span></li>
        ))}
      </ul>
      {passkeysAvailable()
        ? (
          <div className="lockbox-form">
            <label>
              your passphrase <span className="quiet">(the proof any change to the ways in asks for)</span>
              <input type="password" value={passphrase} onChange={(evt) => { setPassphrase(evt.target.value) }} />
            </label>
            <label>
              label
              <input value={unlocklabel} onChange={(evt) => { setUnlocklabel(evt.target.value) }} />
            </label>
            {gripe !== null && <p className="gripe">{gripe}</p>}
            <div className="row">
              <button onClick={() => { void addFingerprint() }}>Add fingerprint</button>
            </div>
          </div>
        )
        : <p className="quiet">This browser offers no passkeys, so no fingerprint unlock here.</p>}
    </section>
  )
}
