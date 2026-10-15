---
"safebyok": minor
"safebyok-react": minor
---

**Your own checks for names and notes.** `openVault({ validators })` takes a Zod 4 schema (classic or mini) for any of `applabel`, `vaultlabel`, `boxlabel`, `userId` and `note`, and each **replaces** safebyok's default outright: labels in any script and of any length, long notes, your auth's own user-id shape. A check only checks: what passes is kept and encrypted exactly as you passed it. Refusals stay `bad_label` (`bad_option` for a note) and never quote the name. The defaults are unchanged, so a vault opened without `validators` behaves as before. `VaultProvider` passes `validators` through, and reopens the vault only when a schema in the bag changes, not when the bag around them is rebuilt in render.

**A new entry point, `safebyok/validators`**, with the default checks (`Label`, `UserId`, `LockboxNote`, `DefaultValidators`), `AnyTextValidators` (any text in every field), the bounds behind the defaults (`MaxLabelChars`, `LabelPattern`, `MaxUserIdChars`, `MaxNoteChars`), and `Whisper` and `EpochMillis`. All of them are exported from the main entry too, where `Label`, `UserId` and `LockboxNote` already were.

**Breaking, for code that builds on the exported records**: `VaultScope`, `Lockbox`, `LockboxSummary`, `VaultBundle` and `DeviceUnlock` now check each name and note only as text; the vault's validators check what text it may be. Check a form's label with `Label` (or your own schema), not with `VaultScope`.

**Breaking, for storage adapter authors**: each public `VaultDB` verb takes the vault's validators as an optional last argument, and checks every name and note with them, records read back included (ours when left out). Your `do*` methods are unchanged and take any text as a name. An adapter that hands calls on to another VaultDB's public verbs passes it `AnyTextValidators`.

**Sizes now follow the names.** `updateBox` refuses a lockbox heavier, with its scope, than the adapter's `maxRecordBytes` as the UTF-8 bytes of its JSON, with the new kind `lockbox_too_large` (a condition). Each `store()` also refuses, as `vault_full`, a lockbox whose names and note would take the vault past the adapter's `maxVaultBytes`. Under the default checks neither changes anything a vault does today, except on a backend whose records are only a few kilobytes.

The stored format is unchanged: every vault already written reads as before.
