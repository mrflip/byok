---
'safebyok': patch
---

`vault.subscribe` and `vault.getSnapshot` are typed as plain functions, safe to hand to `useSyncExternalStore` unbound. A lockbox with no note is now stored with no `note` field rather than an undefined one; vaults already stored read as before.
