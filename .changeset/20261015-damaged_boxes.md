---
"safebyok": minor
"safebyok-convex": minor
---

**A damaged lockbox no longer locks the vault out.** A lockbox whose stored record fails the listing's check (not JSON, a malformed note or time, a record naming another boxlabel, a newer format) used to make every `refresh()`, and so `openVault`, refuse `corrupt_record`. It is now listed in the snapshot as `{ boxlabel, damaged: true }` -- the new exported `DamagedLockbox` type -- sorted among the sound lockboxes, and the vault opens and works around it. `read()` and `use()` still refuse it with `corrupt_record`; `erase()` removes it, now from any handle, and no longer reports `corrupt_record` after its own delete has landed because another lockbox was damaged.

**Breaking, for a host reading the snapshot's lockboxes:** `snapshot.boxes` (and a `VaultDB`'s `listBoxes`) now holds `LockboxSummary | DamagedLockbox`, each with a `damaged` field, `false` on every sound lockbox. TypeScript asks a host to check `box.damaged` before reading `note`, `changed_at` or the other summary fields. `LockboxSummary` parses with `damaged: false`.

**`store()` overwrites a damaged lockbox.** Storing to a boxlabel whose record cannot be read as a lockbox (every one the snapshot lists as damaged, and one missing or mangling a ciphered field, which lists as sound) used to refuse `corrupt_record`; it now erases that record and writes a fresh lockbox, carrying neither its note nor its `registered_at`. If the write fails after the erase, the damaged record is gone and the call throws: storing again writes the lockbox afresh.

**Breaking, for a storage adapter's author:** `VaultDB`'s `doListBoxes` now resolves to `StoredLockbox[]` (exported): each lockbox's record, exactly as stored, beside the boxlabel it is stored under, `{ boxlabel, lockbox }`, so a record too damaged to name itself is still listed under the boxlabel that reaches it. The in-tree adapters (`localVaultDB`, `idbVaultDB`, `convexVaultDB`) are updated; a host's own adapter maps its rows likewise. A row stored under something that is not a valid boxlabel is left out of the listing. What is stored is unchanged.
