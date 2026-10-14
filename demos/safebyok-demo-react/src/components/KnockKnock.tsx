import { useState } from 'react'
import { useVault, useVaultSnapshot } from 'safebyok-react'
import { gripeForJokeErr, tellKnockKnockJoke } from '../lib/anthropic'

/**
 * The "app": a knock-knock machine powered by the user's own Anthropic key. This is what using
 * the library day-to-day looks like -- one lockbox holding the key, `withUnlockedVault()` around
 * anything that needs it, and `vault.use()` scoping the decrypted key to the API call.
 */

/** The lockbox the knock-knock machine keeps its key in. */
const ApiKeyBoxlabel = 'anthropic_api_key'

export const KnockKnock = () => {
  const { vault, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [whosThere, setWhosThere] = useState('')
  const [joke, setJoke] = useState<string | null>(null)
  const [telling, setTelling] = useState(false)
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return null }
  const keyBox = snapshot.boxes.find((box) => box.boxlabel === ApiKeyBoxlabel)

  const knock = async () => {
    setTelling(true)
    setJoke(null)
    setGripe(null)
    try {
      const told = await withUnlockedVault(() => vault.use(ApiKeyBoxlabel, (whisper) => tellKnockKnockJoke(String(whisper), whosThere.trim())))
      if (told !== null) { setJoke(told) }
    } catch (err) {
      setGripe(gripeForJokeErr(err))
    } finally {
      setTelling(false)
    }
  }

  return (
    <section className="knock-knock">
      <h2>The Knock-Knock Machine</h2>
      <p className="quiet">
        Jokes by Claude, paid for with <em>your</em> Anthropic key -- which lives in your vault and
        is decrypted only on this device, only for the moment of the request.
      </p>
      <div className="knock-row">
        <span className="knock-line">Knock! Knock!</span>
        <span className="knock-line">Who&apos;s there?</span>
        <input
          placeholder="Banana"
          value={whosThere}
          onChange={(evt) => { setWhosThere(evt.target.value) }}
          onKeyDown={(evt) => { if (evt.key === 'Enter' && whosThere.trim()) { void knock() } }}
        />
        <button disabled={telling || ! whosThere.trim() || keyBox === undefined} onClick={() => { void knock() }}>
          (( {whosThere.trim() || '…'} Who? ))
        </button>
      </div>
      {telling && <p className="quiet">Claude is clearing its throat…</p>}
      {joke !== null && <blockquote className="joke">{joke}</blockquote>}
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <ApiKeySlot haveKeyBox={keyBox !== undefined} updatedAt={keyBox?.updated_at} />
    </section>
  )
}

/** The facility for entering (or replacing) the Anthropic API key, stored as a lockbox. */
const ApiKeySlot = ({ haveKeyBox, updatedAt }: { haveKeyBox: boolean, updatedAt?: string }) => {
  const { vault, withUnlockedVault } = useVault()
  const [editing, setEditing] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return null }

  const save = async () => {
    setGripe(null)
    try {
      const saved = await withUnlockedVault(async () => {
        await vault.store(ApiKeyBoxlabel, keyText.trim(), { note: 'feeds the knock-knock machine' })
        return true
      })
      if (saved !== null) {
        setEditing(false)
        setKeyText('')
      }
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not save that key.')
    }
  }

  if (! haveKeyBox && ! editing) {
    return (
      <p className="api-key-slot quiet">
        No Anthropic API key yet -- the machine won&apos;t knock without one.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>add your key</button>
      </p>
    )
  }
  if (! editing) {
    return (
      <p className="api-key-slot quiet">
        ✓ Anthropic key in the vault{updatedAt !== undefined && ` (saved ${new Date(updatedAt).toLocaleString()})`}.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>replace it</button>
      </p>
    )
  }
  return (
    <div className="api-key-slot">
      <input
        type="password"
        placeholder="sk-ant-…"
        value={keyText}
        onChange={(evt) => { setKeyText(evt.target.value) }}
      />
      <button disabled={! keyText.trim()} onClick={() => { void save() }}>Save key</button>
      <button onClick={() => { setEditing(false); setKeyText(''); setGripe(null) }}>Cancel</button>
      {gripe !== null && <span className="gripe">{gripe}</span>}
    </div>
  )
}
