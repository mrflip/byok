import { Component, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultError, type Vault } from 'safebyok'
import { PassphraseModal } from '../src/passphrase-modal'

/** Just enough of a Vault for the dialog to read its state; it never unlocks one here. */
const vaultInState = (state: 'absent' | 'locked') => ({ getSnapshot: () => ({ state }) }) as unknown as Vault

/** A locked Vault whose unlock runs `unlock`, which gets the passphrase the dialog submits. */
const vaultUnlockingWith = (unlock: (passphrase: string) => Promise<void>) => (
  { getSnapshot: () => ({ state: 'locked' }), unlock } as unknown as Vault
)

/** The dialog's `onDone` for tests that never submit. */
const noop = (_unlocked: boolean) => undefined

/** Types the passphrase in the dialog and presses Unlock. */
const submitPassphrase = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Unlock'))
}

/** An error boundary that shows what it caught, as a host's would. */
class Catcher extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'not an Error' } }
  override render() { return this.state.caught === null ? this.props.children : <p>{`caught: ${this.state.caught}`}</p> }
}

/** A locked Vault whose every unlock is refused as a wrong passphrase. */
const wrong = () => vaultUnlockingWith(() => Promise.reject(new VaultError('wrong_passphrase', 'That passphrase did not open the vault.')))

afterEach(cleanup)

describe("PassphraseModal", () => {
  it("tells a user choosing a passphrase that nobody can recover it", () => {
    render(<PassphraseModal vault={vaultInState('absent')} onDone={noop} />)
    expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
    expect(screen.queryByText(/Nobody can recover it for you/)).to.not.be.null
    expect(screen.queryByText('Create vault')).to.not.be.null
  })

  it("tells a user unlocking that a forgotten passphrase cannot be recovered", () => {
    render(<PassphraseModal vault={vaultInState('locked')} onDone={noop} />)
    expect(screen.queryByText('Unlock your vault')).to.not.be.null
    expect(screen.queryByText(/forgotten passphrase cannot be recovered/)).to.not.be.null
  })

  it("hands the typed passphrase to the vault and reports an unlock", async () => {
    const heard: boolean[] = []
    const given: string[] = []
    const vault = vaultUnlockingWith((passphrase) => { given.push(passphrase); return Promise.resolve() })
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
    expect(given).to.deep.equal(['pw one'])
  })

  it("reports a dismissal when the user cancels", () => {
    const heard: boolean[] = []
    render(<PassphraseModal vault={vaultInState('locked')} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(heard).to.deep.equal([false])
  })

  it("closes as if dismissed when its unlock loses to a lock() called meanwhile", async () => {
    const heard: boolean[] = []
    const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('vault_locked', 'The vault was locked while this unlock was under way.')))
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal([false]) })
  })

  describe("a wrong passphrase", () => {

    it("stays in the dialog with the vault's calm message, and does not report done", async () => {
      const heard: boolean[] = []
      render(<PassphraseModal vault={wrong()} onDone={(unlocked) => { heard.push(unlocked) }} />)
      submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      expect(heard).to.deep.equal([])
    })

    it("clears the message once the user types again", async () => {
      render(<PassphraseModal vault={wrong()} onDone={noop} />)
      submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw wrong again' } })
      expect(screen.queryByText('That passphrase did not open the vault.')).to.be.null
    })
  })

  describe("any other failure of the unlock", () => {
    it("shows a condition in the dialog in place, as it does a wrong passphrase", async () => {
      const heard: boolean[] = []
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('storage_unavailable', 'Storage could not be reached; try again in a moment.')))
      render(<Catcher><PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} /></Catcher>)
      submitPassphrase('pw one')
      await waitFor(() => { expect(screen.queryByText('Storage could not be reached; try again in a moment.')).to.not.be.null })
      expect(heard).to.deep.equal([])
      expect(screen.queryByText(/caught:/)).to.be.null
    })

    it("throws misuse while rendering, for the nearest error boundary", async () => {
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('vault_closed', 'The vault was closed.')))
      render(<Catcher><PassphraseModal vault={vault} onDone={noop} /></Catcher>)
      submitPassphrase('pw one')
      await waitFor(() => { expect(screen.queryByText('caught: The vault was closed.')).to.not.be.null })
    })

    it("throws a failure that is no VaultError the same way", async () => {
      const vault = vaultUnlockingWith(() => Promise.reject(new TypeError('fell over')))
      render(<Catcher><PassphraseModal vault={vault} onDone={noop} /></Catcher>)
      submitPassphrase('pw one')
      await waitFor(() => { expect(screen.queryByText('caught: fell over')).to.not.be.null })
    })
  })

  describe("how long it says an unlock lasts", () => {
    const WindowCases = [
      // regular usage:
      [undefined,         "Stays unlocked on this device for 7 days.",         'the default window is seven days'],
      [24,                "Stays unlocked on this device for 1 day.",          'one day is singular'],
      [72,                "Stays unlocked on this device for 3 days.",         'whole days read as days'],
      [8,                 "Stays unlocked on this device for 8 hours.",        'hours that do not make a day read as hours'],
      [1,                 "Stays unlocked on this device for 1 hour.",         'one hour is singular'],
      [36,                "Stays unlocked on this device for 36 hours.",       'a day and a half reads as hours'],
      [0.25,              "Stays unlocked on this device for 15 minutes.",     'a fraction of an hour reads as minutes'],
      [Infinity,          "Stays unlocked on this device until you lock it.",  'Infinity means until locked'],
      // edge cases:
      [1 / 60,            "Stays unlocked on this device for 1 minute.",       'one minute is singular'],
      [0.0001,            "Stays unlocked on this device for 1 minute.",       'a window under a minute rounds up to one'],
      [1.5,               "Stays unlocked on this device for 90 minutes.",     'an hour and a half reads as minutes'],
      [1e9,               "Stays unlocked on this device until you lock it.",  'a window longer than the vault can count means until locked'],
    ] as const

    for (const [hours, expected, blurb] of WindowCases) {
      it(blurb, () => {
        render(<PassphraseModal vault={vaultInState('locked')} reentryHours={hours} onDone={noop} />)
        expect(screen.queryByText(expected)).to.not.be.null
      })
    }

    for (const hours of [0, -1, NaN]) {
      it(`refuses ${String(hours)} hours, which no vault could have been opened with`, () => {
        render(<Catcher><PassphraseModal vault={vaultInState('locked')} reentryHours={hours} onDone={noop} /></Catcher>)
        expect(screen.queryByText(/caught: .*reentryHours is a number of hours greater than zero/)).to.not.be.null
      })
    }
  })
})
