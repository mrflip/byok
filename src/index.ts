/**
 * byok's public surface. ⚠️ STUB STAGE: the interface is real, the cryptography is not yet --
 * vaults store whispers and passphrases in plaintext (see src/types.ts). Not for release.
 */
export { Argon2idWebV1 } from './kdf-profile'
export type { KdfProfile } from './kdf-profile'
export { openVault } from './vault'
export type { OpenVaultOpts, Vault, VaultSnapshot, VaultState } from './vault'
export { Label, Lockbox, LockboxSummary, SevenDaysMs, Whisper, wallClock } from './types'
export type { Clock, DeviceUnlock, VaultBundle, VaultScope, WhisperJson } from './types'
export { VaultError, VaultErrorKindVals, isVaultError } from './errors'
export type { VaultErrorKind } from './errors'
export { localVaultDB } from './vault-db'
export type { VaultDB } from './vault-db'
export { localDeviceDB } from './device-db'
export type { DeviceDB } from './device-db'
export { domStore, memoryStore } from './string-store'
export type { StringStore } from './string-store'
export { stableJsonify } from './stable-jsonify'
