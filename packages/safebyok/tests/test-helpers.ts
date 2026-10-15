/**
 * safebyok's test helpers, everything in one module: star-import it as `TH` in this package's
 * tests (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's.
 * A cheap key deriver, a vault's options over stores in memory, shape-valid records whose
 * ciphertext is fake, a live device unlock, small timing, interception and tampering aids, a
 * logger that keeps what it hears, checks that a call refuses and that what it threw quotes
 * nothing it shouldn't, and the suites every VaultDB and DeviceDB adapter owes. For tests only,
 * and under vitest: the deriver is worthless against a brute-forcer.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Ciphered } from '../src/crypto'
import { memoryDeviceDB, type DeviceDB } from '../src/device-db'
import type { VaultError, VaultErrorKind } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import type { VaultLogger } from '../src/logger'
import { memoryStore } from '../src/string-store'
import type { DeviceUnlock, Lockbox, VaultBundle, VaultScope } from '../src/types'
import type { OpenVaultOpts } from '../src/vault'
import { localVaultDB, type VaultDB } from '../src/vault-db'

/** A Lockbox as the core writes one: a note, or no note field at all, never an undefined one. */
type WrittenLockbox = Omit<Lockbox, 'note'> & { note?: string }

/**
 * A cheap KeyDeriver for tests: one SHA-256 instead of 64 MiB of Argon2id, so a suite full of
 * unlocks runs in milliseconds. Deterministic in passphrase and salt, like the real one; unlike
 * the real one, worthless against a brute-forcer -- which is why its label says `test`. Never
 * hand it to a vault that holds a real secret.
 *
 * @example openVault({ ...opts, keyDeriver: testDeriver })
 */
export const testDeriver: KeyDeriver = {
  key_deriver_label: 'test_digest_v0',
  salt_bytes:        16,
  deriveKeyBytes: async (passphrase, saltBytes) => {
    const passphraseBytes = new TextEncoder().encode(passphrase)
    const joined = new Uint8Array(passphraseBytes.length + saltBytes.length)
    joined.set(passphraseBytes)
    joined.set(saltBytes, passphraseBytes.length)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', joined))
  },
}

/**
 * Everything openVault needs, over stores in memory made fresh for each call: `u1`'s `main` vault
 * in the `acme` app (as {@link scopeOf} has it), deriving through {@link testDeriver}. `overrides`
 * replace any of it -- a store of the test's own, a clock, a logger, another user.
 *
 * @param overrides - Options to use in place of the defaults.
 * @returns A complete bag of options for openVault, or (`userId` aside) for a VaultProvider.
 *
 * @example const vault = await openVault(TH.memoryVaultOpts())
 * @example const vault = await openVault(TH.memoryVaultOpts({ userId: 'u2', vaultDB: myVaultDB }))
 */
export const memoryVaultOpts = (overrides: Partial<OpenVaultOpts> = {}): OpenVaultOpts => ({
  applabel:   'acme',
  userId:     'u1',
  vaultlabel: 'main',
  vaultDB:    localVaultDB(memoryStore()),
  deviceDB:   memoryDeviceDB(),
  keyDeriver: testDeriver,
  ...overrides,
})

/**
 * A database name no other call has handed out, so each test of an IndexedDB adapter starts
 * from an empty database of its own.
 *
 * @example idbVaultDB({ dbName: TH.freshDbName() })
 */
export const freshDbName = (): string => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

/**
 * A shape-valid Ciphered that opens nothing: for storage-layer tests, which never decrypt.
 *
 * @example fakeCiphered('a1')  // => { cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' }
 */
export const fakeCiphered = (tag: string): Ciphered => ({
  cipher_iv_b64:  `iv-${tag}`,
  ciphertext_b64: `ct-${tag}`,
})

/**
 * The scope of `userId`'s vault in the `acme` app.
 *
 * @example scopeOf('u1')           // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example scopeOf('u1', 'spare')  // => { applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' }
 */
export const scopeOf = (userId: string, vaultlabel = 'main'): VaultScope => ({ applabel: 'acme', user_id: userId, vaultlabel })

/**
 * A shape-valid VaultBundle for `userId`'s `main` vault, its envelope fake: for storage-layer
 * tests, which never decrypt. Its vault_id is `vault-id-<userId>`, its epoch 1.
 *
 * @example bundleOf('u1', { passphrase_epoch: 2 })
 */
export const bundleOf = (userId: string, overrides: Partial<VaultBundle> = {}): VaultBundle => ({
  format:              'safebyok-vault-v1',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  passphrase_epoch:    1,
  key_deriver_label:   'test_digest_v0',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- base64 of the literal text 'saltsaltsaltsalt': a fake salt (which is public material anyway), not a credential
  passphrase_salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_passphrase_wrapped: fakeCiphered(`bundle-${userId}`),
  registered_at:       Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * A shape-valid Lockbox for storage-layer tests, its ciphered fields fake: revision `rev-<tag>`,
 * with the note `a test box` unless `overrides` says otherwise.
 *
 * @example boxOf('anthropic_api_key', 'a1', { note: 'work account' })
 */
export const boxOf = (boxlabel: string, tag: string, overrides: Partial<WrittenLockbox> = {}): WrittenLockbox => ({
  format:              'safebyok-lockbox-v1',
  boxlabel,
  revision_id:         `rev-${tag}`,
  lockbox_key_wrapped: fakeCiphered(`boxkey-${tag}`),
  whisper_ciphered:    fakeCiphered(`whisper-${tag}`),
  note:                'a test box',
  registered_at:       Date.UTC(2026, 9, 14),
  changed_at:          Date.UTC(2026, 9, 14),
  ...overrides,
})

/**
 * What a write into {@link bundleOf}('u1')'s vault expects when its lockbox is not there yet:
 * that vault, and no revision.
 *
 * @example vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
 */
export const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null } as const

/**
 * What an erase of {@link bundleOf}('u1')'s vault, or of a lockbox in it, expects: that vault.
 *
 * @example vaultDB.eraseVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = { vault_id: 'vault-id-u1' } as const

/** A real DeviceUnlock for device-storage tests: a live non-extractable localUnlockKey around fake wrapped material. */
export const unlockOf = async (userId: string): Promise<DeviceUnlock> => ({
  format:                  'safebyok-unlock-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  passphrase_epoch:        1,
  local_unlock_key:        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_local_wrapped: fakeCiphered(`local-${userId}`),
  ask_passphrase_at:       1_900_000_000_000,
})

/**
 * Base64url text, bent a little: its first character swapped for another valid one, so it is
 * always different, keeps its length, decodes whenever `b64` does, and a tamper test reaches the
 * check it means to exercise. Blank text has no character to bend, and nothing put in its place
 * decodes, so it throws: a tamper test aimed at an empty field is aimed at the wrong field.
 *
 * @param b64 - Base64url text, not blank.
 * @returns Text that differs from `b64` in its first character only.
 *
 * @example tweakB64('Zm9v') // 'am9v'
 * @example tweakB64('am9v') // 'bm9v'
 * @example tweakB64('')     // throws a TypeError
 */
export const tweakB64 = (b64: string): string => {
  if (b64 === '') { throw new TypeError('tweakB64 needs base64url text to bend, and was handed blank text.') }
  const replacer = b64.startsWith('a') ? 'b' : 'a'
  return replacer + b64.slice(1)
}

/**
 * Resolve after the macrotask queue has turned once: every promise already settled has run its
 * continuation, and so has any timer due now. For tests that let background work (a refresh rung
 * by a write) settle before they look.
 *
 * @returns A promise for the next tick.
 *
 * @example await wakeupAtNextTick() // background refreshes have landed
 */
export const wakeupAtNextTick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/**
 * A gate for holding an async seam mid-flight, so a test can land one call in the middle of
 * another: `pass()` waits until `release()` is called, and `reached` resolves once something is
 * waiting at it. Released, it stays open: later passes go straight through.
 *
 * @returns The gate: `pass`, to await inside the seam; `reached`, to await in the test; `release`.
 *
 * @example
 *   const gate = TH.makeGate()
 *   const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
 *   const unlocking = vault.unlock('pw')   // now waiting at the gate
 *   await gate.reached
 *   await vault.lock()                     // lands mid-unlock
 *   gate.release()
 */
export const makeGate = () => {
  const opened = deferred()
  const arrived = deferred()
  const pass = async () => {
    arrived.resolve()
    await opened.promise
  }
  return { pass, reached: arrived.promise, release: opened.resolve }
}

/** The names of `Target`'s methods that return a promise. */
export type AsyncVerbOf<Target> = {
  [Verb in keyof Target]-?: Target[Verb] extends (...args: never[]) => Promise<unknown> ? Verb : never
}[keyof Target]

/**
 * Has `meanwhile` run inside the next call to `target[verb]`, before the call itself goes on: for
 * slipping another device's doings, or a pause, between a vault's look at storage and its write.
 * Only the next call is touched; later ones go straight through.
 *
 * @param target - The object whose method to intercept: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @param meanwhile - What to run first, and wait for.
 *
 * @example TH.beforeNextCall(vaultDB, 'updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
 */
export const beforeNextCall = <Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string, meanwhile: () => Promise<unknown>): void => {
  // Typed loosely from here: the caller's types were checked at the signature.
  type AsyncFn = (...args: unknown[]) => Promise<unknown>
  const original = (target as unknown as Record<string, AsyncFn | undefined>)[verb]?.bind(target)
  if (original === undefined) { throw new TypeError(`beforeNextCall found no method ${verb} to intercept.`) }
  vi.spyOn(target as unknown as Record<string, AsyncFn>, verb).mockImplementationOnce(async (...args: unknown[]) => {
    await meanwhile()
    return await original(...args)
  })
}

/**
 * Holds the next call to `target[verb]` at a gate (see {@link makeGate}) until the test releases
 * it, so the test can land another call while that one is in flight. Later calls go straight
 * through.
 *
 * @param target - The object whose method to hold: an adapter, a deriver.
 * @param verb - The method, one returning a promise.
 * @returns The gate: await `reached`, then `release()`.
 *
 * @example
 *   const gate = TH.holdNextCall(vaultDB, 'readBundle')
 *   const unlocking = vault.unlock('pw')   // now waiting at the gate
 *   await gate.reached
 *   await vault.lock()                     // lands mid-unlock
 *   gate.release()
 */
export const holdNextCall = <Target extends object>(target: Target, verb: AsyncVerbOf<Target> & string) => {
  const gate = makeGate()
  beforeNextCall(target, verb, gate.pass)
  return gate
}

/**
 * A count of the storage watches `vaultDB` opens and closes from here on, kept by spying on its
 * `subscribe`: for a test that a failed open, a close or a lock leaves no watch running that
 * nobody could end. Each watch still reaches the adapter's own `subscribe`.
 *
 * @param vaultDB - The adapter whose watches to count.
 * @returns The tally, live: `opened` and `closed`, each a count so far.
 *
 * @example
 *   const tally = TH.tallyWatches(vaultDB)
 *   await TH.expectRefusal(openVault(opts), 'not_permitted')
 *   expect(tally.opened - tally.closed).to.eq(0)
 */
export const tallyWatches = (vaultDB: Pick<VaultDB, 'subscribe'>) => {
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

/** Stands in for a resolver until the promise hands over its own. */
const unresolved = () => { /* replaced before use */ }

/** A promise, and apart from it the function that resolves it. */
const deferred = () => {
  let resolve: () => void = unresolved
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Promise.withResolvers is ES2024, and every tsconfig's lib stops at ES2023
  const promise = new Promise<void>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

/** One call a {@link spyLogger} heard: which of the three, and what it was handed. */
export type LoggedCall = {
  level:   keyof VaultLogger
  message: string | undefined
  story:   Record<string, unknown> | undefined
  err:     Error | null | undefined
}

/**
 * A VaultLogger that logs nowhere and keeps every call it hears, in order, for a test to look at.
 *
 * @returns The `logger` to hand openVault, and the `calls` it has heard so far.
 *
 * @example
 *   const spy = TH.spyLogger()
 *   const vault = await openVault({ ...opts, logger: spy.logger })
 *   spy.calls.map((call) => call.level)  // => ['warn'], say
 */
export const spyLogger = () => {
  const calls: LoggedCall[] = []
  const hear = (level: keyof VaultLogger): VaultLogger[typeof level] => (message, story, err) => {
    calls.push({ level, message, story, err })
  }
  const logger: VaultLogger = { log: hear('log'), warn: hear('warn'), error: hear('error') }
  return { logger, calls }
}

/**
 * Everything a logger was handed, as one text to search for what must never be there: each
 * call's message, its story as JSON, and its error -- message, stack, own properties -- down
 * through every cause. It never throws: a cause seen before is written `[cause seen above]`, and
 * a story or own properties JSON cannot write (a circular reference, a bigint) are written
 * `[not JSON]`, so what they hold goes unsearched.
 *
 * @param calls - What a {@link spyLogger} heard.
 * @returns The text, one call to a line.
 *
 * @example expect(TH.loggedText(spy.calls)).to.not.include(passphrase)
 */
export const loggedText = (calls: readonly LoggedCall[]): string => (
  calls.map((call) => [call.level, call.message ?? '', jsonOrPlaceholder(call.story ?? {}), thrownText(call.err)].join(' ')).join('\n')
)

/**
 * Everything a thrown value carries, as one text to search for what must never be there: an
 * error's message, stack and own properties, and the same of each cause beneath it; anything else
 * thrown, as JSON. Like {@link loggedText}, it never throws: a cause seen before is written
 * `[cause seen above]`, and own properties JSON cannot write are written `[not JSON]`.
 *
 * @param thrown - What an operation threw or rejected with.
 * @returns The text, blank for `undefined` or `null`.
 *
 * @example expect(TH.thrownText(err)).to.not.include(passphrase)
 */
export const thrownText = (thrown: unknown): string => errorText(thrown, new Set())

/**
 * Every string and number in `val`, at any depth, as text: the values of a record, to search an
 * error or a log for. Field names are not among them. Give the record values distinctive
 * enough that finding one means it was quoted: an epoch of `2` turns up in any stack's line numbers.
 *
 * @param val - A record, or any JSON value.
 * @returns Its leaves, in JSON's order.
 *
 * @example TH.leafTexts({ vault_id: 'vault-id-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })  // => ['vault-id-u1', 'ct-a1', '7']
 */
export const leafTexts = (val: unknown): string[] => {
  const leaves: string[] = []
  JSON.stringify(val, (_ckey, nested: unknown) => {
    if (typeof nested === 'string' || typeof nested === 'number') { leaves.push(String(nested)) }
    return nested
  })
  return leaves
}

/**
 * An error and every cause under it as text: message, stack and own properties each. Anything
 * else thrown, as JSON. `seen` holds the errors already written, so a cause cycle ends.
 */
const errorText = (thrown: unknown, seen: Set<unknown>): string => {
  if (thrown === undefined || thrown === null) { return '' }
  if (seen.has(thrown)) { return '[cause seen above]' }
  seen.add(thrown)
  if (! (thrown instanceof Error)) { return jsonOrPlaceholder(thrown) }
  return [thrown.message, thrown.stack ?? '', jsonOrPlaceholder(thrown), errorText(thrown.cause, seen)].join(' ')
}

/** `val` as JSON, or `[not JSON]` where JSON.stringify throws on it. */
const jsonOrPlaceholder = (val: unknown): string => {
  try {
    return JSON.stringify(val)
  } catch {
    return '[not JSON]'
  }
}

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'maxVaultBytes' | 'readBundle' | 'createBundle' | 'updateBundle' | 'readBox' | 'listBoxes' | 'updateBox' | 'eraseBox' | 'eraseVault' | 'subscribe'
>

/**
 * The behaviour every VaultDB owes, written once: each verb, each expectation holding and
 * failing, erase winning over a write, a scope with no bundle refusing, and a write or an erase
 * aimed at a vault since destroyed and made anew refusing. Run it against an adapter with a
 * factory making a fresh, empty one per test.
 *
 * For an adapter's own tests, from `safebyok/testing`; it runs under vitest. It checks refusals
 * by `kind` rather than by class, so an adapter passes whichever copy of the package it extends.
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
    await vaultDB.createBundle(bundleOf('u1'))
    return vaultDB
  }

  describe(`${adapterTitle}, as a VaultDB: the bundle`, () => {
    it("has none until one is created, then reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.createBundle(bundleOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("createBundle yields to a bundle already standing: the second device gets the first's back", async () => {
      const vaultDB = await withBundle()
      const latecomer = { ...bundleOf('u1'), vault_id: 'the-second-arrival' }
      expect(await vaultDB.createBundle(latecomer)).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("updateBundle lands while the standing bundle is the one proven against", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), passphrase_epoch: 2 }
      await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', passphrase_epoch: 1 })
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(next)
    })

    it("updateBundle refuses over a passphrase_epoch since moved on, writing nothing", async () => {
      const vaultDB = await withBundle()
      const theirs = { ...bundleOf('u1'), passphrase_epoch: 2, vault_key_passphrase_wrapped: fakeCiphered('theirs') }
      await vaultDB.updateBundle(theirs, { vault_id: 'vault-id-u1', passphrase_epoch: 1 })
      const mine = { ...bundleOf('u1'), passphrase_epoch: 2, vault_key_passphrase_wrapped: fakeCiphered('mine') }
      await expectRefusal(vaultDB.updateBundle(mine, { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(theirs)
    })

    it("updateBundle refuses over a vault made anew under another vault_id", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), vault_id: 'vault-id-gone', passphrase_epoch: 2 }
      await expectRefusal(vaultDB.updateBundle(next, { vault_id: 'vault-id-gone', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("updateBundle refuses where no bundle stands: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1'), { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })
  })

  describe(`${adapterTitle}, as a VaultDB: lockboxes`, () => {
    it("has no lockbox until one is written, then reads it back whole", async () => {
      const vaultDB = await withBundle()
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("replaces a lockbox over the revision it read", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'two'))
    })

    it("refuses a write over a revision it never read, writing nothing", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      // A second device that saw no box, and one that saw some other revision, both lose.
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), noBoxYet), 'stale_write')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-other' }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("erase wins: a write over a revision erased meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a write into a scope that holds no bundle", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a box sealed for a vault since destroyed and made anew, though no box stands in either", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'fresh'), { vault_id: 'vault-id-reborn', revision_id: null })
      const reborn = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(reborn?.revision_id).to.eq('rev-fresh')
    })

    it("lists summaries sorted by boxlabel, with format and both ciphered fields stripped", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      const summaries = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
      expect(summaries[0]).to.deep.equal({
        boxlabel:      'anthropic',
        revision_id:   'rev-one',
        note:          'a test box',
        registered_at: Date.UTC(2026, 9, 14),
        changed_at:    Date.UTC(2026, 9, 14),
      })
    })

    it("reads back a lockbox with no note field as stored, and lists it with a null note", async () => {
      const vaultDB = await withBundle()
      const { note: _note, ...noteless } = boxOf('anthropic', 'one')
      await vaultDB.updateBox(scopeOf('u1'), noteless, noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(noteless)
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summary?.note).to.be.null
    })

    it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null })
      const oneBox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      const twoBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
      expect(oneBox?.revision_id).to.eq('rev-one')
      expect(twoBox?.revision_id).to.eq('rev-two')
      expect(await vaultDB.listBoxes(scopeOf('u2'))).to.have.lengthOf(1)
    })

    it("refuses a write expecting another user's vault_id", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null }), 'stale_write')
    })
  })

  describe(`${adapterTitle}, as a VaultDB: erasing`, () => {
    it("eraseBox removes one box without touching its neighbours, and is quiet when there is none", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
    })

    it("eraseBox from a stale handle refuses: a vault destroyed and made anew keeps its box", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
      const kept = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(kept?.revision_id).to.eq('rev-reborn')
    })

    it("eraseBox refuses in a scope that holds no bundle, even with no box to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
    })

    it("eraseVault removes the bundle and every box of that scope, and nothing else", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null })
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
      expect(await vaultDB.readBundle(scopeOf('u2'))).to.not.be.null
      expect(await vaultDB.readBox(scopeOf('u2'), 'anthropic')).to.not.be.null
    })

    it("eraseVault from a stale handle refuses: a vault made anew survives, bundle and boxes", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const reborn = { ...bundleOf('u1'), vault_id: 'vault-id-reborn' }
      await vaultDB.createBundle(reborn)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(reborn)
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("eraseVault refuses where no bundle stands: there is no vault of that vault_id to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })
  })

  describe(`${adapterTitle}, as a VaultDB: its contract`, () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })

    it("declares the most it holds of one vault, no less than one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxVaultBytes).to.be.a('number')
      expect(vaultDB.maxVaultBytes).to.be.at.least(vaultDB.maxRecordBytes)
    })

    it("subscribe hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    it("refuses a malformed scope or boxlabel before storage sees it", async () => {
      const vaultDB = await withBundle()
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), vaultlabel: 'not-a-label' }), 'bad_label')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), 'not:a:label'), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('Not_a_label', 'one'), noBoxYet), 'bad_label')
      await expectRefusal(vaultDB.eraseBox({ ...scopeOf('u1'), user_id: '' }, 'anthropic', thisVault), 'bad_label')
    })

    it("refuses a malformed record or expectation, or a bundle under another vault_id, before storage sees it", async () => {
      const vaultDB = await withBundle()
      const overlong = boxOf('anthropic', 'one', { note: 'n'.repeat(257) })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), overlong, noBoxYet), 'bad_option')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: '' }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { passphrase_epoch: 0 }), { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { vault_id: 'vault-id-new', passphrase_epoch: 2 }), { vault_id: 'vault-id-u1', passphrase_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), { vault_id: '' }), 'bad_option')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })
  })
}

/**
 * The behaviour every DeviceDB owes, written once: no remembered unlock until one is written,
 * then that one back, its localUnlockKey still a non-extractable CryptoKey; each scope kept to
 * itself; and an erase of one, or of all. Run it against an adapter with a factory making a fresh,
 * empty one per test. For a DeviceDB's own tests, from `safebyok/testing`; it runs under vitest.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeDeviceDB - A fresh, empty adapter: no record in it, and none shared with another call.
 *
 * @example
 *   describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())
 */
export const describeDeviceDB = (adapterTitle: string, makeDeviceDB: () => DeviceDB | Promise<DeviceDB>) => {
  describe(`${adapterTitle}, as a DeviceDB`, () => {
    it("has no remembered unlock until one is written, then keeps it whole, localUnlockKey handle and all", async () => {
      const deviceDB = await makeDeviceDB()
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      const unlock = await unlockOf('u1')
      await deviceDB.writeUnlock(unlock)
      const kept = await deviceDB.readUnlock(scopeOf('u1'))
      expect(kept).to.deep.equal(unlock)
      expect(kept?.local_unlock_key).to.be.instanceOf(CryptoKey)
      expect(kept?.local_unlock_key.extractable).to.be.false
    })

    it("keeps unlocks per user: erasing one leaves the other", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'))
      await deviceDB.writeUnlock(await unlockOf('u2'))
      await deviceDB.eraseUnlock(scopeOf('u1'))
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readUnlock(scopeOf('u2'))).to.not.be.null
    })

    it("eraseAll forgets every remembered unlock", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeUnlock(await unlockOf('u1'))
      await deviceDB.writeUnlock(await unlockOf('u2'))
      await deviceDB.eraseAll()
      expect(await deviceDB.readUnlock(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readUnlock(scopeOf('u2'))).to.be.null
    })
  })
}

const unheard = (): void => undefined

/** What {@link expectRefusal} sees in place of an error when the operation resolved. */
const NotRefused = Symbol('not refused')

/**
 * The VaultError `operation` rejected with, once the test has checked it is one, of `kind`; the
 * test fails if `operation` resolves. Checked by name and `kind`, not by class: an adapter built
 * on the published package throws that package's VaultError, a different class from `src/`'s. A
 * test that means to prove the class adds its own `instanceOf`.
 *
 * @param operation - The call that should refuse.
 * @param kind - The refusal's expected `kind`.
 * @returns The refusal, for a closer look at its message or cause.
 *
 * @example await TH.expectRefusal(vault.read('anthropic_api_key'), 'vault_locked')
 * @example
 *   const err = await TH.expectRefusal(openVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
 *   expect(err.message).to.include('safebyok/browser')
 */
export const expectRefusal = async (operation: Promise<unknown>, kind: VaultErrorKind): Promise<VaultError> => {
  let refusal: unknown = NotRefused
  try {
    await operation
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of kind '${kind}', but the operation resolved`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(Error)
  expect(refusal).to.have.property('name', 'VaultError')
  expect(refusal).to.have.property('kind', kind)
  return refusal as VaultError
}

/**
 * `bag` with its `ckey` field left out, still typed as the whole bag: for a test that an
 * entrypoint refuses a caller who forgot a required option, which `exactOptionalPropertyTypes`
 * otherwise lets a test write only with a cast.
 *
 * @param bag - A complete bag of options.
 * @param ckey - The field to leave out.
 * @returns A copy of `bag` without that field.
 *
 * @example openVault(TH.omitting(opts, 'keyDeriver'))  // refuses: no keyDeriver
 */
export const omitting = <Bag extends object>(bag: Bag, ckey: keyof Bag): Bag => {
  const { [ckey]: _omitted, ...rest } = bag
  return rest as Bag
}
