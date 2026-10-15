---
"safebyok": patch
---

`forcePassphraseReentryHours` accepts `Infinity`, and any huge number, meaning never ask again on this device until `lock()` (or the vault changes under it). There is no upper cap. A deadline stays a finite time: `askPassphraseAt` and the remembered unlock's `expires_at` are clamped to `FarFuture`. Zero, negative, `NaN` and non-numbers are still refused with kind `bad_option`.

Three exports bound every time the package keeps: `FarFuture`, the microsecond epochalypse (9_007_199_254_740 ms, 2255-06-05T23:47:34.740Z, the last millisecond whose epoch microseconds are a safe integer), which a host compares `askPassphraseAt` against to show "until locked"; `FarPast`, 1981-01-01T00:00:00Z; and `EpochMillis`, the Zod schema for a whole epoch-millisecond time between them, which a host may use for its own times. The device record's `expires_at` is now an `EpochMillis`: a remembered unlock whose deadline is out of bounds (epoch seconds or microseconds mistaken for milliseconds) or fractional reads as none and is erased, so the user types the passphrase once more. No record written by a released version is out of bounds, so nothing needs migrating.
