import { useSyncExternalStore } from 'react'
import { dbStore, outage, vaultDbInspector } from '../../lib/stores'
import { StoreTable, WipeIdbButton, WipeStoreButton, useIdbRows, useStoreRows } from './StoreTable'

/**
 * Inspection panel for the pretend-remote database: everything a backend would ever see,
 * rendered straight from storage. Deletable as a unit -- see StoreTable.tsx.
 */
export const VaultDBInspectionPanel = () => {
  const vaultRows = useIdbRows(vaultDbInspector)
  const accountRows = useStoreRows(dbStore)
  const down = useSyncExternalStore(outage.subscribe, outage.isDown)
  return (
    <section className="inspection-panel">
      <div className="row spread">
        <h3>☁️ The backend database <code className="quiet">IndexedDB safebyok_demo:vault_db</code></h3>
        <WipeIdbButton inspector={vaultDbInspector} storeTitle="the pretend backend" />
      </div>
      <p className="quiet">
        Everything a server would ever see. The 🔐 fields are ciphertext, sealed with keys that
        never leave your device: holding this database opens nothing.
      </p>
      <label className="row">
        <input type="checkbox" checked={down} onChange={(event) => { outage.setDown(event.target.checked) }} />
        Pretend the backend is down: every storage call fails. Sign out and back in to see the
        dashboard say so in place, then switch this off and press its Retry.
      </label>
      <StoreTable rows={vaultRows} />
      <div className="row spread">
        <h4 className="quiet">fake auth&#39;s account rows <code className="quiet">safebyok-demo:db:*</code></h4>
        <WipeStoreButton store={dbStore} storeTitle="the fake auth accounts" />
      </div>
      <StoreTable rows={accountRows} />
    </section>
  )
}
