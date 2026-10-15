/**
 * safebyok's public surface: an end-to-end encrypted vault for API keys and other small secrets.
 * Whispers are encrypted on the user's device under keys that never leave it; the storage layer
 * holds ciphertext only. The IndexedDB adapters live in their own entry point, `safebyok/idb`,
 * and the browser's defaults for openVault's options in another, `safebyok/browser`.
 */
export { Argon2idWebV1, argon2idWebV1Deriver } from './key-deriver'
export type { KeyDeriver, KeyDeriverSpec } from './key-deriver'
export { openVault } from './vault'
export type { OpenVaultOpts, Vault, VaultSnapshot, VaultState } from './vault'
export { EpochMillis, FarFuture, FarPast, ForcePassphraseReentryHours, Label, Lockbox, LockboxNote, LockboxSummary, MaxLockboxes, MaxWhisperBytes, VaultBundle, VaultScope, Whisper, wallClock } from './types'
export type { Clock, DeviceUnlock, WhisperJson } from './types'
export { Ciphered } from './crypto'
export { VaultError, VaultErrorKindVals, isVaultError } from './errors'
export type { VaultErrorKind } from './errors'
export { VaultDB, localVaultDB } from './vault-db'
export type { BundleExpectation, EraseExpectation, LockboxExpectation } from './vault-db'
export { memoryDeviceDB } from './device-db'
export type { DeviceDB } from './device-db'
export { domStore, memoryStore } from './string-store'
export type { StringStore } from './string-store'
export { stableJsonify } from './stable-jsonify'
