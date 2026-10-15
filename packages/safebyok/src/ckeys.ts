import type { VaultScope } from './types'

/**
 * The ckeys safebyok's string-keyed adapters file rows under: `localVaultDB`, `idbVaultDB` and
 * `idbDeviceDB`, and any adapter of your own over a key-value store. Each ckey is the JSON text
 * of a tuple -- the row's kind, then the scope, then (for a lockbox) its boxlabel:
 *
 *     ["vault","acme","u1","main"]
 *     ["box","acme","u1","main","anthropic"]
 *     ["unlock","acme","u1","main"]
 *
 * JSON quotes and escapes every string, so any text at all may stand in any place -- colons,
 * quotes, commas, brackets, backslashes, control characters, any script -- and two different
 * tuples never share a ckey. A row's ckey is part of what is stored: an adapter that files rows
 * under these keeps them where every other version and every other device's copy looks for them.
 */

/**
 * The ckey of `scope`'s bundle.
 *
 * @example bundle(scope)  // '["vault","acme","u1","main"]'
 */
export const bundle = (scope: VaultScope): string => encode(['vault', ...scopeParts(scope)])

/**
 * The ckey of the lockbox under `boxlabel` in `scope`.
 *
 * @example box(scope, 'anthropic')  // '["box","acme","u1","main","anthropic"]'
 */
export const box = (scope: VaultScope, boxlabel: string): string => encode(['box', ...scopeParts(scope), boxlabel])

/**
 * The ckey of `scope`'s remembered unlock, on a device's own storage.
 *
 * @example unlock(scope)  // '["unlock","acme","u1","main"]'
 */
export const unlock = (scope: VaultScope): string => encode(['unlock', ...scopeParts(scope)])

/**
 * The text that begins the ckey of every lockbox in `scope`, and of nothing else safebyok
 * writes: a store that scans by prefix lists a vault's lockboxes with it. It is the ckey's JSON
 * up to the comma before the boxlabel, so a scope whose names extend another's -- `u1` and
 * `u1","x` -- has its own prefix, which never begins the other's ckeys.
 *
 * @example boxPrefix(scope)  // '["box","acme","u1","main",'
 */
export const boxPrefix = (scope: VaultScope): string => `${encode(['box', ...scopeParts(scope)]).slice(0, -1)},`

/**
 * A test for the ckeys of `scope`'s lockboxes, for filtering every ckey in a store: true for
 * each ckey that {@link box} gives for `scope`, false for any other ckey safebyok writes, and
 * false for anything that is not text.
 *
 * @example store.ckeys().filter(isBoxIn(scope))
 */
export const isBoxIn = (scope: VaultScope): ((ckey: unknown) => ckey is string) => {
  const prefix = boxPrefix(scope)
  return (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(prefix)
}

const scopeParts = (scope: VaultScope) => [scope.applabel, scope.user_id, scope.vaultlabel]

const encode = (parts: string[]): string => JSON.stringify(parts)
