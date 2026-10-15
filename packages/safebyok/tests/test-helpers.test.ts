import { describe, expect, it } from 'vitest'
import { localVaultDB, memoryDeviceDB, memoryStore, openVault } from '../src/index'
import { Ciphered, fromB64, toB64 } from '../src/crypto'
import { VaultError } from '../src/errors'
import { Lockbox, VaultBundle, VaultScope } from '../src/types'
import * as TH from './test-helpers'

const TweakCases = [
  // regular usage:
  ["Zm9v",  "am9v",  'swaps the first character for an a'],
  ["am9v",  "bm9v",  'swaps an a for a b, so the text still differs'],
  // edge cases:
  ["QQ",    "aQ",    'bends the shortest text that decodes, one byte'],
] as const

describe("tweakB64", () => {
  for (const [b64, expected, blurb] of TweakCases) {
    it(blurb, () => {
      expect(TH.tweakB64(b64)).to.eq(expected)
    })
  }

  it("never returns what it was given", () => {
    for (const first of 'AaBbZz09-_') {
      expect(TH.tweakB64(`${first}m9v`)).to.not.eq(`${first}m9v`)
    }
  })

  it("keeps the text decodable, to bytes of the same length", () => {
    for (const b64 of ['Zm9v', 'am9v', 'QQ', toB64(new Uint8Array(32).fill(255))]) {
      expect(fromB64(TH.tweakB64(b64))).to.have.lengthOf(fromB64(b64).length)
    }
  })

  it("throws on blank text, which has nothing to bend", () => {
    expect(() => TH.tweakB64('')).to.throw(TypeError, /blank text/)
  })
})

describe("wakeupAtNextTick", () => {
  it("lets a promise already settled, and a timer already due, run first", async () => {
    const heard: string[] = []
    queueMicrotask(() => { heard.push('microtask') })
    setTimeout(() => { heard.push('timer') }, 0)
    await TH.wakeupAtNextTick()
    heard.push('woke')
    expect(heard).to.deep.equal(['microtask', 'timer', 'woke'])
  })
})

describe("makeGate", () => {
  it("holds a pass until released, and says when something reached it", async () => {
    const gate = TH.makeGate()
    const heard: string[] = []
    const passing = (async () => {
      await gate.pass()
      heard.push('passed')
    })()
    await gate.reached
    heard.push('reached')
    await TH.wakeupAtNextTick()
    expect(heard).to.deep.equal(['reached'])
    gate.release()
    await passing
    expect(heard).to.deep.equal(['reached', 'passed'])
  })

  it("stays open once released: a later pass goes straight through", async () => {
    const gate = TH.makeGate()
    gate.release()
    let passes = 0
    await gate.pass()
    passes += 1
    await gate.pass()
    passes += 1
    await gate.reached
    expect(passes).to.eq(2)
  })
})

describe("testDeriver", () => {
  it("opens a vault, deterministic in passphrase and salt", async () => {
    const vault = await openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
    })
    await vault.unlock('correct horse battery staple')
    await vault.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    await vault.lock()
    await vault.unlock('correct horse battery staple')
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("derives the same bytes from the same passphrase and salt, and others from another", async () => {
    const salt = new Uint8Array(16)
    const once = await TH.testDeriver.deriveKeyBytes('pass', salt)
    expect(await TH.testDeriver.deriveKeyBytes('pass', salt)).to.deep.equal(once)
    expect(await TH.testDeriver.deriveKeyBytes('other', salt)).to.not.deep.equal(once)
  })
})

describe("the fixtures", () => {
  it("fakeCiphered: a shape-valid Ciphered named by its tag", () => {
    expect(TH.fakeCiphered('a1')).to.deep.equal({ cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' })
    expect(Ciphered.safeParse(TH.fakeCiphered('a1')).success).to.be.true
  })

  it("scopeOf: the user's main vault in acme, or the one named", () => {
    expect(TH.scopeOf('u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(TH.scopeOf('u1', 'spare')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' })
    expect(VaultScope.safeParse(TH.scopeOf('u1', 'spare')).success).to.be.true
  })

  it("bundleOf: a shape-valid VaultBundle, with any field overridden", () => {
    expect(VaultBundle.safeParse(TH.bundleOf('u1')).success).to.be.true
    expect(TH.bundleOf('u1', { passphrase_epoch: 2 })).to.deep.equal({ ...TH.bundleOf('u1'), passphrase_epoch: 2 })
  })

  it("boxOf: a shape-valid Lockbox, with any field overridden", () => {
    expect(Lockbox.safeParse(TH.boxOf('anthropic_api_key', 'a1')).success).to.be.true
    expect(TH.boxOf('anthropic_api_key', 'a1').revision_id).to.eq('rev-a1')
    expect(TH.boxOf('anthropic_api_key', 'a1', { note: 'work account' }).note).to.eq('work account')
  })
})

describe("spyLogger", () => {
  it("keeps every call it hears, in order, with what it was handed", () => {
    const spy = TH.spyLogger()
    const err = new Error('the storage adapter failed')
    spy.logger.warn('a refresh failed', { call: 'refresh' }, err)
    spy.logger.log()
    expect(spy.calls).to.deep.equal([
      { level: 'warn', message: 'a refresh failed', story: { call: 'refresh' }, err },
      { level: 'log',  message: undefined,          story: undefined,           err: undefined },
    ])
  })

  it("is a logger openVault takes", async () => {
    const spy = TH.spyLogger()
    const vault = await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, logger: spy.logger })
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(spy.calls).to.have.lengthOf(0)
  })
})

describe("loggedText", () => {
  it("holds each message, story and error, down through every cause and own property", () => {
    const spy = TH.spyLogger()
    const deepest = new Error('deepest cause')
    const tagged = Object.assign(new Error('middle', { cause: deepest }), { detail: 'an own property' })
    spy.logger.error('the message', { call: 'openVault' }, new Error('the error', { cause: tagged }))
    const text = TH.loggedText(spy.calls)
    for (const piece of ['error', 'the message', '"call":"openVault"', 'the error', 'middle', 'an own property', 'deepest cause']) {
      expect(text).to.include(piece)
    }
  })

  it("ends a cause cycle rather than walking it forever", () => {
    const spy = TH.spyLogger()
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    Object.defineProperty(first, 'cause', { value: second })
    spy.logger.warn('a cycle', undefined, first)
    const text = TH.loggedText(spy.calls)
    expect(text).to.include('first')
    expect(text).to.include('second')
    expect(text).to.include('[cause seen above]')
  })

  it("writes a placeholder for an own property or a story JSON cannot write, and still walks the causes", () => {
    const spy = TH.spyLogger()
    const looped: Record<string, unknown> = {}
    looped['self'] = looped
    const circular = Object.assign(new Error('circular', { cause: new Error('the cause below') }), { looped })
    spy.logger.error('a loop', { looped }, circular)
    const text = TH.loggedText(spy.calls)
    expect(text).to.include('[not JSON]')
    expect(text).to.include('circular')
    expect(text).to.include('the cause below')
  })

  it("puts each call on a line of its own, and is blank for none", () => {
    const spy = TH.spyLogger()
    expect(TH.loggedText(spy.calls)).to.eq('')
    spy.logger.log('one')
    spy.logger.log('two')
    expect(TH.loggedText(spy.calls).split('\n')).to.have.lengthOf(2)
  })
})

describe("thrownText", () => {
  it("holds an error's message, own properties and causes, the way loggedText does", () => {
    const deepest = Object.assign(new Error('deepest cause'), { detail: 'an own property' })
    const text = TH.thrownText(new Error('the error', { cause: deepest }))
    for (const piece of ['the error', 'deepest cause', 'an own property']) {
      expect(text).to.include(piece)
    }
  })

  it("writes something thrown that is no Error as JSON, and nothing for nothing", () => {
    expect(TH.thrownText({ kind: 'odd' })).to.eq('{"kind":"odd"}')
    expect(TH.thrownText(undefined)).to.eq('')
  })
})

describe("leafTexts", () => {
  it("lists every string and number at any depth, as text, and no field name", () => {
    const leaves = TH.leafTexts({ vault_id: 'vault-id-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })
    expect(leaves).to.deep.equal(['vault-id-u1', 'ct-a1', '7'])
  })

  it("reaches into arrays, and skips what is neither string nor number", () => {
    expect(TH.leafTexts({ tags: ['one', 2], gone: null, kept: true })).to.deep.equal(['one', '2'])
  })

  it("lists every value of a stored record", () => {
    const leaves = TH.leafTexts(TH.bundleOf('u1'))
    expect(leaves).to.include.members(['vault-id-u1', 'ct-bundle-u1', 'iv-bundle-u1', String(Date.UTC(2026, 9, 14))])
  })
})

describe("expectRefusal", () => {
  it("hands back the VaultError of the kind expected", async () => {
    const refusal = new VaultError('vault_locked', 'Unlock the vault first.')
    expect(await TH.expectRefusal(Promise.reject(refusal), 'vault_locked')).to.eq(refusal)
  })

  it("takes a VaultError from another copy of the package, by name and kind", async () => {
    // As another copy's VaultError is: a subclass of Error that names itself, with a kind.
    class LookalikeError extends Error {
      override readonly name = 'VaultError'
      readonly kind = 'vault_locked'
    }
    const lookalike = new LookalikeError('Unlock the vault first.')
    expect(await TH.expectRefusal(Promise.reject(lookalike), 'vault_locked')).to.eq(lookalike)
  })

  it("fails the test when the operation resolves, or refuses otherwise", async () => {
    const NotQuite = [
      [Promise.resolve('fine'),                                    /operation resolved/],
      [Promise.reject(new VaultError('bad_label', 'Not a label.')), /kind/],
      [Promise.reject(new Error('plain trouble')),                 /name/],
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a host's adapter may reject with anything, and the helper must say so
      [Promise.reject('a bare string'),                            /instance of Error/],
    ] as const
    for (const [operation, complaint] of NotQuite) {
      await expect(TH.expectRefusal(operation, 'vault_locked')).rejects.toThrow(complaint)
    }
  })

  it("lets a test look closer at what refused", async () => {
    const vault = await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver })
    const err = await TH.expectRefusal(vault.read('anthropic_api_key'), 'vault_locked')
    expect(err.message).to.be.a('string').and.not.be.empty
  })
})

describe("omitting", () => {
  const opts = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB(memoryStore()), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver }

  it("leaves out the one field named, and keeps the rest", () => {
    const without = TH.omitting(opts, 'keyDeriver')
    expect(without).to.not.have.property('keyDeriver')
    expect(Object.keys(without)).to.have.members(['applabel', 'userId', 'vaultlabel', 'vaultDB', 'deviceDB'])
    expect(opts.keyDeriver).to.eq(TH.testDeriver)
  })

  it("hands an entrypoint a bag short of a required option, with no cast", async () => {
    const err = await TH.expectRefusal(openVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
    expect(err.message).to.include('safebyok/browser')
  })
})
