import { Ckeys, type VaultScope } from 'safebyok'

/**
 * Where each record lives on the shelf: one row per record, under a ckey built from its scope,
 * so a read is one lookup and a vault's lockboxes are the rows under its prefix. The core's
 * `Ckeys` gives them, the JSON text of a tuple, so a name may hold any text without two vaults
 * sharing a row. These ckeys are a stored contract -- a vault already written is found by them
 * -- so they are never reshaped. A key-value backend of your own keys its rows with `Ckeys` too.
 */

/**
 * The ckey of a vault's bundle.
 *
 * @example bundleCkey({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // '["vault","acme","u1","main"]'
 */
export const bundleCkey = (scope: VaultScope): string => Ckeys.bundle(scope)

/**
 * The ckey of one lockbox in a vault.
 *
 * @example boxCkey({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }, 'anthropic')  // '["box","acme","u1","main","anthropic"]'
 */
export const boxCkey = (scope: VaultScope, boxlabel: string): string => Ckeys.box(scope, boxlabel)

/**
 * True for the ckey of a lockbox in `scope`: the vault's own prefix is not shared by any other
 * vault's rows, whatever characters its names hold.
 *
 * @example isBoxCkeyOf(scope, '["box","acme","u1","main","anthropic"]')    // true
 * @example isBoxCkeyOf(scope, '["box","acme","u1","main","x","anthropic"]') // false: a user named `u1","main`
 */
export const isBoxCkeyOf = (scope: VaultScope, ckey: unknown): ckey is string => Ckeys.isBoxIn(scope)(ckey)
