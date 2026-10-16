/**
 * safebyok's test helpers, everything in one module: star-import it as `TH` in this package's
 * tests (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's.
 * A cheap key deriver, a vault's options over stores in memory, shape-valid records whose
 * ciphertext is fake, a live device unlock, small timing, interception and tampering aids, a
 * logger that keeps what it hears, checks that a call refuses and that what it threw quotes
 * nothing it shouldn't, and the suites every VaultDB and DeviceDB adapter owes (the VaultDB suite
 * runnable over an adapter made per signed-in user). For tests only, and under vitest: the
 * deriver is worthless against a brute-forcer.
 */
import { describe, expect, it, vi } from 'vitest'
import { toB64, type Ciphered } from '../src/crypto'
import { memoryDeviceDB, type DeviceDB } from '../src/device-db'
import type { VaultError, VaultErrorKind } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import type { VaultLogger } from '../src/logger'
import { memoryStore } from '../src/string-store'
import type { DamagedLockbox, DeviceUnlock, Lockbox, LockboxSummary, PasskeyEnvelope, PasskeyProof, PassphraseEnvelope, VaultBundle, VaultScope } from '../src/types'
import type { OpenVaultOpts } from '../src/vault'
import { localVaultDB, type VaultDB } from '../src/vault-db'
import { AnyTextValidators } from '../src/validators'

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
 * A shape-valid passphrase envelope labelled `unlocklabel`, its wrap fake: for storage-layer
 * tests, which never decrypt. Its unlock_id is `unlock-<unlocklabel>`.
 *
 * @example envelopeOf('passphrase')                                         // the one bundleOf holds
 * @example envelopeOf('home_phrase', { vault_key_wrapped: fakeCiphered('home') })
 */
export const envelopeOf = (unlocklabel: string, overrides: Partial<PassphraseEnvelope> = {}): PassphraseEnvelope => ({
  method:            'passphrase',
  unlock_id:         `unlock-${unlocklabel}`,
  unlocklabel,
  key_deriver_label: 'test_digest_v0',
  // base64 of the literal text 'saltsaltsaltsalt': a fake salt, public material anyway
  salt_b64:          'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_wrapped: fakeCiphered(`envelope-${unlocklabel}`),
  ...overrides,
})

/**
 * A shape-valid passkey envelope labelled `unlocklabel`, its wrap fake: for storage-layer tests,
 * which never decrypt. Its unlock_id is `unlock-<unlocklabel>`, its credential_id
 * `cred-<unlocklabel>`.
 *
 * @example passkeyEnvelopeOf('laptop')
 * @example bundleOf('u1', { unlocks: [envelopeOf('passphrase'), passkeyEnvelopeOf('laptop')] })
 */
export const passkeyEnvelopeOf = (unlocklabel: string, overrides: Partial<PasskeyEnvelope> = {}): PasskeyEnvelope => ({
  method:            'passkey',
  unlock_id:         `unlock-${unlocklabel}`,
  unlocklabel,
  credential_id:     `cred-${unlocklabel}`,
  // base64 of the literal text 'prfsaltprfsaltprfsaltprfsaltprfs': a fake 32-byte salt, public material anyway
  prf_salt_b64:      'cHJmc2FsdHByZnNhbHRwcmZzYWx0cHJmc2FsdHByZnM',
  vault_key_wrapped: fakeCiphered(`envelope-${unlocklabel}`),
  ...overrides,
})

/** SHA-256 of `text`'s UTF-8 bytes. */
const digestOf = async (text: string): Promise<Uint8Array> => (
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
)

/**
 * A passkey's answer, as a fake authenticator would give it: for tests, in place of a WebAuthn
 * call. The credential is `tag`'s own (its id base64url of `cred-<tag>`), the salt a 32-byte one
 * made from `tag` unless given, and the answer SHA-256 of the credential and salt -- so the same
 * passkey asked with the same salt answers the same, and with another salt answers otherwise, as
 * a real PRF does. Worthless as a secret: never hand it to a vault that holds a real one.
 *
 * @example await vault.addPasskey('pw', () => passkeyOf('laptop'), { unlocklabel: 'laptop' })
 * @example await vault.unlock(await passkeyOf('laptop'))
 * @example await passkeyOf('laptop', otherSaltB64)  // the same credential, answering another salt
 */
export const passkeyOf = async (tag: string, prfSaltB64?: string): Promise<PasskeyProof> => {
  const credentialId = toB64(new TextEncoder().encode(`cred-${tag}`))
  const saltB64 = prfSaltB64 ?? toB64(await digestOf(`salt-${tag}`))
  return { credentialId, prfSaltB64: saltB64, prfBytes: await digestOf(`${credentialId}:${saltB64}`) }
}

/**
 * A shape-valid VaultBundle for `userId`'s `main` vault, its one envelope fake: for storage-layer
 * tests, which never decrypt. Its vault_id is `vault-id-<userId>`, its epoch 1, and its one way in
 * an {@link envelopeOf} labelled `passphrase` whose wrap is `bundle-<userId>`.
 *
 * @example bundleOf('u1', { unlock_epoch: 2 })
 * @example bundleOf('u1', { unlocks: [envelopeOf('passphrase'), envelopeOf('home_phrase')] })
 */
export const bundleOf = (userId: string, overrides: Partial<VaultBundle> = {}): VaultBundle => ({
  format:              'safebyok-vault-v1',
  ...scopeOf(userId),
  vault_id:            `vault-id-${userId}`,
  unlock_epoch:    1,
  unlocks:             [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered(`bundle-${userId}`) })],
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
 * Labels the default grammar refuses and a host's validators may admit: ones differing only by a
 * colon, a quote, a backslash, a comma or a bracket, ones that would close a JSON string early,
 * and Hebrew, Arabic, Thai and mixed text.
 */
export const OddLabels = Object.freeze([
  'main', 'main:', 'main"', String.raw`main\\`, 'main,', 'main[', 'main]', 'main","x',
  'מפתח העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย',
] as const)

/**
 * A listed lockbox as the summary it should be: undefined stays undefined, and one listed as
 * damaged fails the test, naming its boxlabel. For a test reading a summary's fields out of a
 * listing or a snapshot, where TypeScript would otherwise have it ask after damage first.
 *
 * @example expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('work account')
 */
export const summaryOf = (box: LockboxSummary | DamagedLockbox | undefined): LockboxSummary | undefined => {
  if (box?.damaged === true) { throw new Error(`The lockbox '${box.boxlabel}' is listed as damaged, where a summary was expected.`) }
  return box
}

/**
 * What a write into {@link bundleOf}('u1')'s vault expects when its lockbox is not there yet:
 * that vault, and no revision. Frozen, since every test shares it.
 *
 * @example vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
 */
export const noBoxYet = Object.freeze({ vault_id: 'vault-id-u1', revision_id: null } as const)

/**
 * What an erase of {@link bundleOf}('u1')'s vault, or of a lockbox in it, expects: that vault.
 * Frozen, since every test shares it.
 *
 * @example vaultDB.eraseVault(TH.scopeOf('u1'), TH.thisVault)
 */
export const thisVault = Object.freeze({ vault_id: 'vault-id-u1' } as const)

/** A real DeviceUnlock for device-storage tests: a live non-extractable localUnlockKey around fake wrapped material. */
export const unlockOf = async (userId: string): Promise<DeviceUnlock> => ({
  format:                  'safebyok-unlock-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  unlock_epoch:        1,
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
 * @example await wakeupAtNextTick() // a refresh already settled has run its continuation
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
 * @example
 *   TH.beforeNextCall(vaultDB, 'updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
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
 * The numbered lines of the VaultDB contract (the core's `VAULTDB.md`), each by its number and
 * short title, as the document has them: {@link describeVaultDB} titles each of its groups by one,
 * and an adapter's own tests of a line the battery cannot reach (5.4, who may reach a vault) cite
 * it the same way. A line whose title is not here is not in the contract.
 *
 * @example describe(`postgresVaultDB, 5.5: ${TH.VaultDBContract['5.5']}`, () => { ... })
 */
export const VaultDBContract = Object.freeze({
  '1.1': 'What is stored reads back whole',
  '1.2': 'Each vault keeps to itself',
  '1.3': 'Nothing is repaired, and nothing is dropped',
  '2.1': 'A write that resolved is seen by every read after it',
  '2.2': 'Every lockbox stored can be read by its boxlabel',
  '2.3': 'A listing is whole',
  '3.1': 'A bundle is created once',
  '3.2': 'A bundle update lands only over the bundle it read',
  '3.3': 'A lockbox write lands only over the lockbox it read, in the vault it was sealed for',
  '3.4': 'An erase wins, within its vault',
  '3.5': 'A vault is erased whole, and alone',
  '3.6': 'A refused write wrote nothing',
  '3.7': 'Writes that do not collide all land',
  '4.1': 'An adapter declares the most lockboxes it holds in one vault',
  '4.2': 'A new lockbox past the limit is refused, on a best effort',
  '4.3': 'A replacement is never refused for the count',
  '4.4': 'Under the limit, a new lockbox lands',
  '4.5': 'Past the limit, nothing is lost',
  '4.6': "A hard limit is the backend's, or opt-in",
  '5.1': 'Every refusal is a VaultError whose kind says what to do',
  '5.2': 'A stale write means an expectation failed, and nothing else',
  '5.3': 'A refusal quotes nothing it was handed',
  '5.4': 'Only the signed-in user reaches their vaults',
  '5.5': 'identity_revoked means the user is gone',
  '5.6': 'not_permitted refuses one call, and locks nothing',
  '5.7': 'An adapter with no notion of identity says neither',
  '6.1': 'subscribe hands back an unsubscribe, and calls when the vault may have changed',
  '6.2': 'A watch that fails calls onChange',
  '7.1': 'The most it holds in one record',
  '7.2': 'The most it holds of one vault',
} as const)

/** A numbered line of the VaultDB contract, such as `'3.3'`. */
export type VaultDBContractLine = keyof typeof VaultDBContract

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'maxVaultBytes' | 'maxLockboxes' | 'readBundle' | 'createBundle' | 'updateBundle' | 'readBox' | 'listBoxes' | 'updateBox' | 'eraseBox' | 'eraseVault' | 'eraseDamagedVault' | 'subscribe'
>

/** What {@link describeVaultDB} takes beside its adapter. */
export type DescribeVaultDBOpts = {
  /**
   * A fresh, empty adapter that declares and holds `maxLockboxes` lockboxes in one vault, for the
   * lockbox limit's lines (4.2 to 4.5); without it, those are skipped. An adapter whose limit is
   * `Infinity`, or fixed and too large to fill in a test, has none to give.
   */
  makeCappedVaultDB?: ((maxLockboxes: number) => VaultDBVerbs | Promise<VaultDBVerbs>) | undefined
  /**
   * A fresh, empty backend, as a way to make an adapter over it signed in as a given user, or
   * signed out for null: for line 5.4, who may reach a vault; without it, that is skipped. An
   * adapter with no notion of identity has none to give.
   */
  makeVaultDBFor?: (() => ((userId: string | null) => VaultDBVerbs) | Promise<(userId: string | null) => VaultDBVerbs>) | undefined
  /**
   * Whether the adapter `makeVaultDB` makes pushes: calls a subscriber after each write through
   * it, for line 6.1's push tests; without it, those are skipped. An adapter with no push (a
   * backend that cannot say when it changed, or one whose push the factory left unwired) leaves
   * it out.
   */
  pushes?: boolean | undefined
}

/** The lockbox limit {@link describeVaultDB} asks a capped adapter for. */
const CappedLockboxes = 3

/**
 * The behaviour every VaultDB owes, written once: the VaultDB contract (the core's `VAULTDB.md`),
 * one group of tests for each of its numbered lines that a test can reach through an adapter's
 * public verbs, each group titled by its line ({@link VaultDBContract}). Run it against an adapter
 * with a factory making a fresh, empty one per test, and -- for an adapter with a lockbox limit a
 * test can fill -- a second making one held to a given limit, and for an adapter that serves the
 * user signed in, a third making one signed in as anyone; and for an adapter that pushes, a word
 * that it does.
 *
 * For an adapter's own tests, from `safebyok/testing`; it runs under vitest. It checks refusals
 * by `kind` rather than by class, so an adapter passes whichever copy of the package it extends.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeVaultDB - A fresh, empty adapter: no record in it, and none shared with another call.
 * @param opts - Optionally, `makeCappedVaultDB`, for the lockbox limit's lines; `makeVaultDBFor`,
 *   for who may reach a vault; and `pushes`, for subscribe's calls.
 *
 * @example
 *   describeVaultDB('localVaultDB', () => localVaultDB(memoryStore()), { pushes: true })
 * @example
 *   describeVaultDB('postgresVaultDB', makeRequest, {
 *     makeCappedVaultDB: (maxLockboxes) => postgresVaultDB({ client, userId: 'u1', maxLockboxes }),
 *     makeVaultDBFor:    () => (userId) => postgresVaultDB({ client, userId }),
 *   })
 */
export const describeVaultDB = (adapterTitle: string, makeVaultDB: () => VaultDBVerbs | Promise<VaultDBVerbs>, opts: DescribeVaultDBOpts = {}) => {
  const { makeCappedVaultDB, makeVaultDBFor, pushes = false } = opts

  /** The title of a group of tests for one line of the contract. */
  const lineTitle = (line: VaultDBContractLine) => `${adapterTitle}, as a VaultDB, ${line}: ${VaultDBContract[line]}`

  // The lockbox limit's lines run only over a capped adapter.
  const capped = makeCappedVaultDB !== undefined
  // And who may reach a vault, only over an adapter that knows who is signed in.
  const signsIn = makeVaultDBFor !== undefined

  /** A fresh adapter whose `u1` scope holds a bundle, as every lockbox write needs. */
  const withBundle = async () => {
    const vaultDB = await makeVaultDB()
    await vaultDB.createBundle(bundleOf('u1'))
    return vaultDB
  }

  /** A fresh backend whose u1 vault holds two lockboxes, and the way to sign in to it. */
  const servedHolding = async () => {
    if (! makeVaultDBFor) { throw new Error('describeVaultDB ran a sign-in test with no makeVaultDBFor.') }
    const vaultDBFor = await makeVaultDBFor()
    const owner = vaultDBFor('u1')
    await owner.createBundle(bundleOf('u1'))
    await storeEach(owner, ['anthropic', 'openai'])
    return { owner, vaultDBFor }
  }

  /** A fresh capped adapter, its `u1` vault made and holding a new lockbox under each boxlabel. */
  const cappedHolding = async (boxlabels: readonly string[]) => {
    if (! makeCappedVaultDB) { throw new Error('describeVaultDB ran a lockbox limit test with no makeCappedVaultDB.') }
    const vaultDB = await makeCappedVaultDB(CappedLockboxes)
    await vaultDB.createBundle(bundleOf('u1'))
    await storeEach(vaultDB, boxlabels)
    return vaultDB
  }

  describe(lineTitle('1.1'), () => {
    it("has no bundle until one is created, then reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.createBundle(bundleOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("has no lockbox until one is written, then reads it back whole", async () => {
      const vaultDB = await withBundle()
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("reads back a lockbox with no note field as stored, and lists it with a null note", async () => {
      const vaultDB = await withBundle()
      const { note: _note, ...noteless } = boxOf('anthropic', 'one')
      await vaultDB.updateBox(scopeOf('u1'), noteless, noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(noteless)
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.note).to.be.null
    })

    it("reads text back exactly as written, never normalized: a note holding a letter both composed and decomposed", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one', { note: UnnormalizedText }), noBoxYet)
      const lockbox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(lockbox?.note).to.eq(UnnormalizedText)
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.note).to.eq(UnnormalizedText)
    })
  })

  describe(lineTitle('1.2'), () => {
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

    it("keeps apart users whose ids differ only by a colon, a quote, a backslash, a comma or a bracket", async () => {
      const vaultDB = await makeVaultDB()
      const userIds = ['u1', 'u1:', 'u1"', String.raw`u1\\`, 'u1,', 'u1[', 'u1]', 'u1","main']
      for (const [ii, userId] of userIds.entries()) {
        await vaultDB.createBundle(bundleOf(userId))
        await vaultDB.updateBox(scopeOf(userId), boxOf('anthropic', `of-${String(ii)}`), { vault_id: `vault-id-${userId}`, revision_id: null })
      }
      const listEach = () => Promise.all(userIds.map((userId) => vaultDB.listBoxes(scopeOf(userId))))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => summaryOf(box)?.revision_id))).to.deep.equal(userIds.map((_userId, ii) => [`rev-of-${String(ii)}`]))
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal([0, 1, 1, 1, 1, 1, 1, 1])
    })

    it("keeps apart users whose ids differ only in how a letter is composed, reading each back as written", async () => {
      const vaultDB = await makeVaultDB()
      const [composed, decomposed] = ['caf\u{E9}', 'cafe\u{301}']
      for (const userId of [composed, decomposed]) {
        await vaultDB.createBundle(bundleOf(userId))
        await vaultDB.updateBox(scopeOf(userId), boxOf('anthropic', userId), { vault_id: `vault-id-${userId}`, revision_id: null })
      }
      expect(await vaultDB.readBundle(scopeOf(composed))).to.deep.equal(bundleOf(composed))
      expect(await vaultDB.readBundle(scopeOf(decomposed))).to.deep.equal(bundleOf(decomposed))
      await vaultDB.eraseVault(scopeOf(composed), { vault_id: `vault-id-${composed}` })
      expect(await vaultDB.readBundle(scopeOf(composed))).to.be.null
      const kept = await vaultDB.listBoxes(scopeOf(decomposed))
      expect(kept.map((box) => summaryOf(box)?.revision_id)).to.deep.equal([`rev-${decomposed}`])
    })

    it("keeps apart vaults and boxes whose labels differ only by a colon, a quote, a backslash, a comma or a bracket, or are in any script", async () => {
      const vaultDB = await makeVaultDB()
      const scopes = OddLabels.map((vaultlabel) => scopeOf('u1', vaultlabel))
      for (const [ii, scope] of scopes.entries()) {
        await vaultDB.createBundle(bundleOf('u1', { ...scope, vault_id: `vault-id-${String(ii)}` }), AnyTextValidators)
        await vaultDB.updateBox(scope, boxOf(OddLabels[ii] ?? '', `of-${String(ii)}`), { vault_id: `vault-id-${String(ii)}`, revision_id: null }, AnyTextValidators)
      }
      const listEach = () => Promise.all(scopes.map((scope) => vaultDB.listBoxes(scope, AnyTextValidators)))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => [box.boxlabel, summaryOf(box)?.revision_id]))).to.deep.equal(OddLabels.map((label, ii) => [[label, `rev-of-${String(ii)}`]]))
      await vaultDB.eraseVault(scopes[0] ?? scopeOf('u1'), { vault_id: 'vault-id-0' }, AnyTextValidators)
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal(OddLabels.map((_label, ii) => (ii === 0 ? 0 : 1)))
    })

    it("keeps boxes of one vault apart, by any labels, reading back each under its own", async () => {
      const vaultDB = await withBundle()
      for (const [ii, boxlabel] of OddLabels.entries()) {
        await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, `of-${String(ii)}`), noBoxYet, AnyTextValidators)
      }
      const summaries = await vaultDB.listBoxes(scopeOf('u1'), AnyTextValidators)
      expect(summaries.map((box) => box.boxlabel)).to.have.members([...OddLabels])
      for (const [ii, boxlabel] of OddLabels.entries()) {
        const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel, AnyTextValidators)
        expect(lockbox?.revision_id).to.eq(`rev-of-${String(ii)}`)
      }
      await vaultDB.eraseBox(scopeOf('u1'), 'main"', thisVault, AnyTextValidators)
      const remaining = await vaultDB.listBoxes(scopeOf('u1'), AnyTextValidators)
      expect(remaining).to.have.lengthOf(OddLabels.length - 1)
    })
  })

  describe(lineTitle('2.1'), () => {
    it("shows each write to the very next read and listing, and each erase likewise", async () => {
      const vaultDB = await withBundle()
      const revisionsNow = async () => ({
        read:   await revisionIn(vaultDB, 'anthropic'),
        listed: await listedRevisions(vaultDB),
      })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' })
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-two', listed: ['rev-two'] })
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      expect(await revisionsNow()).to.deep.equal({ read: null, listed: [] })
    })
  })

  describe(lineTitle('2.2'), () => {
    it("reads each of many lockboxes back by its boxlabel", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ManyBoxlabels)
      const revisions = await Promise.all(ManyBoxlabels.map((boxlabel) => revisionIn(vaultDB, boxlabel)))
      expect(revisions).to.deep.equal(ManyBoxlabels.map((boxlabel) => `rev-${boxlabel}`))
    })
  })

  describe(lineTitle('2.3'), () => {
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
        damaged:       false,
      })
    })

    it("lists every lockbox, however many: never a page or a sample", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ManyBoxlabels)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(ManyBoxlabels.toSorted((one, two) => one.localeCompare(two)))
    })

    it("lists the same twice with nothing written between", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['openai', 'anthropic', 'mistral'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.deep.equal(await vaultDB.listBoxes(scopeOf('u1')))
    })
  })

  describe(lineTitle('3.1'), () => {
    it("yields to a bundle already standing: the second device gets the first's back", async () => {
      const vaultDB = await withBundle()
      const latecomer = { ...bundleOf('u1'), vault_id: 'the-second-arrival' }
      expect(await vaultDB.createBundle(latecomer)).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("settles two devices creating at once on one bundle, which both get back", async () => {
      const vaultDB = await makeVaultDB()
      const [one, two] = await Promise.all([
        vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-one' }),
        vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-two' }),
      ])
      expect(one).to.deep.equal(two)
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(one)
    })
  })

  describe(lineTitle('3.2'), () => {
    it("lands while the standing bundle is the one proven against", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), unlock_epoch: 2 }
      await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(next)
    })

    it("refuses over an unlock_epoch since moved on, writing nothing", async () => {
      const vaultDB = await withBundle()
      const theirs = { ...bundleOf('u1'), unlock_epoch: 2, unlocks: [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered('theirs') })] }
      await vaultDB.updateBundle(theirs, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      const mine = { ...bundleOf('u1'), unlock_epoch: 2, unlocks: [envelopeOf('passphrase', { vault_key_wrapped: fakeCiphered('mine') })] }
      await expectRefusal(vaultDB.updateBundle(mine, { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(theirs)
    })

    it("refuses over a vault made anew under another vault_id", async () => {
      const vaultDB = await withBundle()
      const next = { ...bundleOf('u1'), vault_id: 'vault-id-gone', unlock_epoch: 2 }
      await expectRefusal(vaultDB.updateBundle(next, { vault_id: 'vault-id-gone', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
    })

    it("refuses where no bundle stands: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })

    it("lands one of two updates made at once over the same bundle, and refuses the other as stale_write", async () => {
      const vaultDB = await withBundle()
      const rivals = [bundleOf('u1', { unlock_epoch: 2, unlocks: [envelopeOf('one')] }), bundleOf('u1', { unlock_epoch: 2, unlocks: [envelopeOf('two')] })]
      const outcomes = await Promise.all(rivals.map((rival) => settledKind(vaultDB.updateBundle(rival, { vault_id: 'vault-id-u1', unlock_epoch: 1 }))))
      expect(outcomes.toSorted((one, two) => one.localeCompare(two))).to.deep.equal(['landed', 'stale_write'])
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(rivals[outcomes.indexOf('landed')])
    })
  })

  describe(lineTitle('3.3'), () => {
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

    it("refuses a write expecting another user's vault_id", async () => {
      const vaultDB = await withBundle()
      await vaultDB.createBundle(bundleOf('u2'))
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null }), 'stale_write')
    })

    it("lands one of two first writes of a lockbox made at once, and refuses the other as stale_write", async () => {
      const vaultDB = await withBundle()
      const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
      const outcomes = await Promise.all(rivals.map((rival) => settledKind(vaultDB.updateBox(scopeOf('u1'), rival, noBoxYet))))
      expect(outcomes.toSorted((one, two) => one.localeCompare(two))).to.deep.equal(['landed', 'stale_write'])
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(rivals[outcomes.indexOf('landed')])
    })

    it("lands one of two replacements made at once over the same revision, and refuses the other as stale_write", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['anthropic'])
      const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
      const outcomes = await Promise.all(rivals.map((rival) => settledKind(vaultDB.updateBox(scopeOf('u1'), rival, { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic' }))))
      expect(outcomes.toSorted((one, two) => one.localeCompare(two))).to.deep.equal(['landed', 'stale_write'])
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(rivals[outcomes.indexOf('landed')])
    })
  })

  describe(lineTitle('3.4'), () => {
    it("removes one box without touching its neighbours, and is quiet when there is none", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
    })

    it("wins over a write: a write over a revision erased meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one' }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses from a stale handle: a vault destroyed and made anew keeps its box", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.createBundle({ ...bundleOf('u1'), vault_id: 'vault-id-reborn' })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
      const kept = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(kept?.revision_id).to.eq('rev-reborn')
    })

    it("refuses in a scope that holds no bundle, even with no box to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault), 'stale_write')
    })

    it("wins over a replacement made at once: the erase lands, and the lockbox is gone whichever came first", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['anthropic'])
      const erasing = vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault)
      const writing = vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic' })
      const [erased, written] = await Promise.all([settledKind(erasing), settledKind(writing)])
      expect(erased).to.eq('landed')
      expect(['landed', 'stale_write']).to.include(written)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })
  })

  describe(lineTitle('3.5'), () => {
    it("removes the bundle and every box of that scope, and nothing else", async () => {
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

    it("refuses from a stale handle: a vault made anew survives, bundle and boxes", async () => {
      const vaultDB = await withBundle()
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const reborn = { ...bundleOf('u1'), vault_id: 'vault-id-reborn' }
      await vaultDB.createBundle(reborn)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_id: null })
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(reborn)
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("refuses where no bundle stands: there is no vault of that vault_id to erase", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })

    it("leaves no lockbox behind a vault erased while one was written into it", async () => {
      const vaultDB = await withBundle()
      const erasing = vaultDB.eraseVault(scopeOf('u1'), thisVault)
      const writing = vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      const [erased, written] = await Promise.all([settledKind(erasing), settledKind(writing)])
      expect(erased).to.eq('landed')
      expect(['landed', 'stale_write']).to.include(written)
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("eraseDamagedVault leaves a vault that stands sound as it is, and is quiet where none stands", async () => {
      const vaultDB = await withBundle()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await expectRefusal(vaultDB.eraseDamagedVault(scopeOf('u1')), 'bad_option')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
      await vaultDB.eraseVault(scopeOf('u1'), thisVault)
      await vaultDB.eraseDamagedVault(scopeOf('u1'))
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.be.null
    })
  })

  describe(lineTitle('3.6'), () => {
    it("leaves the whole vault as it stood after each refusal: bundle, boxes and listing", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['anthropic', 'openai'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])
      const refusals = [
        [() => vaultDB.updateBundle(bundleOf('u1', { unlock_epoch: 3 }), { vault_id: 'vault-id-u1', unlock_epoch: 2 }),                 'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'late'), { vault_id: 'vault-id-u1', revision_id: 'rev-other' }),      'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late'), { vault_id: 'vault-id-gone', revision_id: null }),             'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late', { note: 'n'.repeat(257) }), noBoxYet),                         'bad_option'],
        [() => vaultDB.eraseBox(scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-gone' }),                                               'stale_write'],
        [() => vaultDB.eraseVault(scopeOf('u1'), { vault_id: 'vault-id-gone' }),                                                          'stale_write'],
      ] as const
      for (const [refuse, kind] of refusals) {
        await expectRefusal(refuse(), kind)
        expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
      }
    })
  })

  describe(lineTitle('3.7'), () => {
    it("lands every new lockbox written into one vault at once", async () => {
      const vaultDB = await withBundle()
      const boxlabels = ['anthropic', 'openai', 'mistral', 'gemini']
      await Promise.all(boxlabels.map((boxlabel) => vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet)))
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.have.members(boxlabels)
    })

    it("lands a replacement, a new lockbox and an erase of three different lockboxes made at once", async () => {
      const vaultDB = await withBundle()
      await storeEach(vaultDB, ['anthropic', 'openai'])
      await Promise.all([
        vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic' }),
        vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'mistral'), noBoxYet),
        vaultDB.eraseBox(scopeOf('u1'), 'openai', thisVault),
      ])
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => [box.boxlabel, summaryOf(box)?.revision_id])).to.deep.equal([['anthropic', 'rev-next'], ['mistral', 'rev-mistral']])
    })
  })

  describe(lineTitle('4.1'), () => {
    it("declares a whole number of lockboxes above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxLockboxes === Infinity || (Number.isSafeInteger(vaultDB.maxLockboxes) && vaultDB.maxLockboxes > 0)).to.be.true
    })
  })

  describe.runIf(capped)(lineTitle('4.2'), () => {
    it("refuses a new lockbox in a full vault as vault_full, writing nothing", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])).to.deep.equal(before)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'mistral', 'openai'])
    })

    it("never lets writes made one after another past the limit", async () => {
      const vaultDB = await cappedHolding([])
      const write = (boxlabel: string) => settledKind(vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))
      const outcomes = [await write('anthropic'), await write('openai'), await write('mistral'), await write('gemini'), await write('cohere')]
      expect(outcomes).to.deep.equal(['landed', 'landed', 'landed', 'vault_full', 'vault_full'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(CappedLockboxes)
    })
  })

  describe.runIf(capped)(lineTitle('4.3'), () => {
    it("replaces a lockbox in a full vault", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'next'), { vault_id: 'vault-id-u1', revision_id: 'rev-openai' })
      const replaced = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(replaced?.revision_id).to.eq('rev-next')
    })

    it("refuses a first write under a boxlabel already taken in a full vault as stale_write, not vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'mine'), noBoxYet), 'stale_write')
      const standing = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(standing?.revision_id).to.eq('rev-openai')
    })
  })

  describe.runIf(capped)(lineTitle('4.4'), () => {
    it("lands a new lockbox once an erase has made room", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      await vaultDB.eraseBox(scopeOf('u1'), 'openai', thisVault)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'gemini', 'mistral'])
    })
  })

  describe.runIf(capped)(lineTitle('4.5'), () => {
    it("keeps every lockbox that landed when writers race for the last place, and leaves nothing of those refused", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai'])
      const racers = ['mistral', 'gemini', 'cohere', 'groq']
      const outcomes = await Promise.all(racers.map((boxlabel) => settledKind(vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))))
      // However many found room -- one, where the adapter checks strictly; more, where it does
      // not -- each landed or was refused as full, and at least one landed.
      expect(outcomes.every((outcome) => outcome === 'landed' || outcome === 'vault_full')).to.be.true
      const landed = racers.filter((_boxlabel, ii) => outcomes[ii] === 'landed')
      expect(landed).to.not.have.lengthOf(0)
      const found = await Promise.all(racers.map((boxlabel) => revisionIn(vaultDB, boxlabel)))
      expect(found).to.deep.equal(racers.map((boxlabel, ii) => (outcomes[ii] === 'landed' ? `rev-${boxlabel}` : null)))
      // Back under the limit, keeping one racer that landed: the listing is whole again.
      const [kept, ...others] = landed
      for (const boxlabel of ['anthropic', 'openai', ...others]) { await vaultDB.eraseBox(scopeOf('u1'), boxlabel, thisVault) }
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal([kept])
    })
  })

  describe(lineTitle('5.1'), () => {
    it("refuses a malformed scope or boxlabel as bad_label, before storage sees it", async () => {
      const vaultDB = await withBundle()
      await expectRefusal(vaultDB.readBundle({ ...scopeOf('u1'), vaultlabel: 'not-a-label' }), 'bad_label')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), 'not:a:label'), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('Not_a_label', 'one'), noBoxYet), 'bad_label')
      await expectRefusal(vaultDB.eraseBox({ ...scopeOf('u1'), user_id: '' }, 'anthropic', thisVault), 'bad_label')
      const overlongScope = scopeOf('u'.repeat(101))
      await expectRefusal(vaultDB.listBoxes(overlongScope), 'bad_label')
    })

    it("refuses a malformed record or expectation, or a bundle under another vault_id, as bad_option, before storage sees it", async () => {
      const vaultDB = await withBundle()
      const overlong = boxOf('anthropic', 'one', { note: 'n'.repeat(257) })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), overlong, noBoxYet), 'bad_option')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: '' }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { unlock_epoch: 0 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.updateBundle(bundleOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_option')
      await expectRefusal(vaultDB.eraseVault(scopeOf('u1'), { vault_id: '' }), 'bad_option')
      expect(await vaultDB.readBundle(scopeOf('u1'))).to.deep.equal(bundleOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })
  })

  describe(lineTitle('5.3'), () => {
    it("quotes no ciphertext, boxlabel or note of a write it refuses as stale", async () => {
      const vaultDB = await withBundle()
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { note: 'a note never to be quoted' })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, { vault_id: 'vault-id-gone', revision_id: null }), 'stale_write')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })

    it.runIf(capped)("quotes no ciphertext, boxlabel or note of a lockbox it refuses as vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { note: 'a note never to be quoted' })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, noBoxYet), 'vault_full')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })
  })

  describe.runIf(signsIn)(lineTitle('5.4'), () => {
    it("refuses another user every verb on a vault as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor('u2'))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })

    it("refuses every verb while no one is signed in as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor(null))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })
  })

  describe(lineTitle('6.1'), () => {
    it("hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    it.runIf(pushes)("calls onChange after each kind of write to the vault", async () => {
      const vaultDB = await makeVaultDB()
      const { heard, onChange } = changeCounter()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), onChange)
      await watchSettled(vaultDB)
      const writes = [
        () => vaultDB.createBundle(bundleOf('u1')),
        () => vaultDB.updateBundle(bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }),
        () => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet),
        () => vaultDB.eraseBox(scopeOf('u1'), 'anthropic', thisVault),
        () => vaultDB.eraseVault(scopeOf('u1'), thisVault),
      ]
      for (const write of writes) {
        const heardBefore = heard.count
        await write()
        await vi.waitFor(() => { expect(heard.count).to.be.greaterThan(heardBefore) })
      }
      unsubscribe()
    })

    it.runIf(pushes)("calls an unsubscribed onChange no more, however often it unsubscribes, while another watch still hears", async () => {
      const vaultDB = await makeVaultDB()
      const gone = changeCounter()
      const stays = changeCounter()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), gone.onChange)
      const unsubscribeStays = vaultDB.subscribe(scopeOf('u1'), stays.onChange)
      await watchSettled(vaultDB)
      unsubscribe()
      unsubscribe()
      const [goneBefore, staysBefore] = [gone.heard.count, stays.heard.count]
      await vaultDB.createBundle(bundleOf('u1'))
      await vi.waitFor(() => { expect(stays.heard.count).to.be.greaterThan(staysBefore) })
      await wakeupAtNextTick()
      expect(gone.heard.count).to.eq(goneBefore)
      unsubscribeStays()
    })
  })

  describe(lineTitle('7.1'), () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })
  })

  describe(lineTitle('7.2'), () => {
    it("declares the most it holds of one vault, no less than one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxVaultBytes).to.be.a('number')
      expect(vaultDB.maxVaultBytes).to.be.at.least(vaultDB.maxRecordBytes)
    })
  })
}

/** Every verb a stranger might try on `u1`'s vault, each as a thunk. */
const everyVerbOn = (stranger: VaultDBVerbs) => [
  () => stranger.readBundle(scopeOf('u1')),
  () => stranger.createBundle(bundleOf('u1', { vault_id: 'vault-id-theirs' })),
  () => stranger.updateBundle(bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }),
  () => stranger.readBox(scopeOf('u1'), 'anthropic'),
  () => stranger.listBoxes(scopeOf('u1')),
  () => stranger.updateBox(scopeOf('u1'), boxOf('anthropic', 'theirs'), { vault_id: 'vault-id-u1', revision_id: 'rev-anthropic' }),
  () => stranger.updateBox(scopeOf('u1'), boxOf('mistral', 'theirs'), noBoxYet),
  () => stranger.eraseBox(scopeOf('u1'), 'openai', thisVault),
  () => stranger.eraseVault(scopeOf('u1'), thisVault),
]

/** Text no normalization leaves alone: "café" with its accent composed, then decomposed, and a key. */
const UnnormalizedText = 'caf\u{E9} cafe\u{301} \u{1F511}'

/** How often its `onChange` has been called, kept for a test to look at. */
const changeCounter = () => {
  const heard = { count: 0 }
  return { heard, onChange: () => { heard.count += 1 } }
}

/**
 * Resolves once a watch just made through `vaultDB` has had time to start: after a read through
 * it, which follows the watch over a backend that serves calls in order, and a pause for one that
 * starts its watch on its own time. A watch's first call, where it makes one, is in by then.
 */
const watchSettled = async (vaultDB: VaultDBVerbs) => {
  await vaultDB.readBundle(scopeOf('u1'))
  await new Promise((resolve) => { setTimeout(resolve, 50) })
}

/** Enough lockboxes that a listing cut to a page, or a sample, would show it: 25, `box0` to `box24`. */
const ManyBoxlabels = Object.freeze(Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`))

/** A new lockbox under each boxlabel, in `u1`'s vault, one after another: its revision `rev-<boxlabel>`. */
const storeEach = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet) }
}

/** Everything `u1`'s vault holds, as its verbs read it: the bundle, the listing, and each of `boxlabels` read. */
const standingVault = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => ({
  bundle:  await vaultDB.readBundle(scopeOf('u1')),
  listed:  await vaultDB.listBoxes(scopeOf('u1')),
  lockboxes: await Promise.all(boxlabels.map((boxlabel) => vaultDB.readBox(scopeOf('u1'), boxlabel))),
})

/** The revision of `u1`'s lockbox under `boxlabel`, or null when there is none. */
const revisionIn = async (vaultDB: VaultDBVerbs, boxlabel: string): Promise<string | null> => {
  const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel)
  return lockbox?.revision_id ?? null
}

/** The revision of each lockbox `u1`'s listing shows, in its order. */
const listedRevisions = async (vaultDB: VaultDBVerbs): Promise<(string | undefined)[]> => {
  const listed = await vaultDB.listBoxes(scopeOf('u1'))
  return listed.map((box) => summaryOf(box)?.revision_id)
}

/** How a write settled: `landed`, or the kind it was refused with (`unknown` for no kind). */
const settledKind = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write
    return 'landed'
  } catch (err) {
    const { kind } = err as { kind?: unknown }
    return typeof kind === 'string' ? kind : 'unknown'
  }
}

/** Which of a lockbox's boxlabel, note and ciphertexts a refusal quotes anywhere. */
const quotedOf = (refusal: unknown, lockbox: WrittenLockbox): string[] => {
  const told = thrownText(refusal)
  const quotable = [lockbox.boxlabel, lockbox.note ?? '', ...leafTexts(lockbox.lockbox_key_wrapped), ...leafTexts(lockbox.whisper_ciphered)]
  return quotable.filter((text) => text !== '' && told.includes(text))
}

/**
 * One adapter reaching every user's vaults, made of a VaultDB per user: for
 * {@link describeVaultDB} over an adapter that serves only the user signed in, as a server's
 * does when it makes one per request. The suite reaches two users' vaults through one adapter;
 * this sends each verb to the VaultDB `vaultDBFor` made for the user its scope or bundle names,
 * making each user's once and keeping it. Its limits are those of the one made for `anyone`.
 *
 * @param vaultDBFor - The VaultDB a request signed in as `userId` gets.
 * @returns The verbs of one adapter, each sent on to its user's VaultDB.
 *
 * @example
 *   describeVaultDB('postgresVaultDB', () => perUser((userId) => postgresVaultDB({ client, userId })))
 */
export const perUser = (vaultDBFor: (userId: string) => VaultDBVerbs): VaultDBVerbs => {
  const vaultDBs = new Map<string, VaultDBVerbs>()
  const as = ({ user_id }: { user_id: string }): VaultDBVerbs => {
    const known = vaultDBs.get(user_id)
    if (known) { return known }
    const vaultDB = vaultDBFor(user_id)
    vaultDBs.set(user_id, vaultDB)
    return vaultDB
  }
  const anyone = as({ user_id: 'anyone' })
  return {
    maxRecordBytes: anyone.maxRecordBytes,
    maxVaultBytes:  anyone.maxVaultBytes,
    maxLockboxes:   anyone.maxLockboxes,
    readBundle:     (scope, validators) => as(scope).readBundle(scope, validators),
    createBundle:   (bundle, validators) => as(bundle).createBundle(bundle, validators),
    updateBundle:   (bundle, expected, validators) => as(bundle).updateBundle(bundle, expected, validators),
    readBox:        (scope, boxlabel, validators) => as(scope).readBox(scope, boxlabel, validators),
    listBoxes:      (scope, validators) => as(scope).listBoxes(scope, validators),
    updateBox:      (scope, lockbox, expected, validators) => as(scope).updateBox(scope, lockbox, expected, validators),
    eraseBox:       (scope, boxlabel, expected, validators) => as(scope).eraseBox(scope, boxlabel, expected, validators),
    eraseVault:     (scope, expected, validators) => as(scope).eraseVault(scope, expected, validators),
    eraseDamagedVault: (scope, validators) => as(scope).eraseDamagedVault(scope, validators),
    subscribe:      (scope, onChange, validators) => as(scope).subscribe(scope, onChange, validators),
  }
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
