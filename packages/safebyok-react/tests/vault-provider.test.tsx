import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, type KeyDeriver, type Vault } from 'safebyok'
import * as TH from 'safebyok/testing'
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { VaultProvider, useVault, useVaultSnapshot, type VaultProviderProps } from '../src/vault-provider'

/** A probe component exercising the binding the way a host app would. */
const Probe = () => {
  const { vault, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [outcome, setOutcome] = useState('')

  if (vault === null) { return <span data-testid="state">no vault</span> }

  const put = () => {
    void withUnlockedVault(() => vault.store('anthropic_api_key', 'sk-fake'))
      .then((stored) => { setOutcome(stored === null ? 'dismissed' : 'stored') })
  }
  // A whisper is never null, so null from withUnlockedVault can only mean "dismissed".
  const grab = () => {
    void withUnlockedVault(() => vault.read('anthropic_api_key'))
      .then((whisper) => { setOutcome(whisper === null ? 'dismissed' : `read:${JSON.stringify(whisper)}`) })
  }

  return (
    <div>
      <span data-testid="state">{snapshot.state}</span>
      <span data-testid="boxcount">{snapshot.boxes.length}</span>
      <span data-testid="outcome">{outcome}</span>
      <button onClick={put}>put</button>
      <button onClick={grab}>grab</button>
    </div>
  )
}

const makeWorld = () => {
  const vaultDB = localVaultDB(memoryStore())
  const deviceDB = memoryDeviceDB()
  const mount = (userId: string | null) => render(
    <VaultProvider applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB} deviceDB={deviceDB} keyDeriver={TH.testDeriver}>
      <Probe />
    </VaultProvider>,
  )
  return { vaultDB, deviceDB, mount }
}

/** Catches what its children throw while rendering, keeping the very thrown value for the test. */
class CatchingBoundary extends Component<{ caught: unknown[], children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch(err: Error, _info: ErrorInfo) { this.props.caught.push(err) }
  override render() { return this.state.failed ? <span data-testid="state">boundary</span> : this.props.children }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** React reports a boundary-caught render error on the console; the suite stays quiet about it. */
const hushConsole = () => vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ })

/** Stands in for a function a test replaces before it is called. */
const noop = () => { /* replaced before use */ }

describe("VaultProvider", () => {
  it("provides no vault without a signed-in user", () => {
    const world = makeWorld()
    world.mount(null)
    expect(screen.getByTestId('state').textContent).to.eq('no vault')
  })

  it("opens the vault for the signed-in user, settling into 'absent' with no dialog", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    expect(screen.queryByText('Choose a vault passphrase')).to.be.null
  })

  it("an action through withUnlockedVault summons the dialog, and unlocking retries it", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })

    fireEvent.click(screen.getByText('put'))
    const passphraseInput = await screen.findByPlaceholderText('vault passphrase')
    expect(screen.getByText('Choose a vault passphrase')).to.not.be.null

    fireEvent.change(passphraseInput, { target: { value: 'correct horse battery staple' } })
    fireEvent.click(screen.getByText('Create vault'))

    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('stored') })
    expect(screen.getByTestId('state').textContent).to.eq('unlocked')
    await waitFor(() => { expect(screen.getByTestId('boxcount').textContent).to.eq('1') })
  })

  it("once unlocked, further actions run without the dialog", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    fireEvent.click(screen.getByText('put'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'a fine passphrase' } })
    fireEvent.click(screen.getByText('Create vault'))
    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('stored') })

    fireEvent.click(screen.getByText('grab'))
    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('read:"sk-fake"') })
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
  })

  it("a wrong passphrase keeps the dialog open with a calm gripe; the right one proceeds", async () => {
    const world = makeWorld()
    const first = world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    fireEvent.click(screen.getByText('put'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'the right one' } })
    fireEvent.click(screen.getByText('Create vault'))
    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('stored') })
    first.unmount()

    // A fresh mount after the remembered unlock is gone: lock it by clearing the device side.
    await world.deviceDB.eraseAll()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('locked') })
    fireEvent.click(screen.getByText('grab'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'the wrong one' } })
    fireEvent.click(screen.getByText('Unlock'))
    await screen.findByText("That passphrase didn't unlock the vault. Check for typos and try again.")

    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'the right one' } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('read:"sk-fake"') })
  })

  it("dismissing the dialog resolves the action to null, and nothing is stored", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq('dismissed') })
    expect(screen.getByTestId('state').textContent).to.eq('absent')
    expect(screen.getByTestId('boxcount').textContent).to.eq('0')
  })

  it("asks for a keyDeriver outright, as openVault does", () => {
    expectTypeOf<Pick<VaultProviderProps, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("passes every openVault option through, as given", async () => {
    const seen: { vault: Vault | null } = { vault: null }
    const Grab = () => {
      const { vault } = useVault()
      useEffect(() => { seen.vault = vault }, [vault])
      return null
    }
    render(
      <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={localVaultDB(memoryStore())} deviceDB={memoryDeviceDB()}
        keyDeriver={TH.testDeriver} clock={{ now: () => 1000 }} forcePassphraseReentryHours={1} maxWhisperBytes={8} maxLockboxes={1}>
        <Grab />
      </VaultProvider>,
    )
    await waitFor(() => { expect(seen.vault).to.not.be.null })
    const { vault } = seen
    if (vault === null) { throw new Error('the provider opened no vault') }

    await vault.unlock('correct horse battery staple')
    // One hour, 3,600,000 ms, after the clock's 1000.
    expect(vault.getSnapshot().askPassphraseAt).to.eq(3_601_000)
    // 'sk-fake' is nine bytes of JSON, one over the limit given.
    let refusal: unknown = null
    try {
      await vault.store('anthropic_api_key', 'sk-fake')
    } catch (err) {
      refusal = err
    }
    expect(isVaultError(refusal, 'whisper_too_large')).to.be.true
    // One lockbox fills the vault: a second is refused for room.
    await vault.store('openai_api_key', 'sk')
    let full: unknown = null
    try {
      await vault.store('mistral_api_key', 'sk')
    } catch (err) {
      full = err
    }
    expect(isVaultError(full, 'vault_full')).to.be.true
  })

  describe("when openVault rejects", () => {
    it("throws a bad label to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="Not A Label" vaultlabel="main" userId="u1" vaultDB={localVaultDB(memoryStore())}
            deviceDB={memoryDeviceDB()} keyDeriver={TH.testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(caught).to.have.length(1)
      expect(isVaultError(caught[0], 'bad_label')).to.be.true
    })

    it("throws storage trouble to the error boundary too", async () => {
      hushConsole()
      const world = makeWorld()
      const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(trouble)
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={TH.testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(caught[0]).to.eq(trouble)
    })

    it("throws a rejection of null too: the failure is held, not the value", async () => {
      hushConsole()
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(null)
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={TH.testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(caught).to.have.length(1)
      expect(caught[0]).to.be.null
    })

    it("ignores a rejection that arrives after the user signed out", async () => {
      hushConsole()
      const world = makeWorld()
      let rejectRead: (err: unknown) => void = noop
      // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Promise.withResolvers is ES2024, and every tsconfig's lib stops at ES2023
      const readBundle = vi.spyOn(world.vaultDB, 'readBundle').mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject }))
      const caught: unknown[] = []
      const tree = (userId: string | null) => (
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="acme" vaultlabel="main" userId={userId} vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={TH.testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>
      )
      const { rerender } = render(tree('u1'))
      await waitFor(() => { expect(readBundle).toHaveBeenCalledOnce() })
      rerender(tree(null))
      await act(async () => {
        rejectRead(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      })
      expect(screen.getByTestId('state').textContent).to.eq('no vault')
      expect(caught).to.have.length(0)
    })

    it("opens nothing, and so throws nothing, while nobody is signed in", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="Not A Label" vaultlabel="main" userId={null} vaultDB={localVaultDB(memoryStore())}
            deviceDB={memoryDeviceDB()} keyDeriver={TH.testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await new Promise((resolve) => { setTimeout(resolve, 0) })
      expect(screen.getByTestId('state').textContent).to.eq('no vault')
      expect(caught).to.have.length(0)
    })
  })
})
