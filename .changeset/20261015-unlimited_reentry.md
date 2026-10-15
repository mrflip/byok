---
"safebyok": patch
---

`forcePassphraseReentryHours` accepts `Infinity`, and any huge number, meaning never ask again on this device until `lock()` (or the vault changes under it). There is no upper cap. A deadline stays a finite time: `askPassphraseAt` and the remembered unlock's `expires_at` are clamped to `FarFuture` (see the epoch bounds note), so `new Date(askPassphraseAt)` still works. Zero, negative, `NaN` and non-numbers are still refused with kind `bad_option`. `FarFuture` is exported, so a host can compare `askPassphraseAt` against it to show "until locked".
