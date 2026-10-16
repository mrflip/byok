# Thread 9: damaged_bundle (2026-10-16)

Branch `20261016-damaged_bundle`, PR [#108](https://github.com/mrflip/safebyok/pull/108), stacked on [#97](https://github.com/mrflip/safebyok/pull/97) (base `8d665aa`, after #97's restack onto
main with the gripes line merged). Justify: green, every package (core 1158, react 95, demo 131,
convex 282, graphql 159, postgres 162, indexeddb 108, argon2-wasm 44, root 123). `pnpm size`
within every budget (`everything` 28.31 of 30 kB, `openVault` 20.18 of 23 kB).

* **Built**: the Coach's "fine-grained error messages" for a damaged vault, as far as the code can
  know it.
  - `errors.ts`: three new condition kinds, `damaged_bundle`, `damaged_unlock`,
    `damaged_lockbox`; the doc block says `corrupt_record` is storage's word and the `damaged_`
    kinds the vault's.
  - `vault.ts`: `damagedAs` maps storage's `corrupt_record` for the bundle (`readBundle`,
    `createBundle`'s answer) to `damaged_bundle` and for `read()`/`use()`'s lockbox to
    `damaged_lockbox`, the original as `cause`. A lockbox that will not decipher under the
    vaultKey, or opens to no whisper, is `damaged_lockbox`, its message naming the box and the
    remedy (erase, or store over it: #93's work, now on main).
  - `envelope.ts`: a passphrase envelope with a salt its deriver could not have made is passed
    over (no derivation), the others tried; `damaged_unlock` when every candidate is damaged, or
    an aimed unlock hits one. A failure with a damaged one skipped is `wrong_passphrase` whose
    message says so. A passkey envelope with a bad salt is `damaged_unlock`. The plain
    `wrong_passphrase` and the answer-fails `wrong_passkey` now say the stored vault may be damaged.
  - `safebyok-react`'s `askPasskey`: leaves out a passkey whose `credential_id`/`prf_salt_b64` is
    not base64url, `damaged_unlock` only when all are. The demo and the React README branch on
    `damaged_bundle` at open.
  - Docs: the core README's errors table (three rows, `corrupt_record`'s and the two `wrong_`
    rows reworded), `notes/security.md` (the Argon2 sentence in #97's binding entry; a new entry;
    pointers on two older ones), a changeset (minor, core and react).
* **Decisions taken**:
  - **What is knowable.** AES-GCM fails alike for a wrong key and for altered additional data, so
    a passphrase that opens nothing stays `wrong_passphrase` even for a tampered bundle. The plan's
    "a remembered unlock whose key is held" does not help: holding the vaultKey says nothing about
    whether a passphrase-derived key is right. The one way to tell (re-encrypt the held vaultKey
    under the derived key with the stored IV and compare) leans on GCM's structure and is a
    construction of our own: refused, and recorded in security.md.
  - **A passkey that answered is still `wrong_passkey`.** With `userVerification: 'required'`
    on every `safebyok-react` call the PRF answer is stable, so a failure for the envelope's own
    credential and salt is most likely damage; but the core cannot know a proof came that way (a
    host's own WebAuthn call without UV answers differently). Its message leans toward damage and
    says what to do: unlock with a passphrase, then remove and re-add the passkey.
  - **Map at the vault, not in `VaultDB`.** `corrupt_record` stays the storage layer's kind, so
    no adapter, adapter test or the `VaultDB` contract (thread 11) changes; the vault translates.
    `outage.ts` in the demo is a `VaultDB` wrapper and rightly still catches `corrupt_record`.
  - **Skip, not refuse, a damaged envelope.** One damaged way in used to shut out every
    passphrase unlock: "after trying every way in", per the Coach's original rec.
  - **Three kinds, not one**: each has a different remedy (nothing / another way in / erase the
    box). A grouping helper (`isVaultDamage`?) was not added; the Coach said to group if there
    become too many.
* **Deviations**: none from the plan. The base moved mid-thread (the coordinator's restack): my
  uncommitted work was checkpointed, rebased onto `8d665aa`, and aligned with #93 now on main
  (`read()` of a listed-damaged box was `corrupt_record` there; now `damaged_lockbox`).
* **Discoveries**:
  - **A damaged bundle cannot be destroyed through a vault handle**: `openVault` refuses it, and
    `destroy()` needs a handle. A host can call `VaultDB.eraseVault` only if the row still shows a
    `vault_id`. Recorded in security.md; a recovery path is a later call.
  - VOCABULARY's *damaged* row (#93) speaks only of lockboxes; it could widen to a way in and a
    bundle. Not edited here (VOCABULARY does not list error kinds).
  - Thread 10 (identity_revoked) adds kinds to the same list in `errors.ts`, the family map,
    the errors test's cases and the README table: expect small adjacent-line conflicts at restack.
* **For the Coach**: the three new kinds are public surface (minor, pre-1.0); `read()`/`use()`'s
  and `openVault`'s refusals change kind (`corrupt_record` to `damaged_lockbox`/`damaged_bundle`),
  and `askPasskey`'s too (`corrupt_record` to `damaged_unlock`). Whether a damaged bundle should
  have a way to be cleared (an `openVault` that can still `destroy()`) is open.
