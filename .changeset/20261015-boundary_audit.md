---
'safebyok': minor
---

**Breaking, for a host that tests a lockbox summary's note against `undefined`:** a `LockboxSummary` (the snapshot's `boxes`, and a `VaultDB`'s `listBoxes`) always has a `note`, `null` when the lockbox has none, however it was stored. `vault.store`'s `note` takes `null` too, which clears a lockbox's note; leaving it out still keeps the note standing. `store()` now refuses with kind `bad_option` a note that is not text of at most 256 characters, before writing anything: such a note used to be written, and then made the vault refuse to open with `corrupt_record`. A remembered unlock that a host's own `DeviceDB` hands back is checked by the vault, and one that does not pass is erased and asks for the passphrase again. Vaults already stored read as before, and what is written is unchanged: a lockbox with no note is stored with no `note` field.
