import * as Z from 'zod/mini'
import { VaultError, isVaultError } from './errors'
import type { VaultDB } from './vault-db'

/**
 * What a vault does when its storage says the user it was opened for is no longer the one signed
 * in -- a refusal of kind `identity_revoked` -- as openVault's `whenIdentityRevoked` chooses:
 *
 * * `lock`, the default: lock at once, as `lock()` does. The vaultKey is dropped from memory, this
 *   device forgets its remembered unlock, a `lockSoon()` grace is cut short, and an `unlock()`
 *   still under way loses. Nothing stored is erased: not the vault, not a lockbox. Once the user
 *   signs in again, the vault asks for their passphrase.
 * * `stay`: nothing beyond throwing the refusal. The vault stays as it was, unlocked or not, and
 *   the host locks or closes it itself when its user signs out.
 *
 * Either way the call that met the refusal throws it, and the vault never erases anything for one.
 *
 * @example openVault({ ...opts })                               // locks when its user signs out
 * @example openVault({ ...opts, whenIdentityRevoked: 'stay' })  // the host locks it on its own sign-out
 */
export const IdentityRevokedResponseVals = ['lock', 'stay'] as const
export type IdentityRevokedResponse = typeof IdentityRevokedResponseVals[number]

/** What `whenIdentityRevoked` is when a host leaves it out: lock. */
export const DefaultIdentityRevokedResponse: IdentityRevokedResponse = 'lock'

/** What a vault does with a refusal from storage beyond throwing it: lock, or nothing more. */
export type RefusalResponse = 'lock' | 'none'

const identityRevokedResponse = Z._default(Z.enum(IdentityRevokedResponseVals), DefaultIdentityRevokedResponse)

/**
 * openVault's `whenIdentityRevoked`, checked: `lock` or `stay`, and `lock` when left out. Kind
 * 'bad_option' for anything else.
 *
 * @param candidate - The option as the host passed it.
 */
export const parse = (candidate: IdentityRevokedResponse | undefined): IdentityRevokedResponse => {
  const checked = identityRevokedResponse.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "whenIdentityRevoked is 'lock' (the default: the vault locks when storage says its user signed out) or 'stay' (the host locks it itself).")
  }
  return checked.data
}

/**
 * What a vault does about `refusal`, a storage call's, beyond throwing it: every storage refusal's
 * consequence for the vault, decided in this one place. Only `identity_revoked` does anything --
 * locks, unless the host chose `stay`. `not_permitted` is the vault's own user refused one call,
 * which locking would not mend; `stale_write`, `vault_full` and `storage_unavailable` say nothing
 * about who is signed in.
 *
 * @param refusal - What a storage call threw.
 * @param whenIdentityRevoked - The host's choice, as {@link parse} checked it.
 * @returns `lock`, or `none`.
 *
 * @example decide(new VaultError('identity_revoked', 'Signed out.'), 'lock')  // 'lock'
 * @example decide(new VaultError('identity_revoked', 'Signed out.'), 'stay')  // 'none'
 * @example decide(new VaultError('not_permitted', 'Not yours.'), 'lock')     // 'none'
 */
export const decide = (refusal: unknown, whenIdentityRevoked: IdentityRevokedResponse): RefusalResponse => (
  whenIdentityRevoked === 'lock' && isVaultError(refusal, 'identity_revoked') ? 'lock' : 'none'
)

/** The verbs a vault calls on its VaultDB. */
export type HeededVaultDB = Pick<VaultDB, 'readBundle' | 'createBundle' | 'updateBundle' | 'readBox' | 'listBoxes' | 'updateBox' | 'eraseBox' | 'eraseVault' | 'subscribe'>

/**
 * `vaultDB`'s verbs, each handing any VaultError it rejects with to `onRefusal`, and waiting for
 * it, before rejecting with it as before: so a vault meets every storage refusal, whichever of its
 * calls made it, a background refresh's included. Each verb takes its arguments as `vaultDB`'s
 * does, passed on whole, and is looked up on `vaultDB` as it is called, so a test's spy on one is
 * heard. `subscribe`, which answers at once, passes through.
 *
 * @param vaultDB - The storage adapter the host passed to openVault.
 * @param onRefusal - What the vault does about a refusal. Whatever it throws is dropped: the
 *   refusal is what the caller must hear.
 */
export const heed = (vaultDB: VaultDB, onRefusal: (refusal: VaultError) => Promise<void>): HeededVaultDB => {
  const heeding = async <ValT>(call: () => Promise<ValT>): Promise<ValT> => {
    try {
      return await call()
    } catch (err) {
      if (err instanceof VaultError) { await heard(onRefusal, err) }
      throw err
    }
  }
  return {
    readBundle:   (...args) => heeding(() => vaultDB.readBundle(...args)),
    createBundle: (...args) => heeding(() => vaultDB.createBundle(...args)),
    updateBundle: (...args) => heeding(() => vaultDB.updateBundle(...args)),
    readBox:      (...args) => heeding(() => vaultDB.readBox(...args)),
    listBoxes:    (...args) => heeding(() => vaultDB.listBoxes(...args)),
    updateBox:    (...args) => heeding(() => vaultDB.updateBox(...args)),
    eraseBox:     (...args) => heeding(() => vaultDB.eraseBox(...args)),
    eraseVault:   (...args) => heeding(() => vaultDB.eraseVault(...args)),
    subscribe:    (...args) => vaultDB.subscribe(...args),
  }
}

/** `onRefusal(refusal)`, awaited, anything it throws dropped. */
const heard = async (onRefusal: (refusal: VaultError) => Promise<void>, refusal: VaultError) => {
  try {
    await onRefusal(refusal)
  } catch {
    // The refusal, rethrown by the caller, is what the vault's caller must act on.
  }
}
