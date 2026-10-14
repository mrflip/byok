import { deviceDbInspector, deviceStore } from '../../lib/stores'
import { StoreTable, WipeIdbButton, WipeStoreButton, useIdbRows, useStoreRows } from './StoreTable'

/**
 * Inspection panel for this device's own storage: the remembered unlock and the app session.
 * Genuinely device-local -- never sent anywhere. Deletable as a unit -- see StoreTable.tsx.
 */
export const DeviceDBInspectionPanel = () => {
  const unlockRows = useIdbRows(deviceDbInspector)
  const sessionRows = useStoreRows(deviceStore)
  return (
    <section className="inspection-panel">
      <div className="row spread">
        <h3>💻 This device <code className="quiet">IndexedDB safebyok_demo:device_db</code></h3>
        <WipeIdbButton inspector={deviceDbInspector} storeTitle="this device's remembered unlocks" />
      </div>
      <p className="quiet">
        Stays in this browser: the remembered unlock that spares you the passphrase for seven
        days. Its 🔑 localUnlockKey is a handle IndexedDB keeps without the browser ever exposing
        the key&#39;s bytes -- not even to this page. Never sent anywhere.
      </p>
      <StoreTable rows={unlockRows} />
      <div className="row spread">
        <h4 className="quiet">fake auth&#39;s session <code className="quiet">safebyok-demo:device:*</code></h4>
        <WipeStoreButton store={deviceStore} storeTitle="this device's session" />
      </div>
      <StoreTable rows={sessionRows} />
    </section>
  )
}
