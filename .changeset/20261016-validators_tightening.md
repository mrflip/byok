---
"safebyok": minor
"safebyok-react": minor
---

**Breaking, for an importer of `safebyok/validators`:** that entry no longer re-exports `Whisper` and `EpochMillis`, which pulled the record schemas in with it (the whole entry falls from about 8.4 kB to 3.7 kB, minified and brotlied). Import them from `safebyok` instead: `import { EpochMillis, Whisper } from 'safebyok'`.

**The checks refuse text that is not well-formed Unicode.** `UserId`, `LockboxNote` and every field of `AnyTextValidators` now refuse a string holding a lone surrogate (half of a character such as an emoji), as Convex requires valid Unicode; `Label` already did. A vault opened with them refuses such a name as `bad_label`, and such a note as `bad_option`, before storage sees it. A stored lockbox whose name or note holds one lists as damaged.

**The default note check refuses control characters** but tab and newline: C0 (carriage return included), DEL and C1. A host that wants them passes its own `validators.note`. A lockbox stored earlier with such a note lists as damaged; storing over it writes afresh.

**A refusal says what our check found.** Where one of safebyok's own checks refuses a name or note, the error's message now says why (too long, a control character, not well-formed Unicode), still quoting nothing; a host schema's refusal still names only the field. The kinds are unchanged.

**A misspelt `validators` field is refused everywhere.** The new `checkValidators(bag)` refuses, as `bad_option`, a bag with a field other than applabel, vaultlabel, boxlabel, userId and note, or one that is not a Zod schema. `openVault` runs it as before; `VaultProvider` now runs it too, throwing to the nearest error boundary, where it used to drop a misspelt field (`boxLabel`) without a word.

**A `VaultDB` verb handed no `validators` admits any well-formed text** (`AnyTextValidators`) rather than applying the defaults, so a wrapper that forgets to forward the vault's bag no longer refuses a well-formed name the vault's own checks passed (a host's own check that admits a lone surrogate is still refused there). A host calling the verbs directly that wants the default checks passes `DefaultValidators`.

**A host with a wider `userId` (or label) check can change its passphrases again.** The vault left its validators off one call, so adding, removing or changing a passphrase or passkey refused a user id or label the defaults refuse with `bad_label`.

**`eraseDamagedVault` takes the same bag.** It refuses a misspelt `validators` field as `openVault` does, and hands the VaultDB's `eraseDamagedVault` verb the vault's checks; that verb, handed none, admits any well-formed text like the others.

**A `damaged_lockbox` refusal no longer quotes the boxlabel**: "That lockbox is damaged ...", as `absent_box` already said, since a host's checks may admit any text as a name, a mistaken paste among it.
