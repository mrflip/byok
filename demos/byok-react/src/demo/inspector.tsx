import { useEffect, useState } from 'react'
import { dbStore, deviceStore } from './stores'
import type { StringStore } from '../byok'

/**
 * DEMO JANK, and deliberately separate machinery: the inspector never talks to the vault. It
 * subscribes to the two raw stores and prints their rows, so what it shows is what is actually
 * stored, not what the library claims.
 */

type StoreRow = { ckey: string, text: string, holdsSecret: boolean }

/** Fields that would be ciphertext in the real package: the stub stores them in the open. */
const SecretFields = ['whisper', 'stub_passphrase']

const snapRows = (store: StringStore): StoreRow[] => (
  store.ckeys().sort().map((ckey) => {
    const text = store.read(ckey) ?? ''
    return { ckey, text, holdsSecret: rowHoldsSecret(text) }
  })
)

const rowHoldsSecret = (text: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') { return false }
    return SecretFields.some((field) => field in parsed)
  } catch {
    return false
  }
}

const useStoreRows = (store: StringStore): StoreRow[] => {
  const [rows, setRows] = useState<StoreRow[]>(() => snapRows(store))
  useEffect(() => {
    const refresh = () => { setRows(snapRows(store)) }
    refresh()
    return store.subscribe(refresh)
  }, [store])
  return rows
}

const StoreTable = ({ rows }: { rows: StoreRow[] }) => {
  if (rows.length === 0) { return <p className="quiet">(empty)</p> }
  return (
    <table className="store-table">
      <thead><tr><th>ckey</th><th>stored text</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ckey}>
            <td><code>{row.ckey}</code>{row.holdsSecret && <span className="chip warn">⚠️ plaintext secret (stub)</span>}</td>
            <td><code className="stored-text">{row.text}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const Inspector = () => {
  const dbRows = useStoreRows(dbStore)
  const deviceRows = useStoreRows(deviceStore)

  const wipe = () => {
    if (! window.confirm('Wipe every stored row, both pretend-backend and device?')) { return }
    dbStore.ckeys().forEach((ckey) => { dbStore.erase(ckey) })
    deviceStore.ckeys().forEach((ckey) => { deviceStore.erase(ckey) })
  }

  return (
    <div className="inspector">
      <div className="row spread">
        <h2>Under the hood</h2>
        <button className="mini danger" onClick={wipe}>wipe all stored data</button>
      </div>
      <p className="quiet">
        Two genuinely different places, rendered straight from storage. (Both happen to live in this
        browser&apos;s localStorage because the demo has no backend; the prefixes keep them honest.)
      </p>
      <div className="inspector-panes">
        <section>
          <h3>☁️ The backend database <code className="quiet">byok-demo:db:*</code></h3>
          <p className="quiet">
            Everything a server would ever see. In the real library the ⚠️ fields are ciphertext,
            sealed with keys that never leave your device; this stub stores them in plaintext.
          </p>
          <StoreTable rows={dbRows} />
        </section>
        <section>
          <h3>💻 This device <code className="quiet">byok-demo:device:*</code></h3>
          <p className="quiet">
            Stays in this browser: the app session, and the remembered unlock that spares you the
            passphrase for seven days. Never sent anywhere.
          </p>
          <StoreTable rows={deviceRows} />
        </section>
      </div>
    </div>
  )
}
