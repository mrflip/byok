---
"safebyok": patch
---

The remembered unlock's deadline is bounded, by three new exports. `FarFuture` is now the microsecond epochalypse: 9_007_199_254_740 ms, 2255-06-05T23:47:34.740Z, the last millisecond whose epoch microseconds are a safe integer. It is still what `askPassphraseAt` equals when a vault never asks again. `FarPast` is 1981-01-01T00:00:00Z. `EpochMillis` is the Zod schema for a whole number of epoch milliseconds between them, which a host may use for its own times; its bounds catch epoch seconds or microseconds mistaken for milliseconds.

The device record's `expires_at` is now an `EpochMillis`; it is the only time the package validates this way (lockbox and vault bundle times are still ISO strings). A deadline is always whole milliseconds, even from a host clock that returns fractions.

What this does to stored data: a device record written by 0.1.0 or 0.2.0 under a `forcePassphraseReentryHours` above about two million hours (some 229 years, for instance `1e9` to mean "never", when `Infinity` was refused) holds a deadline past 2255. It now reads as no remembered unlock and is erased, so that user enters the passphrase once more. Nothing else that was written is affected.
