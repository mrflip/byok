import { useEffect, useState } from 'react'
import type { StringStore } from 'byok'

/**
 * Shared machinery for the two inspection panels, and nothing else uses it: deleting the
 * panels means deleting this whole src/components/inspection/ directory. The panels never talk
 * to the vault -- they subscribe to the raw stores, so what they show is what is actually
 * stored, not what the library claims.
 */

export type StoreRow = { ckey: string, text: string, holdsSecret: boolean }

/** Fields that would be ciphertext in the real package: the stub stores them in the open. */
const SecretFields = ['whisper', 'stub_passphrase']

const snapRows = (store: StringStore): StoreRow[] => (
  store.ckeys().toSorted().map((ckey) => {
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

/** The store's rows, live: re-snapped on every store change. */
// eslint-disable-next-line react-refresh/only-export-components -- the panels' shared hook lives with their shared table; an edit here reloads the page, which the inspection panels can afford
export const useStoreRows = (store: StringStore): StoreRow[] => {
  const [rows, setRows] = useState<StoreRow[]>(() => snapRows(store))
  useEffect(() => {
    const refresh = () => { setRows(snapRows(store)) }
    refresh()
    return store.subscribe(refresh)
  }, [store])
  return rows
}

export const StoreTable = ({ rows }: { rows: StoreRow[] }) => {
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

/** A "wipe this store" button: each panel owns exactly its own store's reset. */
export const WipeStoreButton = ({ store, storeTitle }: { store: StringStore, storeTitle: string }) => {
  const wipe = () => {
    if (! window.confirm(`Wipe every row of ${storeTitle}?`)) { return }
    for (const ckey of store.ckeys()) { store.erase(ckey) }
  }
  return <button className="mini danger" onClick={wipe}>wipe</button>
}
