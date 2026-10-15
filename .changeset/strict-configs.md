---
'safebyok': patch
---

`openVault`'s optional settings and `vault.store`'s `note` accept an explicit `undefined`, meaning the default, so a host compiling with `exactOptionalPropertyTypes` can pass its own optional values straight through. `vault.subscribe` and `vault.getSnapshot` are typed as plain functions, safe to hand to `useSyncExternalStore` unbound. A lockbox with no note is now stored with no `note` field rather than an undefined one; vaults already stored read as before.
