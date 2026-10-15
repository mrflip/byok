import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { localVaultDB, memoryDeviceDB, memoryStore, openVault } from 'safebyok'
import type { Lockbox, StringStore, VaultBundle, VaultScope, Whisper } from 'safebyok'
import type { ComponentApi } from '../src/component-api'
import { modules, schema } from '../src/test'
// From the core by relative path, as no public export offers them: its cheap test deriver (one
// SHA-256 in place of Argon2id), and the Zod records (`safebyok` exports VaultBundle as a type only).
import { testDeriver } from '../../../tests/helpers'
import * as Records from '../../../src/types'

/** The component's functions, called directly as a root app's: no host wrapper, no auth. */
export const vaults = anyApi.vaults as unknown as ComponentApi['vaults']

/**
 * A fresh in-memory backend holding only the component, its functions at the root. With
 * `transactionLimits`, it enforces Convex's own per-transaction limits.
 */
export const componentTest = (transactionLimits = false) => convexTest({ schema, modules, transactionLimits })

export const scopeOf = (userId: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel })

/** A shape-valid ciphered value that opens nothing: for tests that never decrypt. */
export const fakeCiphered = (tag: string) => ({ cipher_iv_b64: `iv-${tag}`, ciphertext_b64: `ct-${tag}` })

/** A shape-valid VaultBundle whose envelope is fake. */
export const bundleOf = (userId: string, overrides: Partial<VaultBundle> = {}): VaultBundle => ({
  format:              'safebyok-vault-v1',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  passphrase_epoch:    1,
  key_deriver_label:   'test_digest_v0',
  passphrase_salt_b64: 'c2FsdC1mb3ItdGVzdHM',
  vault_key_passphrase_wrapped: fakeCiphered(`bundle-${userId}`),
  created_at:          '2026-10-15T00:00:00.000Z',
  updated_at:          '2026-10-15T00:00:00.000Z',
  ...overrides,
})

/** A shape-valid Lockbox whose ciphered fields are fake. */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<Lockbox> = {}): Lockbox => ({
  format:              'safebyok-lockbox-v1',
  boxlabel,
  revision_id:         `rev-${tag}`,
  lockbox_key_wrapped: fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:    fakeCiphered(`whisper-${tag}`),
  note:                'a test box',
  created_at:          '2026-10-15T00:00:00.000Z',
  updated_at:          '2026-10-15T00:00:00.000Z',
  ...overrides,
})

/** The whispers a real vault is made with: obvious fakes, never real keys. */
export const RealWhispers: Record<string, { whisper: Whisper, note?: string }> = {
  anthropic_api_key: { whisper: 'sk-ant-test-not-a-real-key', note: 'work account' },
  openai_api_key:    { whisper: { apiKey: 'sk-test-not-a-real-key', orgId: null } },
}

export const RealPassphrase = 'correct horse battery staple'

/** Opens a vault for `userId` over `store` the way an app does, deriving through the cheap test deriver. */
export const openOver = (store: StringStore, userId = 'u1') => openVault({
  applabel: 'acme', userId, vaultlabel: 'main', vaultDB: localVaultDB(store), deviceDB: memoryDeviceDB(), keyDeriver: testDeriver,
})

/**
 * A real vault, made by the core's own code: a bundle and a lockbox per {@link RealWhispers}
 * entry, each record exactly as the core stores it, read back from its in-memory store by ckey.
 */
export const realRecords = async (userId = 'u1') => {
  const store = memoryStore()
  const vault = await openOver(store, userId)
  await vault.unlock(RealPassphrase)
  for (const [boxlabel, { whisper, note }] of Object.entries(RealWhispers)) {
    await vault.store(boxlabel, whisper, note === undefined ? {} : { note })
  }
  vault.close()
  const rows = store.ckeys().map((ckey) => ({ ckey, record: JSON.parse(store.read(ckey) ?? 'null') as unknown }))
  const bundleRow = rows.find((row) => Records.VaultBundle.safeParse(row.record).success)
  if (! bundleRow) { throw new Error('the core stored no bundle') }
  return {
    bundleCkey: bundleRow.ckey,
    bundle:     Records.VaultBundle.parse(bundleRow.record),
    boxes:      rows.flatMap((row) => {
      const checked = Records.Lockbox.safeParse(row.record)
      return checked.success ? [{ ckey: row.ckey, lockbox: checked.data }] : []
    }),
  }
}
