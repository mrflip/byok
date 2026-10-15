---
'safebyok': patch
---

`vault.store()` now tries again when another device got to the same lockbox first, up to three attempts in all, re-reading storage before each, and throws `stale_write` only if the third is refused too. Fewer `stale_write` refusals reach a host, which no longer needs its own retry loop around `store()`; a host that has one can keep it. The retry writes over what the other device wrote, as a host's own retry did. If a retry finds the vault destroyed or made anew elsewhere, or its passphrase changed, it finds the device relocked and throws `vault_locked` (where `stale_write` was thrown before) without writing. A box erased on another device meanwhile is not brought back by the retry (an erase wins): the store throws `stale_write` at once. `vault.erase()` is never retried: a refused erase still throws `stale_write` at once. Nothing stored changes.
