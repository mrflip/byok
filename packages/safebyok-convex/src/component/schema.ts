import { defineSchema, defineTable } from 'convex/server'
import { Lockbox, VaultBundle, VaultScope } from './validators'

/**
 * The component's own tables, isolated from the host app's. Each row is a record as the core
 * writes it, in typed columns: ciphertext and public fields only.
 *
 * `user_id` leads both indexes: every call is one user's, and an account's rows are one range.
 */
export default defineSchema({
  /** One VaultBundle per vault, as-is. */
  safebyok_bundles: defineTable(VaultBundle)
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  /**
   * One Lockbox per boxlabel, as-is, with its vault's scope columns beside it: added on write,
   * stripped on read. `by_box` serves one box (all four fields) and a vault's boxes (the first three).
   */
  safebyok_lockboxes: defineTable(Lockbox.extend(VaultScope.fields))
    .index('by_box', ['user_id', 'applabel', 'vaultlabel', 'boxlabel']),
})
