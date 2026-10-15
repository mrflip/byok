import { fakeCiphered, scopeOf } from '../src/testing'
import type { DeviceUnlock } from '../src/types'

/** A real DeviceUnlock for device-storage tests: a live non-extractable localUnlockKey around fake wrapped material. */
export const unlockOf = async (userId: string): Promise<DeviceUnlock> => ({
  format:                  'safebyok-unlock-v1',
  ...scopeOf(userId),
  vault_id:                `vault-id-${userId}`,
  passphrase_epoch:        1,
  local_unlock_key:        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_local_wrapped: fakeCiphered(`local-${userId}`),
  expires_at:              1_900_000_000_000,
})

/**
 * Base64url text, bent a little: its first character swapped for another valid one, so it is
 * always different, keeps its length, and a tamper test reaches the check it means to exercise.
 * Blank text has no character to swap, so it comes back as `'a'`.
 *
 * @param b64 - Base64url text.
 * @returns Text that differs from `b64` in its first character only.
 *
 * @example tweakB64('Zm9v') // 'am9v'
 * @example tweakB64('am9v') // 'bm9v'
 * @example tweakB64('') // 'a'
 */
export const tweakB64 = (b64: string): string => {
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
 *   const slowDeriver = { ...testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => { await gate.pass(); return await testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
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

/** Stands in for a resolver until the promise hands over its own. */
const unresolved = () => { /* replaced before use */ }

/** A promise, and apart from it the function that resolves it. */
const deferred = () => {
  let resolve: () => void = unresolved
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Promise.withResolvers is ES2024, and every tsconfig's lib stops at ES2023
  const promise = new Promise<void>((resolver) => { resolve = resolver })
  return { promise, resolve }
}
