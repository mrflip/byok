// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultDBInspectionPanel } from '../../../src/components/inspection/VaultDBInspectionPanel'
import { dbStore, outage, vaultDB } from '../../../src/lib/stores'
import * as TH from '../../test-helpers'

afterEach(() => { outage.setDown(false) })

describe("VaultDBInspectionPanel", () => {
  it("shows the backend's vault rows as they land, ciphertext marked as such", async () => {
    render(<VaultDBInspectionPanel />)
    await act(() => vaultDB.createBundle(TH.bundleOf('u1')))
    await waitFor(() => { expect(screen.getAllByText('🔐 ciphertext')).to.have.lengthOf(1) })
    expect(screen.getByText(/ct-bundle-u1/)).to.not.be.null
  })

  it("shows the fake auth's account rows beside them", () => {
    dbStore.write('account:safebyok_demo:margo', '{"user_id":"user_0123456789abcdef","userlabel":"margo"}')
    render(<VaultDBInspectionPanel />)
    expect(screen.getByText(/"userlabel":"margo"/)).to.not.be.null
  })

  it("takes the pretend backend down from its switch, and brings it back", () => {
    render(<VaultDBInspectionPanel />)
    const outageSwitch = screen.getByRole('checkbox')
    fireEvent.click(outageSwitch)
    expect(outage.isDown()).to.be.true
    expect((outageSwitch as HTMLInputElement).checked).to.be.true
    fireEvent.click(outageSwitch)
    expect(outage.isDown()).to.be.false
  })
})
