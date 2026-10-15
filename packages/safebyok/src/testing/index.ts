/**
 * safebyok's test helpers, as the entry point `safebyok/testing`: a cheap key deriver, shape-valid
 * records whose ciphertext is fake, and the suite every VaultDB adapter owes. For tests only, and
 * under vitest: the deriver is worthless against a brute-forcer.
 */
export { boxOf, bundleOf, fakeCiphered, scopeOf, testDeriver } from './fixtures'
export { describeVaultDB } from './vault-db-suite'
export type { VaultDBVerbs } from './vault-db-suite'
