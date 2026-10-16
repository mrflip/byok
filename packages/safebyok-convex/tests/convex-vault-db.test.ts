import { afterEach, describe, expect, it, vi } from 'vitest'
import { anyApi } from 'convex/server'
import { ConvexError } from 'convex/values'
import { VaultError, openVault } from 'safebyok'
import * as TH from './test-helpers'
import { convexVaultDB } from '../src/index'
import { toConvexLockbox } from '../src/convex-vault-db'
import { MaxVaultLockboxes } from '../src/component/tallies'
import type { ConvexVaultClient, SafebyokApi } from '../src/index'
import { fakeDeployment } from './fake-deployment'

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
const deployments: ReturnType<typeof fakeDeployment>[] = []
const deploy = (...args: Parameters<typeof fakeDeployment>) => {
  const deployment = fakeDeployment(...args)
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

type Deployment = ReturnType<typeof fakeDeployment>

/** Both clients convexVaultDB accepts, each connected to `deployment` and signed in as `subject`. */
const ClientCases: [string, (deployment: Deployment, subject: string | null) => ConvexVaultClient][] = [
  ['ConvexClient',      (deployment, subject) => deployment.client(subject)],
  ['ConvexReactClient', (deployment, subject) => deployment.reactClient(subject)],
]

for (const [clientTitle, connect] of ClientCases) {
  TH.describeVaultDB(`convexVaultDB over a ${clientTitle}`, () => {
    const deployment = deploy()
    return TH.perUser((userId) => convexVaultDB(connect(deployment, userId === '' ? null : userId), deployment.api.safebyok))
  })
}

const u1 = TH.scopeOf('u1')

describe("toConvexLockbox", () => {
  const { note: _note, ...noteless } = TH.boxOf('anthropic_api_key', 'a1')

  it("keeps a lockbox's note", () => {
    expect(toConvexLockbox(TH.boxOf('anthropic_api_key', 'a1'))).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("drops an undefined note, as an earlier version's store may hold one", () => {
    const converted = toConvexLockbox({ ...noteless, note: undefined })
    expect(converted).to.deep.equal(noteless)
    expect(converted).to.not.have.property('note')
  })

  it("leaves a lockbox with no note as it is", () => {
    expect(toConvexLockbox(noteless)).to.deep.equal(noteless)
  })
})

describe("convexVaultDB, as it is made", () => {
  it("holds at most Convex's document limit in one record", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxRecordBytes).to.eq(1_048_576)
  })

  it("holds at most half of what one Convex function may read in one vault, since erasing reads it twice", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxVaultBytes).to.eq(8 * 1024 * 1024)
  })

  it("declares the component's own limit on lockboxes, which the component enforces", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxLockboxes).to.eq(MaxVaultLockboxes)
    expect(MaxVaultLockboxes).to.eq(8000)
  })

  const NotClientCases = [
    [null,                                     'refuses null for a client'],
    [{},                                       'refuses an object with no Convex calls'],
    [{ query: () => null, mutation: () => null }, 'refuses a client that cannot watch a query'],
  ] as const

  for (const [notClient, blurb] of NotClientCases) {
    it(blurb, () => {
      const deployment = deploy()
      expect(() => convexVaultDB(notClient as unknown as ConvexVaultClient, deployment.api.safebyok)).to.throw(VaultError, /needs a Convex client/)
    })
  }

  it("refuses the whole generated api, where it wants api.safebyok", () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    // A host's generated `api` answers any property, as anyApi does.
    expect(() => convexVaultDB(client, anyApi as unknown as SafebyokApi)).to.throw(VaultError, /api\.safebyok/)
    expect(() => convexVaultDB(client, {} as SafebyokApi)).to.throw(VaultError, /api\.safebyok/)
    expect(convexVaultDB(client, anyApi['safebyok'] as unknown as SafebyokApi).maxRecordBytes).to.eq(1_048_576)
  })
})

/** `vaultDB`'s `u1` vault, made and filled with eight lockboxes of 900,000 bytes: a little under the component's limit. */
const nearlyFull = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  await vaultDB.createBundle(TH.bundleOf('u1'))
  for (let ii = 0; ii < 8; ii++) {
    await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, 900_000), TH.noBoxYet)
  }
}

describe("convexVaultDB, refusing", () => {
  /** One call of each verb that reaches the deployment, on `u1`'s vault. */
  const EveryVerb: [string, (vaultDB: ReturnType<typeof convexVaultDB>) => Promise<unknown>][] = [
    ['readBundle',   (vaultDB) => vaultDB.readBundle(u1)],
    ['createBundle', (vaultDB) => vaultDB.createBundle(TH.bundleOf('u1'))],
    ['updateBundle', (vaultDB) => vaultDB.updateBundle(TH.bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 })],
    ['readBox',      (vaultDB) => vaultDB.readBox(u1, 'anthropic_api_key')],
    ['listBoxes',    (vaultDB) => vaultDB.listBoxes(u1)],
    ['updateBox',    (vaultDB) => vaultDB.updateBox(u1, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)],
    ['eraseBox',     (vaultDB) => vaultDB.eraseBox(u1, 'anthropic_api_key', TH.thisVault)],
    ['eraseVault',   (vaultDB) => vaultDB.eraseVault(u1, TH.thisVault)],
  ]

  for (const [clientTitle, connect] of ClientCases) {
    for (const [verb, call] of EveryVerb) {
      it(`refuses ${verb} over a ${clientTitle} as not_permitted when no one is signed in`, async () => {
        const deployment = deploy()
        const vaultDB = convexVaultDB(connect(deployment, null), deployment.api.safebyok)
        const refusal = await TH.expectRefusal(call(vaultDB), 'not_permitted')
        expect(refusal).to.be.instanceOf(VaultError)
        expect(refusal.message).to.eq('No one is signed in, so this vault cannot be reached: sign in, then try again.')
        expect(refusal.cause).to.be.instanceOf(ConvexError)
      })

      it(`refuses ${verb} over a ${clientTitle} as not_permitted for another user's vault`, async () => {
        const deployment = deploy()
        const vaultDB = convexVaultDB(connect(deployment, 'u2'), deployment.api.safebyok)
        const refusal = await TH.expectRefusal(call(vaultDB), 'not_permitted')
        expect(refusal.message).to.eq('This vault belongs to another user: a signed-in user reaches only their own vaults.')
      })
    }
  }

  it("leaves another user's vault as it was, after their every refused attempt", async () => {
    const deployment = deploy()
    const owner = convexVaultDB(deployment.client('u1'), deployment.api.safebyok)
    await owner.createBundle(TH.bundleOf('u1'))
    const intruder = convexVaultDB(deployment.client('u2'), deployment.api.safebyok)
    for (const [, call] of EveryVerb) { await TH.expectRefusal(call(intruder), 'not_permitted') }
    expect(await owner.readBundle(u1)).to.deep.equal(TH.bundleOf('u1'))
    expect(await owner.listBoxes(u1)).to.deep.equal([])
  })

  it("lists a lockbox the component holds but safebyok would never write as damaged, under its boxlabel", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vaultDB = convexVaultDB(client, deployment.api.safebyok)
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'two'), TH.noBoxYet)
    // Past the adapter's own checks, straight to the component, which bounds no time's form.
    const lockbox = toConvexLockbox({ ...TH.boxOf('anthropic', 'one'), changed_at: Date.UTC(2026, 9, 14) + 0.5 })
    await client.mutation(deployment.api.safebyok.updateBox, { scope: u1, lockbox, expected: TH.noBoxYet })
    const listed = await vaultDB.listBoxes(u1)
    expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['anthropic', true], ['openai', false]])
    await vaultDB.eraseBox(u1, 'anthropic', { vault_id: 'vault-id-u1' })
    expect(await vaultDB.listBoxes(u1)).to.have.lengthOf(1)
  })

  it("refuses as not_permitted over a ConvexReactClient that already holds the query's refusal", async () => {
    const deployment = deploy()
    const reactClient = deployment.reactClient(null)
    // The app's own watch of the same query, signed out: the client keeps its refusal, and
    // answers a one-shot query of it from there, synchronously.
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.getBundle, { scope: u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })
    await TH.expectRefusal(convexVaultDB(reactClient, deployment.api.safebyok).readBundle(u1), 'not_permitted')
  })

  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses a lockbox the component has no room for over a ${clientTitle} as vault_full`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      await nearlyFull(vaultDB)
      const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.heavyBox('one_too_many', 200_000), TH.noBoxYet), 'vault_full')
      expect(refusal.message).to.eq('This vault is full: erase a lockbox to make room, then try again.')
      expect(refusal.cause).to.be.instanceOf(ConvexError)
      const listed = await vaultDB.listBoxes(u1)
      expect(listed.map((summary) => summary.boxlabel)).to.not.include('one_too_many')
    })
  }

  it("has a vault's store() refuse as vault_full a lockbox the component has no room for, under the vault's own maxLockboxes", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vault = await openOver(client, deployment.api.safebyok)
    await vault.unlock(TH.RealPassphrase)
    // Lockboxes the vault never opens, leaving less room than one whisper of 40,000 bytes takes.
    const vaultDB = convexVaultDB(client, deployment.api.safebyok)
    const bundle = await vaultDB.readBundle(u1)
    const vaultId = bundle?.vault_id ?? ''
    for (const [ii, bytes] of [...Array.from({ length: 8 }, () => 900_000), 120_000].entries()) {
      await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, bytes), { vault_id: vaultId, revision_id: null })
    }
    const refusal = await TH.expectRefusal(vault.store('anthropic_api_key', 'x'.repeat(40_000)), 'vault_full')
    expect(refusal.message).to.eq('This vault is full: erase a lockbox to make room, then try again.')
    expect(vault.getSnapshot().boxes.map((box) => box.boxlabel)).to.not.include('anthropic_api_key')
    vault.close()
  })

  it("makes any other failure storage_unavailable, carrying nothing of Convex's error", async () => {
    const deployment = deploy(() => { throw new Error('the auth provider is down') })
    const refusal = await TH.expectRefusal(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).readBundle(u1), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(refusal.message).to.include("your Convex deployment's logs have it")
    expect(TH.thrownText(refusal)).to.not.include('the auth provider is down')
  })
})

describe("a record the deployment refused", () => {
  // Distinctive values throughout, so that finding one in what is thrown means it was quoted.
  const subject = 'user_quotable'
  const scope = { applabel: 'quotable_app', user_id: subject, vaultlabel: 'quotable_vault' }
  const standing = TH.bundleOf(subject, { ...scope, unlock_epoch: 52_871 })
  const nextBundle = { ...standing, unlock_epoch: 52_872, vault_key_passphrase_wrapped: TH.fakeCiphered('rewrapped_quotable') }
  const lockbox = TH.boxOf('quotable_box', 'quotable_rev', { note: 'a quotable note' })

  const RefusedWrites: [string, unknown, (vaultDB: ReturnType<typeof convexVaultDB>) => Promise<unknown>][] = [
    ['updateBundle', nextBundle, (vaultDB) => vaultDB.updateBundle(nextBundle, { vault_id: standing.vault_id, unlock_epoch: 52_871 })],
    ['updateBox',    lockbox,    (vaultDB) => vaultDB.updateBox(scope, lockbox, { vault_id: standing.vault_id, revision_id: null })],
  ]

  for (const [verb, record, write] of RefusedWrites) {
    it(`is quoted nowhere in what ${verb} throws: message, properties or causes`, async () => {
      const deployment = deploy()
      const client = deployment.client(subject)
      await convexVaultDB(client, deployment.api.safebyok).createBundle(standing)
      // The core strips a field it does not know, so this one strays in on the wire, past it,
      // where Convex's validator refuses the call. convex-test's validator names the field; a
      // dev deployment's quotes the arguments too (notes/security.md). The refusal carries none of it.
      const straying: ConvexVaultClient = {
        query:    client.query.bind(client),
        onUpdate: client.onUpdate.bind(client),
        mutation: (mutationRef, args) => client.mutation(mutationRef, { ...args, stray_field: 'x' }),
      }
      const vaultDB = convexVaultDB(straying, deployment.api.safebyok)
      const refusal = await TH.expectRefusal(write(vaultDB), 'storage_unavailable')
      expect(refusal.cause).to.be.undefined
      const thrown = TH.thrownText(refusal)
      expect(thrown).to.not.include('stray_field')
      const quotables = TH.leafTexts({ scope, record })
      for (const leaf of quotables) {
        expect(thrown).to.not.include(leaf)
      }
      expect(await vaultDB.readBundle(scope)).to.deep.equal(standing)
      expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
    })
  }

  it("is quoted nowhere in what updateBox throws when Convex's validator quotes the refused argument", async () => {
    const deployment = deploy()
    const client = deployment.client(subject)
    await convexVaultDB(client, deployment.api.safebyok).createBundle(standing)
    const expected = { vault_id: standing.vault_id, revision_id: null }
    const quotedArgs = misnoted({ scope, lockbox: toConvexLockbox(lockbox), expected })
    await expect(client.mutation(deployment.api.safebyok.updateBox, quotedArgs)).rejects.toThrow('quoted_by_convex')
    const quoting: ConvexVaultClient = {
      query:    client.query.bind(client),
      onUpdate: client.onUpdate.bind(client),
      mutation: (mutationRef, args) => client.mutation(mutationRef, misnoted(args)),
    }
    const vaultDB = convexVaultDB(quoting, deployment.api.safebyok)
    const refusal = await TH.expectRefusal(vaultDB.updateBox(scope, lockbox, expected), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('quoted_by_convex')
    expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
  })
})

/** `args` with its lockbox's note not text, past the core's checks: convex-test's validator quotes it. */
const misnoted = <ArgsT extends object>(args: ArgsT): ArgsT => ({ ...args, lockbox: { ...(args as { lockbox?: object }).lockbox, note: ['quoted_by_convex'] } })

/** Resolves once every message already sent to `vaultDB`'s client has arrived: one round trip behind them. */
const caughtUp = async (vaultDB: ReturnType<typeof convexVaultDB>) => { await vaultDB.readBundle(u1) }

/**
 * A watch of `u1`'s vault through `vaultDB`, once its first result has come in: its `onChange`,
 * how often that had been called by then (`heardBefore`), and its `unsubscribe`.
 */
const settledWatch = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  const onChange = vi.fn()
  const unsubscribe = vaultDB.subscribe(u1, onChange)
  await vi.waitFor(() => { expect(onChange).toHaveBeenCalled() })
  return { onChange, unsubscribe, heardBefore: onChange.mock.calls.length }
}

describe("convexVaultDB.subscribe", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`calls onChange over a ${clientTitle} when another device writes to the vault`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const there = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      await there.createBundle(TH.bundleOf('u1'))
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
    })

    it(`hears nothing over a ${clientTitle} once unsubscribed`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const there = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      watch.unsubscribe()
      const heardBefore = watch.onChange.mock.calls.length
      await there.createBundle(TH.bundleOf('u1'))
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(heardBefore)
    })

    it(`hears nothing over a ${clientTitle} of another vault's writes`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      await here.createBundle({ ...TH.bundleOf('u1'), vaultlabel: 'work' })
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(watch.heardBefore)
    })

    it(`unsubscribes once over a ${clientTitle}, however often it is called, leaving another watch of the vault be`, async () => {
      const deployment = deploy()
      const client = connect(deployment, 'u1')
      const alongside = await settledWatch(convexVaultDB(client, deployment.api.safebyok))
      const unsubscribe = convexVaultDB(client, deployment.api.safebyok).subscribe(u1, () => undefined)
      unsubscribe()
      unsubscribe()
      const heardBefore = alongside.onChange.mock.calls.length
      await convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok).createBundle(TH.bundleOf('u1'))
      await vi.waitFor(() => { expect(alongside.onChange.mock.calls.length).to.be.greaterThan(heardBefore) })
    })

    it(`subscribes calmly over a ${clientTitle} while signed out, and throws nothing later`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, null), deployment.api.safebyok)
      const unsubscribe = here.subscribe(u1, () => undefined)
      // The refused watch arrives with the next round trip; an error thrown from inside the
      // client's socket would fail this test as unhandled.
      await TH.expectRefusal(here.readBundle(u1), 'not_permitted')
      unsubscribe()
    })
  }

  it("calls onChange for the first result too: the vault's first read may have missed a write", async () => {
    const deployment = deploy()
    const here = convexVaultDB(deployment.client('u1'), deployment.api.safebyok)
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await vi.waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
  })

  it("still hears a change when the ConvexReactClient already watches the vault, and so sends no first result", async () => {
    const deployment = deploy()
    const reactClient = deployment.reactClient('u1')
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.watchVault, { scope: u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })

    const here = convexVaultDB(reactClient, deployment.api.safebyok)
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await caughtUp(here)
    expect(onChange).not.toHaveBeenCalled()
    await convexVaultDB(deployment.client('u1'), deployment.api.safebyok).createBundle(TH.bundleOf('u1'))
    await vi.waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
  })
})

/** The README's example: a vault opened over the app's own Convex client. */
const openOver = (client: ConvexVaultClient, api: SafebyokApi) => openVault(TH.memoryVaultOpts({ vaultDB: convexVaultDB(client, api) }))

describe("a vault over convexVaultDB, opened before sign-in", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`is refused as not_permitted over a ${clientTitle}, leaving no watch live on the deployment`, async () => {
      const deployment = deploy()
      await TH.expectRefusal(openOver(connect(deployment, null), deployment.api.safebyok), 'not_permitted')
      await vi.waitFor(() => { expect(deployment.watching()).to.deep.equal([]) })
    })
  }
})

describe("a vault over convexVaultDB, on two devices", () => {
  const NewPassphrase = 'a different staple, entirely'
  // Obvious fakes, never real keys.
  const anthropicKey = 'sk-ant-test-not-a-real-key'
  const openaiKey = { apiKey: 'sk-test-not-a-real-key', orgId: null }

  it("is made on one device, written, read on another, re-passphrased, and destroyed, each device hearing the other", async () => {
    const deployment = deploy()
    const laptop = await openOver(deployment.client('u1'), deployment.api.safebyok)
    const phone = await openOver(deployment.reactClient('u1'), deployment.api.safebyok)
    expect(laptop.getSnapshot().state).to.eq('absent')

    // The laptop makes the vault and stores a whisper; the phone hears of both.
    await laptop.unlock(TH.RealPassphrase)
    await laptop.store('anthropic_api_key', anthropicKey, { note: 'work account' })
    await vi.waitFor(() => {
      expect(phone.getSnapshot().state).to.eq('locked')
      expect(phone.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    })

    // The phone unlocks and reads what the laptop wrote; what the deployment holds is ciphertext.
    await phone.unlock(TH.RealPassphrase)
    expect(await phone.read('anthropic_api_key')).to.deep.equal(anthropicKey)
    const stored = await deployment.as('u1').query(deployment.api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })
    expect(JSON.stringify(stored)).to.not.include(anthropicKey)
    expect(JSON.stringify(stored)).to.not.include(TH.RealPassphrase)

    // The phone stores a second; the laptop hears it and reads it.
    await phone.store('openai_api_key', openaiKey)
    await vi.waitFor(() => {
      expect(laptop.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    })
    expect(await laptop.read('openai_api_key')).to.deep.equal(openaiKey)

    // The laptop changes the passphrase: the phone is locked out of its old unlock, and only the
    // new passphrase opens it again.
    await laptop.changePassphrase(TH.RealPassphrase, NewPassphrase)
    await vi.waitFor(() => { expect(phone.getSnapshot().state).to.eq('locked') })
    await TH.expectRefusal(phone.unlock(TH.RealPassphrase), 'wrong_passphrase')
    await phone.unlock(NewPassphrase)
    expect(await phone.read('anthropic_api_key')).to.deep.equal(anthropicKey)

    // The phone destroys the vault; the laptop hears it gone.
    await phone.destroy()
    await vi.waitFor(() => { expect(laptop.getSnapshot().state).to.eq('absent') })
    laptop.close()
    phone.close()
  })
})
