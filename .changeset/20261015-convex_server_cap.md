---
'safebyok': patch
'safebyok-convex': patch
---

`vault_full` now also means that storage refused a lockbox write for room: a `VaultDB` whose backend holds each vault to a limit of its own refuses a write past it with kind `vault_full`, and `VaultDB`'s doc blocks say so for adapter authors. The Convex component in `safebyok-convex` does this: it holds every vault to 8,000 lockboxes and 7 MiB less 1 KiB of them, whatever a client asks, so a vault can always be erased whole, and refuses a new lockbox, or a heavier replacement, past either. A vault within its `maxLockboxes` stays well inside both. Nothing stored changes shape; the component adds a table of per-vault tallies, and counts a vault written before it at the vault's next lockbox write.
