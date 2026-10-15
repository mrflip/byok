import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, type KeyDeriver, type Vault, type VaultDB } from 'safebyok'
import { testDeriver } from 'safebyok/testing'
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { VaultProvider, useVault, useVaultSnapshot, type VaultProviderProps } from '../src/vault-provider'

/** A probe component exercising the binding the way a host app would. */
const Probe = () => {
  const { vault, openError, retryOpen, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [outcome, setOutcome] = useState('')

  if (openError !== null) {
    return <p><span data-testid="state">{`open error: ${openError.kind}`}</span> <button onClick={retryOpen}>Retry</button></p>
  }
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
  const tree = (userId: string | null, caught: unknown[] = []) => (
    <CatchingBoundary caught={caught}>
      <VaultProvider applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB} deviceDB={deviceDB} keyDeriver={testDeriver}>
        <Probe />
      </VaultProvider>
    </CatchingBoundary>
  )
  const mount = (userId: string | null, caught: unknown[] = []) => render(tree(userId, caught))
  return { vaultDB, deviceDB, tree, mount }
}

/**
 * Counts the storage watches `vaultDB` opens and closes again, so a test can see that a failed
 * open left none running behind it.
 */
const tallyWatches = (vaultDB: VaultDB) => {
  const tally = { opened: 0, closed: 0 }
  const subscribe = vaultDB.subscribe.bind(vaultDB)
  vi.spyOn(vaultDB, 'subscribe').mockImplementation((scope, onChange) => {
    tally.opened += 1
    const unsubscribe = subscribe(scope, onChange)
    return () => {
      tally.closed += 1
      unsubscribe()
    }
  })
  return tally
}

const unreachable = () => new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')

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

/** openError's @example, as a host would write it. */
const OpenErrorExample = () => {
  const { openError, retryOpen } = useVault()
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  return <span>opened</span>
}

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
        keyDeriver={testDeriver} clock={{ now: () => 1000 }} forcePassphraseReentryHours={1} maxWhisperBytes={8} maxLockboxes={1}>
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
            deviceDB={memoryDeviceDB()} keyDeriver={testDeriver}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(caught).to.have.length(1)
      expect(isVaultError(caught[0], 'bad_label')).to.be.true
    })

    it("throws a bad option to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={localVaultDB(memoryStore())}
            deviceDB={memoryDeviceDB()} keyDeriver={testDeriver} maxLockboxes={0}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
    })

    it("throws an error that is no VaultError to the boundary: an adapter's bug, not a condition", async () => {
      hushConsole()
      const world = makeWorld()
      const bug = new TypeError('adapter.readBundle is not a function')
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(bug)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('boundary') })
      expect(caught[0]).to.eq(bug)
    })

    const ConditionCases = [
      ["storage_unavailable", 'storage that cannot be reached'],
      ["not_permitted",       'a user storage will not serve, as when signed out of the backend'],
      ["corrupt_record",      'a stored record that fails verification'],
    ] as const

    for (const [kind, blurb] of ConditionCases) {
      it(`hands down ${blurb} as openError, in place, leaving the boundary alone`, async () => {
        const world = makeWorld()
        const condition = new VaultError(kind, 'Something the app can tell the user about.')
        vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(condition)
        const caught: unknown[] = []
        world.mount('u1', caught)
        await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq(`open error: ${kind}`) })
        expect(caught).to.have.length(0)
      })
    }

    it("hands down the very VaultError, and no vault beside it", async () => {
      const world = makeWorld()
      const trouble = unreachable()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(trouble)
      const seen: { openError: VaultError | null, vault: Vault | null } = { openError: null, vault: null }
      const Grab = () => {
        const { openError, vault } = useVault()
        useEffect(() => { seen.openError = openError; seen.vault = vault }, [openError, vault])
        return null
      }
      render(
        <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={testDeriver}>
          <Grab />
        </VaultProvider>,
      )
      await waitFor(() => { expect(seen.openError).to.eq(trouble) })
      expect(seen.vault).to.be.null
    })

    it("retryOpen opens again: once storage relents, the vault opens and openError clears", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(unreachable())
      world.mount('u1')
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: storage_unavailable') })
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    })

    it("a retry that fails again hands down the fresh error", async () => {
      const world = makeWorld()
      const first = unreachable()
      const second = new VaultError('not_permitted', 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(first).mockRejectedValueOnce(second)
      world.mount('u1')
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: storage_unavailable') })
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: not_permitted') })
    })

    it("leaves no storage watch behind a failed open: after a retry, exactly one is live", async () => {
      const world = makeWorld()
      const tally = tallyWatches(world.vaultDB)
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(unreachable()).mockRejectedValueOnce(unreachable())
      world.mount('u1')
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: storage_unavailable') })
      expect(tally).to.deep.equal({ opened: 1, closed: 1 })
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(tally.opened).to.eq(2) })
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: storage_unavailable') })
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
      expect(tally.opened - tally.closed).to.eq(1)
    })

    it("retryOpen does nothing while there is no openError", async () => {
      const world = makeWorld()
      const reads = vi.spyOn(world.vaultDB, 'readBundle')
      const seen: { retryOpen: () => void } = { retryOpen: noop }
      const Grab = () => {
        const { retryOpen } = useVault()
        useEffect(() => { seen.retryOpen = retryOpen }, [retryOpen])
        return <Probe />
      }
      render(
        <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={testDeriver}>
          <Grab />
        </VaultProvider>,
      )
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
      const readsBefore = reads.mock.calls.length
      await act(async () => {
        seen.retryOpen()
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      })
      expect(reads.mock.calls.length).to.eq(readsBefore)
      expect(screen.getByTestId('state').textContent).to.eq('absent')
    })

    it("clears openError when the user signs out", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(unreachable())
      const { rerender } = world.mount('u1')
      await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('open error: storage_unavailable') })
      rerender(world.tree(null))
      expect(screen.getByTestId('state').textContent).to.eq('no vault')
    })

    it("matches openError's @example: the message and its Retry button, in place", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(unreachable())
      render(
        <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={testDeriver}>
          <OpenErrorExample />
        </VaultProvider>,
      )
      const notice = await screen.findByText("Can't reach your vault.")
      expect(notice.tagName).to.eq('P')
      fireEvent.click(screen.getByText('Retry'))
      const opened = await screen.findByText('opened')
      expect(opened.tagName).to.eq('SPAN')
    })

    it("throws a rejection of null too: the failure is held, not the value", async () => {
      hushConsole()
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(null)
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={testDeriver}>
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
          <VaultProvider applabel="acme" vaultlabel="main" userId={userId} vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={testDeriver}>
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
            deviceDB={memoryDeviceDB()} keyDeriver={testDeriver}>
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
