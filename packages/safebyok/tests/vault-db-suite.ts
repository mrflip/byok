import { describe, expect, it } from 'vitest'
import type { VaultDB } from '../src/vault-db'
import * as TH from './test-helpers'

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'readBundle' | 'createBundle' | 'updateBundle' | 'readBox' | 'listBoxes' | 'updateBox' | 'eraseBox' | 'eraseVault' | 'subscribe'
>

/**
 * The behaviour every VaultDB owes, written once: each verb, each expectation holding and
 * failing, erase winning over a write, a scope with no bundle refusing, and a write or an erase
 * aimed at a vault since destroyed and made anew refusing. Run it against an adapter with a
 * factory making a fresh, empty one per test.
 *
 * Not public surface: other workspace packages import it by relative path, as the in-tree
 * adapters' tests do. It needs nothing from `src/` at runtime, and checks refusals by `kind`
 * rather than by class, so an adapter built on the published package passes the same way.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeVaultDB - A fresh, empty adapter: no record in it, and none shared with another call.
 *
 * @example
 *   describeVaultDB('localVaultDB', () => localVaultDB(memoryStore()))
 */
export const describeVaultDB = (adapterTitle: string, makeVaultDB: () => VaultDBVerbs | Promise<VaultDBVerbs>) => {
  /** A fresh adapter whose `u1` scope holds a bundle, as every lockbox write needs. */
  const withBundle = async () => {
    const vaultDB = await makeVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    return vaultDB
  }
  const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null }
  const thisVault = { vault_id: 'vault-id-u1' }

  describe(`${adapterTitle}, as a VaultDB: the bundle`, () => {
    it("has none until one is created, then reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
      expect(await vaultDB.createBundle(TH.bundleOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
    })

    it("createBundle yields to a bundle already standing: the second device gets the first's back", async () => {
      const vaultDB = await withBundle()
      const latecomer = { ...TH.bundleOf('u1'), vault_id: 'the-second-arrival' }
      expect(await vaultDB.createBundle(latecomer)).to.deep.equal(TH.bundleOf('u1'))
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
    })

    it("updateBundle lands while the standing bundle is the one proven against", async () => {
      const vaultDB = await withBundle()
      const next = { ...TH.bundleOf('u1'), passphrase_epoch: 2 }
      await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', passphrase_epoch: 1 })
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(next)
    })

    it("updateBundle refuses over a passphrase_epoch since moved on, writing nothing", async () => {
      const vaultDB = await withBundle()
      const theirs = { ...TH.bundleOf('u1'), passphrase_epoch: 2, updated_at: '2026-10-15T00:00:00.000Z' }
      await vaultDB.updateBundle(theirs, { vault_id: 'vault-id-u1', passphrase_epoch: 1 })
      const mine = { ...TH.bundleOf('u1'), passphrase_epoch: 2, updated_at: '2026-10-16T00:00:00.000Z' }
      await expectRefusal(vaultDB.updateBundle(mine, { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(theirs)
    })

    it("updateBundle refuses over a vault made anew under another vault_id", async () => {
      const vaultDB = await withBundle()
      const next = { ...TH.bundleOf('u1'), vault_id: 'vault-id-gone', passphrase_epoch: 2 }
      await expectRefusal(vaultDB.updateBundle(next, { vault_id: 'vault-id-gone', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
    })

    it("updateBundle refuses where no bundle stands: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBundle(TH.bundleOf('u1'), { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    })
  })

  describe(`${adapterTitle}, as a VaultDB: lockboxes`, () => {
    it("has no lockbox until one is written, then reads it back whole", async () => {
      const vaultDB = await withBundle()
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'one'))
    })

    it("replaces a lockbox over the revision it read", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' })
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'two'))
    })

    it("refuses a write over a revision it never read, writing nothing", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      // A second device that saw no box, and one that saw some other revision, both lose.
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), noBoxYet), 'stale_write')
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-other' }), 'stale_write')
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'one'))
    })

    it("erase wins: a write over a revision erased meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', thisVault)
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' }), 'stale_write')
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a write into a scope that holds no bundle", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a box sealed for a vault since destroyed and made anew, though no box stands in either", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(TH.scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...TH.bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'fresh'), { vault_id: 'vault-id-reborn', revision_id: null })
      const reborn = await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')
      expect(reborn?.revision_id).to.eq('rev-fresh')
    })

    it("lists summaries sorted by boxlabel, with format and both ciphered fields stripped", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('openai', 'two'), noBoxYet)
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
      expect(summaries[0]).to.deep.equal({
        boxlabel:    'anthropic',
        revision_id: 'rev-one',
        note:        'a test box',
        created_at:  '2026-10-14T00:00:00.000Z',
        updated_at:  '2026-10-14T00:00:00.000Z',
      })
    })

    it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(TH.bundleOf('u2'))
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(TH.scopeOf('u2'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null })
      const oneBox = await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')
      const twoBox = await vaultDB.readBox(TH.scopeOf('u2'), 'anthropic')
      expect(oneBox?.revision_id).to.eq('rev-one')
      expect(twoBox?.revision_id).to.eq('rev-two')
      expect(await vaultDB.listBoxes(TH.scopeOf('u2'))).to.have.lengthOf(1)
    })

    it("refuses a write expecting another user's vault_id", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(TH.bundleOf('u2'))
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null }), 'stale_write')
    })
  })

  describe(`${adapterTitle}, as a VaultDB: erasing`, () => {
    it("eraseBox removes one box without touching its neighbours, and is quiet when there is none", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('openai', 'two'), noBoxYet)
      await vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', thisVault)
      await vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', thisVault)
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.readBox(TH.scopeOf('u1'), 'openai')).to.not.be.null
    })

    it("eraseBox from a stale handle refuses: a vault destroyed and made anew keeps its box", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(TH.scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...TH.bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
      const kept = await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')
      expect(kept?.revision_id).to.eq('rev-reborn')
    })

    it("eraseBox refuses in a scope that holds no bundle, even with no box to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
    })

    it("eraseVault removes the bundle and every box of that scope, and nothing else", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(TH.bundleOf('u2'))
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(TH.scopeOf('u2'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null })
      await vaultDB.eraseVault(TH.scopeOf('u1'), thisVault)
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
      expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
      expect(await vaultDB.readBundle(TH.scopeOf('u2'))).to.not.be.null
      expect(await vaultDB.readBox(TH.scopeOf('u2'), 'anthropic')).to.not.be.null
    })

    it("eraseVault from a stale handle refuses: a vault made anew survives, bundle and boxes", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(TH.scopeOf('u1'), thisVault)
      const reborn = { ...TH.bundleOf('u1'), vault_id: 'vault-id-reborn' }
      await vaultDB.createBundle(reborn)
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseVault(TH.scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(reborn)
      expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("eraseVault refuses where no bundle stands: there is no vault of that vault_id to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseVault(TH.scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    })
  })

  describe(`${adapterTitle}, as a VaultDB: its contract`, () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })

    it("subscribe hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    it("refuses a malformed scope or boxlabel before storage sees it", async () => {
      const vaultDB = await withBundle()
      await expectRefusal(vaultDB.readBundle({ ...TH.scopeOf('u1'), vaultlabel: 'not-a-label' }), 'bad_label')
      await expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), 'not:a:label'), 'bad_label')
      await expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('Not_a_label', 'one'), noBoxYet), 'bad_label')
      await expectRefusal(vaultDB.eraseBox({ ...TH.scopeOf('u1'), user_id: '' }, 'anthropic', thisVault), 'bad_label')
    })
  })
}

const unheard = (): void => undefined

/**
 * Expect `operation` to reject with an error of `kind`. By `kind`, not class: an adapter built on
 * the published package throws that package's VaultError, a different class from `src/`'s.
 */
const expectRefusal = async (operation: Promise<unknown>, kind: string) => {
  let refusal: unknown = null
  try {
    await operation
  } catch (err) {
    refusal = err
  }
  expect(refusal).to.be.instanceOf(Error)
  expect((refusal as { kind?: unknown }).kind).to.eq(kind)
}
