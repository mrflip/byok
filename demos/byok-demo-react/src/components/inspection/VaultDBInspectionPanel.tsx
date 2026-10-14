import { dbStore } from '../../lib/stores'
import { StoreTable, WipeStoreButton, useStoreRows } from './StoreTable'

/**
 * Inspection panel for the pretend-remote database: everything a backend would ever see,
 * rendered straight from storage. Deletable as a unit -- see StoreTable.tsx.
 */
export const VaultDBInspectionPanel = () => {
  const rows = useStoreRows(dbStore)
  return (
    <section className="inspection-panel">
      <div className="row spread">
        <h3>☁️ The backend database <code className="quiet">byok-demo:db:*</code></h3>
        <WipeStoreButton store={dbStore} storeTitle="the pretend backend" />
      </div>
      <p className="quiet">
        Everything a server would ever see. In the real library the ⚠️ fields are ciphertext,
        sealed with keys that never leave your device; this stub stores them in plaintext.
      </p>
      <StoreTable rows={rows} />
    </section>
  )
}
