import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultError, type Vault } from 'safebyok'
import { PassphraseModal } from '../src/passphrase-modal'

/** Just enough of a Vault for the dialog to read its state; it never unlocks one here. */
const vaultInState = (state: 'absent' | 'locked') => ({ getSnapshot: () => ({ state }) }) as unknown as Vault

/** The dialog's `onDone` for tests that never submit. */
const noop = (_unlocked: boolean) => undefined

afterEach(cleanup)

describe("PassphraseModal", () => {
  it("tells a user choosing a passphrase that nobody can recover it", () => {
    render(<PassphraseModal vault={vaultInState('absent')} onDone={noop} />)
    expect(screen.getByText('Choose a vault passphrase')).to.not.be.null
    expect(screen.getByText(/Nobody can recover it for you/)).to.not.be.null
  })

  it("tells a user unlocking that a forgotten passphrase cannot be recovered", () => {
    render(<PassphraseModal vault={vaultInState('locked')} onDone={noop} />)
    expect(screen.getByText('Unlock your vault')).to.not.be.null
    expect(screen.getByText(/forgotten passphrase cannot be recovered/)).to.not.be.null
  })

  it("closes as if dismissed when its unlock loses to a lock() called meanwhile", async () => {
    const outlocked = {
      getSnapshot: () => ({ state: 'locked' }),
      unlock:      () => Promise.reject(new VaultError('vault_locked', 'The vault was locked while this unlock was under way.')),
    } as unknown as Vault
    const heard: boolean[] = []
    render(<PassphraseModal vault={outlocked} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw one' } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(heard).to.deep.equal([false]) })
  })
})
