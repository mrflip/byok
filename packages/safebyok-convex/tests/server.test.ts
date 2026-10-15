import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { SafebyokComponent } from '../src/server'
import type { GetUserId, SafebyokErrorData } from '../src/server'
import { register } from '../src/test'
import { boxOf, bundleOf, scopeOf } from './helpers'

/**
 * A host app as the README has it: no tables of its own, the component installed as `safebyok`,
 * and its functions re-exported from `convex/safebyok.ts`, authenticating by the identity's subject.
 */
const hostWith = (getUserId: GetUserId) => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId }) })
}

const bySubject: GetUserId = async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
const { api, createTest } = hostWith(bySubject)

const u1 = scopeOf('u1')
const thisVault = { vault_id: 'vault-id-u1' }

/** A backend where `u1`'s vault holds a bundle and one lockbox, written as `u1`. */
const seeded = async () => {
  const t = createTest()
  const asU1 = t.withIdentity({ subject: 'u1' })
  await asU1.mutation(api.safebyok.createBundle, { bundle: bundleOf('u1') })
  await asU1.mutation(api.safebyok.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a1'), expected: { vault_id: 'vault-id-u1', revision_id: null } })
  return t
}

type Caller = ReturnType<ReturnType<typeof createTest>['withIdentity']>

/** One call of each of the nine functions, on `u1`'s vault, as `caller`. */
const EveryCall: [string, (caller: Caller) => Promise<unknown>][] = [
  ['getBundle',        (caller) => caller.query(api.safebyok.getBundle, { scope: u1 })],
  ['createBundle',     (caller) => caller.mutation(api.safebyok.createBundle, { bundle: bundleOf('u1') })],
  ['updateBundle',     (caller) => caller.mutation(api.safebyok.updateBundle, { bundle: bundleOf('u1', { passphrase_epoch: 2 }), expected: { vault_id: 'vault-id-u1', passphrase_epoch: 1 } })],
  ['getBox',           (caller) => caller.query(api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })],
  ['listBoxSummaries', (caller) => caller.query(api.safebyok.listBoxSummaries, { scope: u1 })],
  ['updateBox',        (caller) => caller.mutation(api.safebyok.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1' } })],
  ['eraseBox',         (caller) => caller.mutation(api.safebyok.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: thisVault })],
  ['eraseVault',       (caller) => caller.mutation(api.safebyok.eraseVault, { scope: u1, expected: thisVault })],
  ['watchVault',       (caller) => caller.query(api.safebyok.watchVault, { scope: u1 })],
]

/** The ConvexError data a call refused with; fails the test if it did not refuse so. */
const refusalOf = async (call: Promise<unknown>): Promise<SafebyokErrorData> => {
  try {
    await call
  } catch (err) {
    if (err instanceof ConvexError) { return err.data as SafebyokErrorData }
    throw err
  }
  throw new Error('the call was not refused')
}

describe("SafebyokComponent.api, for the vault's own user", () => {
  for (const [fnName, call] of EveryCall) {
    it(`lets the signed-in owner call ${fnName}`, async () => {
      const t = await seeded()
      await call(t.withIdentity({ subject: 'u1' }))
    })
  }

  it("hands back what the component holds, exactly", async () => {
    const t = await seeded()
    const asU1 = t.withIdentity({ subject: 'u1' })
    expect(await asU1.query(api.safebyok.getBundle, { scope: u1 })).to.deep.equal(bundleOf('u1'))
    expect(await asU1.query(api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a1'))
    expect(await asU1.query(api.safebyok.watchVault, { scope: u1 })).to.deep.equal({
      vault_id: 'vault-id-u1', passphrase_epoch: 1, boxes: [['anthropic_api_key', 'rev-a1']],
    })
  })

  it("resolves a failed expectation false, not as a refusal", async () => {
    const t = await seeded()
    const stale = { vault_id: 'vault-id-u1', revision_id: 'rev-a0' }
    expect(await t.withIdentity({ subject: 'u1' }).mutation(api.safebyok.updateBox, { scope: u1, lockbox: boxOf('anthropic_api_key', 'a2'), expected: stale })).to.be.false
  })
})

describe("SafebyokComponent.api, for anyone else", () => {
  for (const [fnName, call] of EveryCall) {
    it(`refuses ${fnName} as not_permitted when no one is signed in`, async () => {
      const t = await seeded()
      expect((await refusalOf(call(t))).kind).to.eq('not_permitted')
    })

    it(`refuses ${fnName} as not_permitted for another signed-in user`, async () => {
      const t = await seeded()
      expect((await refusalOf(call(t.withIdentity({ subject: 'u2' })))).kind).to.eq('not_permitted')
    })
  }

  it("leaves the vault as it was after another user's every attempt", async () => {
    const t = await seeded()
    const asU2 = t.withIdentity({ subject: 'u2' })
    for (const [, call] of EveryCall) { await refusalOf(call(asU2)) }
    const asU1 = t.withIdentity({ subject: 'u1' })
    expect(await asU1.query(api.safebyok.getBundle, { scope: u1 })).to.deep.equal(bundleOf('u1'))
    expect(await asU1.query(api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(boxOf('anthropic_api_key', 'a1'))
  })

  it("shows a user only their own vault: their listing holds none of another's boxes", async () => {
    const t = await seeded()
    const asU2 = t.withIdentity({ subject: 'u2' })
    await asU2.mutation(api.safebyok.createBundle, { bundle: bundleOf('u2') })
    expect(await asU2.query(api.safebyok.listBoxSummaries, { scope: scopeOf('u2') })).to.deep.equal([])
  })

  it("says what to do, calmly, and names no user in a refusal", async () => {
    const t = await seeded()
    const refusals = [
      await refusalOf(t.query(api.safebyok.getBundle, { scope: u1 })),
      await refusalOf(t.withIdentity({ subject: 'u2' }).query(api.safebyok.getBundle, { scope: u1 })),
    ]
    expect(refusals.map((refusal) => refusal.message)).to.deep.equal([
      'No one is signed in, so this vault cannot be reached: sign in, then try again.',
      'This vault belongs to another user: a signed-in user reaches only their own vaults.',
    ])
  })
})

describe("SafebyokComponent.api, with the host's getUserId", () => {
  const SignedOutCases = [
    [async () => null,      'treats a null user id as signed out'],
    [async () => undefined, 'treats an undefined user id as signed out'],
    [async () => '',        'treats an empty user id as signed out'],
    [() => null,            'accepts a getUserId that answers synchronously'],
  ] as const

  for (const [getUserId, blurb] of SignedOutCases) {
    it(blurb, async () => {
      const host = hostWith(getUserId)
      const t = host.createTest().withIdentity({ subject: 'u1' })
      expect((await refusalOf(t.query(host.api.safebyok.getBundle, { scope: u1 }))).kind).to.eq('not_permitted')
    })
  }

  it("lets the host map identities to user ids its own way", async () => {
    const host = hostWith(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? `user|${identity.subject}` : null
    })
    const t = host.createTest().withIdentity({ subject: 'u1' })
    await t.mutation(host.api.safebyok.createBundle, { bundle: bundleOf('user|u1') })
    expect(await t.query(host.api.safebyok.getBundle, { scope: scopeOf('user|u1') })).to.deep.equal(bundleOf('user|u1'))
    expect((await refusalOf(t.query(host.api.safebyok.getBundle, { scope: u1 }))).kind).to.eq('not_permitted')
  })
})
