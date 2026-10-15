import type { VaultScope } from 'safebyok'

/**
 * Where each record lives on the shelf: one row per record, under a ckey built from its scope,
 * so a read is one lookup and a vault's lockboxes are the rows under its prefix. These ckeys are
 * a stored contract -- a vault already written is found by them -- so they are never reshaped.
 * A key-value backend of your own keys its rows here.
 */

/** A vault's scope as one string, its three parts joined by colons. */
export const scopePath = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

/**
 * The ckey of a vault's bundle.
 *
 * @example bundleCkey({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // 'vault:acme:u1:main'
 */
export const bundleCkey = (scope: VaultScope) => `vault:${scopePath(scope)}`

/**
 * The ckey of one lockbox in a vault.
 *
 * @example boxCkey({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }, 'anthropic')  // 'box:acme:u1:main:anthropic'
 */
export const boxCkey = (scope: VaultScope, boxlabel: string) => `box:${scopePath(scope)}:${boxlabel}`

/**
 * True for the ckey of a lockbox in `scope`. A prefix alone is not enough: a user_id may hold a
 * colon, so another user's rows can share this scope's prefix -- but never with a bare boxlabel
 * (which holds no colon) after it.
 *
 * @example isBoxCkeyOf(scope, 'box:acme:u1:main:anthropic')    // true
 * @example isBoxCkeyOf(scope, 'box:acme:u1:main:x:anthropic')  // false: user `u1:main`'s vault `x`
 */
export const isBoxCkeyOf = (scope: VaultScope, ckey: unknown): ckey is string => {
  const prefix = `box:${scopePath(scope)}:`
  return typeof ckey === 'string' && ckey.startsWith(prefix) && ! ckey.slice(prefix.length).includes(':')
}
