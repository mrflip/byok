import { dbStore, vaultDbInspector } from '../../lib/stores'
import { StoreTable, WipeIdbButton, WipeStoreButton, useIdbRows, useStoreRows } from './StoreTable'

/**
 * Inspection panel for the pretend-remote database: everything a backend would ever see,
 * rendered straight from storage. Deletable as a unit -- see StoreTable.tsx.
 */
export const VaultDBInspectionPanel = () => {
  const vaultRows = useIdbRows(vaultDbInspector)
  const accountRows = useStoreRows(dbStore)
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
      <StoreTable rows={vaultRows} />
      <div className="row spread">
        <h4 className="quiet">fake auth&#39;s account rows <code className="quiet">safebyok-demo:db:*</code></h4>
        <WipeStoreButton store={dbStore} storeTitle="the fake auth accounts" />
      </div>
      <StoreTable rows={accountRows} />
    </section>
  )
}
