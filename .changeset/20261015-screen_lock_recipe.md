---
"safebyok": patch
---

`vault.lockSoon(graceSeconds = 5)` locks gently, for a hidden tab or a sign-out: from the instant it is called the snapshot reads `locked`, every operation called afterwards throws kind `vault_locked`, this device forgets its remembered unlock, and an `unlock()` under way loses; work already under way (a `store()` retrying after another device's write) keeps the key to finish, until it is dropped `graceSeconds` later. An `unlock()` within the grace ends it. The grace is from 0 to 60 seconds (kind `bad_option` otherwise), and `lockSoon(0)` is `lock()`. `Vault` gains the method, so a host's own object typed as `Vault` (a test fake) needs one too.

`store()` and `erase()`, once started, no longer give up when `askPassphraseAt` passes mid-way: only a lock, a close, or a vault reborn elsewhere stops them. `close()` drops the vaultKey from memory and ends a `lockSoon()` grace at once, and an `unlock()` still under way on the closed handle takes nothing up, writes no remembered unlock, and throws kind `vault_closed`; the remembered unlock already stored stays, as before. The README's screen-lock recipe now calls `lockSoon()` on a hidden tab and `lock()` on a locked screen, and says that either ends this device's remembered unlock.
