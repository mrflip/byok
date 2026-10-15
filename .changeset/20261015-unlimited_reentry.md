---
"safebyok": patch
---

`forcePassphraseReentryHours` accepts `Infinity`, and any huge number, meaning never ask again on this device until `lock()` (or the vault changes under it). There is no upper cap. A deadline stays a finite time: `askPassphraseAt` and the remembered unlock's `expires_at` are clamped to 8.64e15 ms, the last instant a `Date` can hold, so `new Date(askPassphraseAt)` still works and a vault already stored reads as before. Zero, negative, `NaN` and non-numbers are still refused with kind `bad_option`. `FarFuture`, that latest instant (8.64e15), is exported, so a host can compare `askPassphraseAt` against it to show "until locked".
