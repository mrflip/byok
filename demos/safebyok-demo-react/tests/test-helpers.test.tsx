// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useVault, useVaultSnapshot } from 'safebyok-react'
import * as TH from './test-helpers'

afterEach(cleanup)

/** The vault's state, and a button that reads a lockbox through withUnlockedVault. */
const Probe = () => {
  const { vault, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  return (
    <p>
      <span data-testid="vault">{vault === null ? 'none' : 'open'}</span>
      <span data-testid="state">{snapshot.state}</span>
      <span data-testid="boxes">{snapshot.boxes.map((box) => box.boxlabel).join(',')}</span>
      <button onClick={() => { void withUnlockedVault(() => vault?.read('anthropic_api_key') ?? Promise.resolve(null)) }}>read</button>
    </p>
  )
}

describe("makeWorld", () => {
  it("renders a component inside a vault for u1, absent until something is stored", async () => {
    TH.makeWorld().renderInVault(<Probe />)
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
  })

  it("renders no vault for a signed-out page", () => {
    TH.makeWorld().renderInVault(<Probe />, null)
    expect(screen.getByTestId('vault').textContent).to.eq('none')
  })

  it("seeds the vault from another device, so the page finds it filled and locked", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<Probe />)
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('locked') })
    expect(screen.getByTestId('boxes').textContent).to.eq('anthropic_api_key')
  })

  it("opens the same vault from outside the page, in the acme app as scopeOf has it", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const vault = await world.open()
    await vault.unlock(TH.Passphrase)
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await world.vaultDB.readBundle(TH.scopeOf('u1'))).to.not.be.null
  })
})

describe("answerPassphraseDialog", () => {
  it("unlocks a locked vault through the dialog withUnlockedVault raises", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<Probe />)
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('locked') })
    fireEvent.click(screen.getByRole('button', { name: 'read' }))
    await TH.answerPassphraseDialog()
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('unlocked') })
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
  })

  it("types the passphrase it is given, so a wrong one leaves the dialog asking", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<Probe />)
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('locked') })
    fireEvent.click(screen.getByRole('button', { name: 'read' }))
    await TH.answerPassphraseDialog('not the passphrase')
    await screen.findByText(/passphrase/i, { selector: '.gripe' })
    expect(screen.getByTestId('state').textContent).to.eq('locked')
  })
})
