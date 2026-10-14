/**
 * ⚠️ STUB of the future byok package: real interface shapes, no real cryptography. Whispers and
 * passphrases are stored in PLAINTEXT so the demo's inspector can show where every piece of data
 * lives. Nothing in here may graduate to src/ at the repository root without the crypto underneath.
 *
 * This file sketches the public surface the package would export; the rest of the demo imports
 * from here only.
 */
export { openVault } from './vault'
export type { OpenVaultOpts, Vault, VaultSnapshot, VaultState } from './vault'
export { Label, Lockbox, LockboxSummary, SevenDaysMs, Whisper, wallClock } from './types'
export type { Clock, VaultScope } from './types'
export { VaultError, VaultErrorKindVals, isVaultError } from './errors'
export type { VaultErrorKind } from './errors'
export { localVaultDB } from './vault-db'
export type { VaultDB } from './vault-db'
export { localDeviceDB } from './device-db'
export type { DeviceDB } from './device-db'
export { domStore, memoryStore } from './string-store'
export type { StringStore } from './string-store'
