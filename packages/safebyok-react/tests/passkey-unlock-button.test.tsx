import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultError, localVaultDB, memoryDeviceDB, memoryStore, openVault, type Vault } from 'safebyok'
import { createPasskey } from '../src/passkey'
import { PasskeyUnlockButton } from '../src/passkey-unlock-button'
import { PassphraseModal } from '../src/passphrase-modal'
import * as TH from './test-helpers'

/** A locked vault in memory with one passkey, made through the fake authenticator, and that authenticator. */
const lockedVaultWithPasskey = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const vaultDB = localVaultDB(memoryStore())
  const open = async () => await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver })
  const maker = await open()
  await maker.unlock('pw')
  const passkey = await createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } })
  if (passkey === null) { throw new Error('the fake authenticator made no passkey') }
  await maker.addPasskey('pw', passkey, { unlocklabel: 'laptop' })
  return { authenticator, vault: await open() }
}

/** A vault that refuses every unlock with `err`, and lists one passkey. */
const vaultRefusing = (err: Error, credentialId: string) => ({
  getSnapshot: () => ({ state: 'locked', unlocks: [TH.passkeyEnvelopeOf('laptop', { credential_id: credentialId })] }),
  unlock:      () => Promise.reject(err),
}) as unknown as Vault

/** Catches what its children throw while rendering, and shows the message. */
class Boundary extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'something' } }
  override render() { return this.state.caught === null ? this.props.children : <p>caught: {this.state.caught}</p> }
}

const noop = () => undefined

afterEach(() => {
  cleanup()
  TH.uninstallFakeAuthenticator()
})

describe("PasskeyUnlockButton", () => {
  it("unlocks the vault with the passkey the user touches", async () => {
    const { vault } = await lockedVaultWithPasskey()
    const heard: boolean[] = []
    render(<PasskeyUnlockButton vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is not there in a browser without WebAuthn, nor for a vault with no passkey", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.uninstall()
    render(<PasskeyUnlockButton vault={vault} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
    TH.installFakeAuthenticator()
    const passphraseOnly = { getSnapshot: () => ({ state: 'locked', unlocks: [TH.envelopeOf('passphrase')] }) } as unknown as Vault
    render(<PasskeyUnlockButton vault={passphraseOnly} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("does nothing when the user dismisses the prompt", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.refuseNext('NotAllowedError')
    const heard: string[] = []
    render(<PasskeyUnlockButton vault={vault} onDone={(unlocked) => { heard.push(String(unlocked)) }} onGripe={(gripe) => { heard.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(1) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use a passkey' }).disabled).to.be.false })
    expect(heard).to.deep.equal([])
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("hands a condition's message to onGripe, and a lock that wins to onDone(false)", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: string[] = []
    render(<PasskeyUnlockButton vault={vaultRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal(["That passkey's answer didn't unlock the vault."]) })
    cleanup()
    const heard: boolean[] = []
    render(<PasskeyUnlockButton vault={vaultRefusing(new VaultError('vault_locked', 'Locked meanwhile.'), credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([false]) })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("throws misuse to the nearest error boundary", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const misused = vaultRefusing(new VaultError('vault_closed', 'This vault handle was closed.'), credentialId)
    render(<Boundary><PasskeyUnlockButton vault={misused} onDone={noop} onGripe={noop} /></Boundary>)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(screen.getByText('caught: This vault handle was closed.')).to.not.be.null })
  })
})

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey beside the passphrase, and closes unlocked when it is used", async () => {
    const { vault } = await lockedVaultWithPasskey()
    const heard: boolean[] = []
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
  })

  it("offers no passkey to a user choosing the vault's first passphrase", () => {
    TH.installFakeAuthenticator()
    const absent = { getSnapshot: () => ({ state: 'absent', unlocks: [] }) } as unknown as Vault
    render(<PassphraseModal vault={absent} onDone={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
  })
})
