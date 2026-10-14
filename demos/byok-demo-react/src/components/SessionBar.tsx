import { useState } from 'react'
import { useVault } from 'byok-react'
import { useSession } from '../hooks/useSession'
import type { Auth } from '../lib/auth'

/**
 * The app's sign-in strip. Typing a username signs you in (or up); there is no password, because
 * the demo's point is that the vault passphrase is a separate thing from signing in. Signing out
 * locks the vault: the remembered unlock on this device ends with the session.
 */
export const SessionBar = ({ auth }: { auth: Auth }) => {
  const session = useSession(auth)
  const { vault } = useVault()
  const [userlabelText, setUserlabelText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)

  const signIn = async () => {
    try {
      await auth.signIn(userlabelText.trim())
      setUserlabelText('')
      setGripe(null)
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not sign in.')
    }
  }

  const signOut = async () => {
    await vault?.lock()
    auth.signOut()
  }

  const deleteAccount = async () => {
    if (! window.confirm('Delete this account and its vault? The stored lockboxes are gone for good.')) { return }
    await vault?.destroy()
    await auth.deleteAccount()
  }

  if (session === null) {
    return (
      <div className="session-bar">
        <input
          placeholder="username"
          value={userlabelText}
          onChange={(evt) => { setUserlabelText(evt.target.value) }}
          onKeyDown={(evt) => { if (evt.key === 'Enter') { void signIn() } }}
        />
        <button onClick={() => { void signIn() }}>Sign in</button>
        {gripe !== null && <span className="gripe">{gripe}</span>}
      </div>
    )
  }

  return (
    <div className="session-bar">
      <span>Signed in as <strong>{session.userlabel}</strong> <code className="quiet">({session.userId})</code></span>
      <button onClick={() => { void signOut() }}>Sign out</button>
      <button className="danger" onClick={() => { void deleteAccount() }}>Delete account</button>
    </div>
  )
}
