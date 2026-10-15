---
"safebyok": patch
"safebyok-react": minor
"safebyok-convex": patch
---

**safebyok-react: a condition that stops the vault opening no longer reaches your error boundary.** When `openVault` rejects with storage that cannot be reached (`storage_unavailable`), a user storage will not serve (`not_permitted`) or a damaged record (`corrupt_record`), `VaultProvider` now hands it down as `useVault().openError`, with `retryOpen()` to try again, instead of throwing it while rendering. Misuse (`bad_label`, `bad_option`) and anything that is not a `VaultError` still go to the boundary. A host that relied on its boundary to catch storage trouble at open should now render `openError` in place.

**safebyok: the error families are exported.** `VaultErrorFamilyVals` (`misuse`, `condition`), `VaultErrorFamilyForKind` (each kind's family) and `isVaultCondition(err)` tell a host who must act on a `VaultError`. And an `openVault` that fails now closes the storage watch it opened, so a refused open leaves nothing running: before, each failed open left one watch (with Convex, a live query) that nothing could end.

**safebyok-convex: an `openVault` refused before sign-in leaves no live query behind.** Its README says so: open the vault again once the Convex client is authenticated.
