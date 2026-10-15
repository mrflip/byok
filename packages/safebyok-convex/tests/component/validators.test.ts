import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import type { GenericValidator, Infer } from 'convex/values'
import * as Records from 'safebyok'
import type {
  BundleExpectation as CoreBundleExpectation, EraseExpectation as CoreEraseExpectation, LockboxExpectation as CoreLockboxExpectation,
} from 'safebyok'
import {
  BundleExpectation, Ciphered, EraseExpectation, ListedLockbox, Lockbox, LockboxExpectation, VaultBundle, VaultScope,
} from '../../src/component/validators'
import * as TH from '../test-helpers'

/**
 * A record's shape, as both validator libraries can be read: which fields, which optional, and
 * each field's base type. The literal a `format` field allows is part of its shape.
 */
type Shape =
  | { kind: 'string' | 'number' }
  | { kind: 'literal', values: string[] }
  | { kind: 'object', fields: Record<string, { optional: boolean, shape: Shape }> }

/** Zod's half: read from its public `def`, refinements (min, regex, int) set aside. */
type ZodLike = { def: { type: string, values?: unknown[], innerType?: ZodLike, shape?: Record<string, ZodLike> } }

const zodShape = (schema: ZodLike): Shape => {
  const { def } = schema
  if (def.type === 'string' || def.type === 'number') { return { kind: def.type } }
  if (def.type === 'literal') { return { kind: 'literal', values: (def.values ?? []).map(String).toSorted((one, two) => one.localeCompare(two)) } }
  if (def.type === 'object') {
    const fields = Object.entries(def.shape ?? {}).map(([ckey, field]) => {
      const optional = field.def.type === 'optional'
      return [ckey, { optional, shape: zodShape(optional && field.def.innerType ? field.def.innerType : field) }] as const
    })
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  throw new Error(`no shape for a Zod ${def.type}`)
}

/** Convex's half: a union of literals is the set of its values, as a `format` field widens. */
const convexShape = (validator: GenericValidator): Shape => {
  switch (validator.kind) {
  case 'string':  { return { kind: 'string' } }
  case 'float64': { return { kind: 'number' } }
  case 'literal': { return { kind: 'literal', values: [String(validator.value)] } }
  case 'union': {
    const shapes = validator.members.map((member) => convexShape(member))
    const literals = shapes.filter((shape) => shape.kind === 'literal')
    if (literals.length < shapes.length) { throw new Error('no shape for a union of non-literals') }
    return { kind: 'literal', values: literals.flatMap((shape) => shape.values).toSorted((one, two) => one.localeCompare(two)) }
  }
  case 'object': {
    const fields = Object.entries(validator.fields).map(([ckey, field]) => (
      [ckey, { optional: field.isOptional === 'optional', shape: convexShape(field) }] as const
    ))
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  default: { throw new Error(`no shape for a Convex ${validator.kind}`) }
  }
}

const listedZod = Records.Lockbox.omit({ lockbox_key_wrapped: true, whisper_ciphered: true })

const ShapeCases = [
  [Records.Ciphered,     Ciphered,      'Ciphered: the shared encrypted-value shape'],
  [Records.VaultScope,   VaultScope,    'VaultScope: what names one vault'],
  [Records.VaultBundle,  VaultBundle,   'VaultBundle: every field, ciphered envelope nested'],
  [Records.Lockbox,      Lockbox,       'Lockbox: every field, note optional, both ciphered fields nested'],
  [listedZod,            ListedLockbox, 'a listed lockbox: the record without its ciphered fields, format kept'],
] as const

describe("the Convex validators, field for field with the core's Zod records", () => {
  for (const [zodRecord, convexRecord, blurb] of ShapeCases) {
    it(blurb, () => {
      expect(convexShape(convexRecord)).to.deep.equal(zodShape(zodRecord))
    })
  }

  it("type the same records, expectations and summaries as the core", () => {
    expectTypeOf<Infer<typeof VaultBundle>>().toEqualTypeOf<Records.VaultBundle>()
    expectTypeOf<Infer<typeof VaultScope>>().toEqualTypeOf<Records.VaultScope>()
    // Convex's takes a note or none, every lockbox the core writes; the core's also reads an
    // undefined note, as earlier versions stored it.
    expectTypeOf<Infer<typeof Lockbox>>().toExtend<Records.Lockbox>()
    // A listing is the stored record less its ciphered fields; the core's summary of it nulls a
    // missing note, so it is the stored record's shape a listing must meet.
    expectTypeOf<Omit<Infer<typeof ListedLockbox>, 'format'>>().toExtend<Omit<Records.Lockbox, 'format' | 'lockbox_key_wrapped' | 'whisper_ciphered'>>()
    expectTypeOf<Infer<typeof BundleExpectation>>().toEqualTypeOf<CoreBundleExpectation>()
    expectTypeOf<Infer<typeof LockboxExpectation>>().toEqualTypeOf<CoreLockboxExpectation>()
    expectTypeOf<Infer<typeof EraseExpectation>>().toEqualTypeOf<CoreEraseExpectation>()
  })
})

// A probe app whose only functions take a record and do nothing: whether a call is refused is
// whether Convex's validator refuses the record.
const probeApp = defineTestApp({ schema: defineSchema({}) })
const { api: probeApi, createTest } = probeApp.defineModules({
  probe: {
    takeBundle:  probeApp.mutation({ args: { bundle: VaultBundle }, returns: v.null(), handler: () => null }),
    takeLockbox: probeApp.mutation({ args: { lockbox: Lockbox }, returns: v.null(), handler: () => null }),
  },
})

const convexAccepts = async (call: Promise<unknown>): Promise<boolean> => {
  try {
    await call
    return true
  } catch {
    return false
  }
}

const { vault_id: _vaultId, ...bundleWithoutVaultId } = TH.bundleOf('u1')
const { note: _note, ...boxWithoutNote } = TH.boxOf('anthropic_api_key', 'a1')

const BundleCases = [
  // both accept:
  [TH.bundleOf('u1'),                                                        true,   true,   'a whole bundle'],
  // both refuse -- what Convex can see:
  [{ ...TH.bundleOf('u1'), format: 'safebyok-vault-v2' },                    false,  false,  'a format this package does not know'],
  [{ ...TH.bundleOf('u1'), format: 'safebyok-lockbox-v1' },                  false,  false,  "another record's format"],
  [bundleWithoutVaultId,                                                  false,  false,  'a bundle missing its vault_id'],
  [{ ...TH.bundleOf('u1'), passphrase_epoch: '1' },                          false,  false,  'an epoch written as text'],
  [{ ...TH.bundleOf('u1'), vault_key_passphrase_wrapped: { cipher_iv_b64: 'iv' } }, false, false, 'a ciphered envelope missing its ciphertext'],
  [{ ...TH.bundleOf('u1'), created_at: null },                               false,  false,  'a null timestamp'],
  // Convex refuses, Zod strips: a field neither record has never reaches storage.
  [{ ...TH.bundleOf('u1'), passphrase: 'not-a-real-passphrase' },            true,   false,  'a field the record does not have'],
  // Zod refuses, Convex accepts -- the finer rules are the client's:
  [{ ...TH.bundleOf('u1'), applabel: 'ACME' },                               false,  true,   'an applabel outside the label grammar'],
  [{ ...TH.bundleOf('u1'), vault_id: '' },                                   false,  true,   'an empty vault_id'],
  [{ ...TH.bundleOf('u1'), passphrase_epoch: 0 },                            false,  true,   'an epoch of zero'],
  [{ ...TH.bundleOf('u1'), passphrase_epoch: 1.5 },                          false,  true,   'a fractional epoch'],
] as const

const LockboxCases = [
  // both accept:
  [TH.boxOf('anthropic_api_key', 'a1'),                                      true,   true,   'a whole lockbox'],
  [boxWithoutNote,                                                        true,   true,   'a lockbox with no note'],
  // both refuse:
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), note: null },                   false,  false,  'a null note'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-vault-v1' },  false,  false,  "another record's format"],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_ciphered: 'ct-flat' },  false,  false,  'a whisper ciphered as bare text, not an envelope'],
  // Zod refuses, Convex accepts:
  [{ ...TH.boxOf('Anthropic Key', 'a1') },                                   false,  true,   'a boxlabel outside the label grammar'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), note: 'n'.repeat(257) },        false,  true,   'a note over 256 characters'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), revision_id: '' },              false,  true,   'an empty revision_id'],
] as const

describe("the Convex validators, against the core's Zod records, record by record", () => {
  for (const [bundle, zodOk, convexOk, blurb] of BundleCases) {
    it(`bundle: ${blurb}`, async () => {
      expect(Records.VaultBundle.safeParse(bundle).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeBundle, { bundle: bundle as never }))).to.eq(convexOk)
    })
  }

  for (const [lockbox, zodOk, convexOk, blurb] of LockboxCases) {
    it(`lockbox: ${blurb}`, async () => {
      expect(Records.Lockbox.safeParse(lockbox).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeLockbox, { lockbox: lockbox as never }))).to.eq(convexOk)
    })
  }
})
