/**
 * The demo's test helpers, star-imported as `TH`: everything `safebyok/testing` exports, and the
 * means to render a component as the demo's App does -- inside a VaultProvider -- over stores in
 * memory, to fill its vault beforehand as another device would, and to answer the passphrase
 * dialog the provider raises.
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { localVaultDB, memoryDeviceDB, memoryStore, openVault, type Whisper } from 'safebyok'
import { VaultProvider } from 'safebyok-react'
import { testDeriver } from 'safebyok/testing'

export * from 'safebyok/testing'

/** The passphrase every vault in the demo's tests is made with: an obvious fake. */
export const Passphrase = 'correct horse battery staple'

/**
 * A fresh world in memory for the demo's components: the vault's two stores; a render that wraps
 * a component in a VaultProvider over them, signed in as `userId` and deriving through the cheap
 * test deriver; an opener for a look at the vault from outside the page; and a seeder that fills
 * the vault beforehand from another device, so the page finds it locked. Its vaults are in the
 * `acme` app, as `scopeOf` has them.
 *
 * @returns `vaultDB` and `deviceDB`, `renderInVault(ui, userId?)`, `open(userId?)` and
 *   `seed(whispers, userId?)`. The user is `u1` unless named.
 *
 * @example
 *   const world = TH.makeWorld()
 *   await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
 *   world.renderInVault(<VaultDashboard />)
 */
export const makeWorld = () => {
  const vaultDB = localVaultDB(memoryStore())
  const deviceDB = memoryDeviceDB()
  const opts = { applabel: 'acme', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: testDeriver }

  const renderInVault = (ui: ReactNode, userId: string | null = 'u1') => (
    render(<VaultProvider {...opts} userId={userId}>{ui}</VaultProvider>)
  )

  const open = (userId = 'u1') => openVault({ ...opts, userId })

  const seed = async (whispers: Record<string, Whisper>, userId = 'u1') => {
    const vault = await openVault({ ...opts, userId, deviceDB: memoryDeviceDB() })
    await vault.unlock(Passphrase)
    for (const [boxlabel, whisper] of Object.entries(whispers)) {
      await vault.store(boxlabel, whisper)
    }
    vault.close()
  }

  return { vaultDB, deviceDB, renderInVault, open, seed }
}

/**
 * Answers the passphrase dialog once it shows: types `passphrase` and submits, whether the dialog
 * is choosing a new vault's passphrase or unlocking one.
 *
 * @param passphrase - What to type. Default: {@link Passphrase}.
 *
 * @example
 *   fireEvent.click(screen.getByText('view'))
 *   await TH.answerPassphraseDialog()
 */
export const answerPassphraseDialog = async (passphrase = Passphrase) => {
  const field = await screen.findByPlaceholderText('vault passphrase')
  fireEvent.change(field, { target: { value: passphrase } })
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase dialog has no form to submit') }
  fireEvent.submit(form)
}
