import { deviceStore } from '../../lib/stores'
import { StoreTable, WipeStoreButton, useStoreRows } from './StoreTable'

/**
 * Inspection panel for this device's own storage: the app session and the remembered unlock.
 * Genuinely device-local -- never sent anywhere. Deletable as a unit -- see StoreTable.tsx.
 */
export const DeviceDBInspectionPanel = () => {
  const rows = useStoreRows(deviceStore)
  return (
    <section className="inspection-panel">
      <div className="row spread">
        <h3>💻 This device <code className="quiet">byok-demo:device:*</code></h3>
        <WipeStoreButton store={deviceStore} storeTitle="this device's store" />
      </div>
      <p className="quiet">
        Stays in this browser: the app session, and the remembered unlock that spares you the
        passphrase for seven days. Never sent anywhere.
      </p>
      <StoreTable rows={rows} />
    </section>
  )
}
