// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { idbDeviceDB } from 'safebyok/idb'
import { DeviceDBInspectionPanel } from '../../../src/components/inspection/DeviceDBInspectionPanel'
import { Applabel, deviceStore } from '../../../src/lib/stores'
import * as TH from '../../test-helpers'

afterEach(cleanup)

describe("DeviceDBInspectionPanel", () => {
  it("shows this device's remembered unlock as it lands, its localUnlockKey a handle", async () => {
    render(<DeviceDBInspectionPanel />)
    const unlock = { ...(await TH.unlockOf('u1')), applabel: Applabel }
    await act(() => idbDeviceDB({ dbName: Applabel }).writeUnlock(unlock))
    await waitFor(() => { expect(screen.getAllByText('🔑 non-extractable key')).to.have.lengthOf(1) })
    expect(screen.getByText(/«CryptoKey non-extractable handle»/)).to.not.be.null
  })

  it("shows the fake auth's session beside it", () => {
    deviceStore.write('session:safebyok_demo', '{"userId":"user_0123456789abcdef","userlabel":"margo"}')
    render(<DeviceDBInspectionPanel />)
    expect(screen.getByText(/"userlabel":"margo"/)).to.not.be.null
  })
})
