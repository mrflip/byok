---
"safebyok": minor
"safebyok-convex": minor
---

**The stored format changes, with no migration** (until 1.0.0, nothing binds backward). Every stored time is now epoch milliseconds, named for its event. A lockbox keeps `registered_at` (when its boxlabel was first stored, carried forward) and `changed_at` (when its whisper last changed: storing the same whisper again writes a new revision and leaves `changed_at` standing). A vault bundle keeps `registered_at`. The ISO-string `created_at` and `updated_at` are gone from both, and the device record's `expires_at` is now `ask_passphrase_at`. The exported `Lockbox`, `LockboxSummary`, `VaultBundle` and `DeviceUnlock` schemas and types follow, and so do `safebyok/testing`'s `bundleOf` and `boxOf`, and `safebyok-convex`'s tables and validators.

The host's `clock` is checked. `openVault` refuses a clock that is not `{ now() }`, or whose reading is not epoch milliseconds from 1981 to 2255 (`FarPast` to `FarFuture`), with kind `bad_option`, before it touches storage; any later call that reads it out of bounds throws `bad_option` too. A reading with a fraction of a millisecond is fine: `EpochMillis` now accepts any number in bounds, where it refused fractions, and the package still writes whole milliseconds.

`forcePassphraseReentryHours: Infinity` is still welcome, and still makes `askPassphraseAt` read `FarFuture`; it now becomes a finite window as the option is parsed, so nothing past `openVault`'s door holds `Infinity`. Likewise a storage adapter's `maxRecordBytes` or `maxVaultBytes` of `Infinity`, for no limit, is read as `Number.MAX_SAFE_INTEGER` bytes.
