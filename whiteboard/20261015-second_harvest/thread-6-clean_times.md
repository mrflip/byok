# Thread 6: clean_times (2026-10-15)

Branch `20261015-clean_times`, PR not yet filed, stacked on [#52](https://github.com/mrflip/safebyok/pull/52)
(the top of the merge stack, `2ca104f`; first cut from #62 at `4303367` and rebased). Justify green:
core 663, convex 265, react 27, demo 61, root 105. `pnpm size` within the stack's limits
(everything 22.13 -> 22.27 kB, openVault 15.11 -> 15.28 kB; no limit raised).

* **Built**:
  - **Time fields (roadmap 3)**, in `types.ts`: `Lockbox` drops `created_at`/`updated_at` for
    `registered_at` and `changed_at`; `VaultBundle` drops them for `registered_at`;
    `DeviceUnlock.expires_at` is `ask_passphrase_at`. All `EpochMillis`. `LockboxSummary`,
    `safebyok/testing`'s `bundleOf`/`boxOf` and `describeVaultDB` (all in
    `packages/safebyok/tests/test-helpers.ts` since #52) follow, and so do Convex's
    validators (`v.number()`), hence its tables. `store()` deciphers the previous record it
    already reads (a new `decipherLockbox`, shared with `openBox`) and carries `changed_at`
    forward when the two whispers' `stableJsonify` forms are equal (`holdsWhisper`); a previous
    record that will not open counts as changed. `changePassphrase` carries the bundle's
    `registered_at` by its spread. No old field is read anywhere.
  - **The clock is checked**: `parseClock` (a `{ now }` function, else `bad_option`) and
    `readClock` (each reading an `EpochMillis`, else `bad_option`, floored to whole ms). openVault
    reads it once before touching storage; every later reading goes through `clockNow()`.
  - **Infinity coerced at the parse**: `forcePassphraseReentryHours`' schema maps any number of
    hours to `min(round(hours * 3.6e6), ForeverMs)`, `ForeverMs = FarFuture - FarPast`; the internal
    window schema then refuses anything over it, `Infinity` included. `deadlineAfter` still floors
    and caps at `FarFuture`. `rememberedUnlock`'s `Math.min(..., FarFuture)` clamp is gone (the
    schema bounds it; thread 3's review flagged it redundant).
  - `EpochMillis` drops its `int` check (fractions in bounds pass, as the Coach allowed).
  - Demo: the dashboard shows `changed_at`, KnockKnock's "saved" time is `changed_at`, and the
    demo's own account row has `registered_at: Date.now()` for its ISO `created_at`.
  - Docs: changeset (minor, core and convex), three `notes/security.md` entries revised and two
    added, the Convex README's "in the open" list, STYLE.md (whole ms written, fractions read;
    "clear intent at the door, clean data inside"), TODO roadmap 3 bullets marked built.
* **Decisions taken**:
  - The clock is floored once, at the reading, so every stored time is whole ms, not only the
    deadline (registered_at and changed_at come straight from the clock).
  - **A lock never waits on the clock.** `lock()` reads none. `lockSoon()` with a key in hand
    needs a reading to time its grace; on a bad reading it locks at once (as `lock()`) and then
    throws `bad_option`. Without this, a bad clock threw mid-`lockSoon` after closing the gate but
    before arming the timer or erasing the device record.
  - The whisper comparison is plain `===` on the two `stableJsonify` strings, not constant-time: both
    sides are the client's own, in memory, and the outcome goes to storage anyway as `changed_at`
    standing still. A hand-written constant-time compare would be the home-made comparison
    CLAUDE.md forbids. Recorded in `notes/security.md`.
  - "Same whisper" means the same serialized form: `'1234'` and `1234` differ; `{a, b}` and
    `{b, a}` do not.
  - `corrupt_record`'s message for a record that fails its schema now says "written by another
    version of safebyok", not "a newer version": before 1.0 an older one fails too.
* **Deviations**: none from the plan. The CLAUDE.md bullet was skipped (already #59).
* **Rebase onto #52**: `src/testing/fixtures.ts` and `vault-db-suite.ts` were deleted there and
  moved into `tests/test-helpers.ts`; the time-field changes were carried into that file. The
  three test files that conflicted (`types.test.ts`, `vault.test.ts`, Convex's
  `validators.test.ts`) take this thread's cases with every helper written `TH.`.
* **Discoveries**:
  - An old vault cannot be opened, and so cannot be `destroy()`ed through the library: openVault
    refuses its bundle as `corrupt_record`. Development storage must be cleared by hand. On Convex,
    a deployment holding old rows refuses the new component schema at deploy until those rows are
    deleted (Convex validates existing documents against a pushed schema).
  - `declaredBytes` (an adapter's `maxVaultBytes`/`maxRecordBytes`) still accepts `Infinity`. It
    is a size, not a time, and is used only inside openVault's limit check, so it was left alone.
  - The times are not in the cipherAdditionalData: a backend can alter `registered_at` or
    `changed_at` undetected. Binding the whole header is roadmap 3's next step.
* **For the Coach**:
  - Clear any development vaults (the demo's local storage and IndexedDB, any Convex dev
    deployment's `safebyok_*` tables) before running this version: they will not open.
  - Confirm the `lockSoon()`-on-a-bad-clock reading: lock at once, then throw `bad_option`
    (the alternative is to lock at once and return quietly).
