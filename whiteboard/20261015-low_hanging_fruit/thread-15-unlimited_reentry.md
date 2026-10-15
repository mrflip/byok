# Thread 15: unlimited_reentry (2026-10-15)

Branch `20261015-unlimited_reentry`, cut from origin/main at 374d3d4; PR [#53](https://github.com/mrflip/safebyok/pull/53). Reviewed: three commits (c5b8861 clamp on read, 67f0597 tests, 2689275 security note). Justify: green (root 105, safebyok 363, safebyok-convex 219, safebyok-react 15, demo 28).

The Coach's ruling on [#40](https://github.com/mrflip/safebyok/pull/40)'s question about an upper cap on `forcePassphraseReentryHours`: "allow unlimited, u do u". Thread 2's file explains the option's origin.

* **Built**:
  - `forcePassphraseReentryHours` accepts any positive number, `Infinity` included, with no upper cap (`vault.ts`, the schema beside `declaredBytes`, which already used the `Z.union([Z.number().positive(), Z.literal(Infinity)])` shape because zod 4's `number()` refuses `Infinity`). The converted milliseconds are piped through `min(1)` or `Infinity`; the old `int()` and `MAX_SAFE_INTEGER` ceiling are gone.
  - `FarFuture` (`types.ts`, doc block), first 8.64e15 (the last instant a `Date` holds), now the microsecond epochalypse (see the follow-up below). `deadlineAfter(nowMs, reentryMs)` in `vault.ts` is `Math.min(nowMs + reentryMs, FarFuture)`, used by `unlock()` and `changePassphrase()`, the two places a deadline is made. So `askPassphraseAt` and the stored `expires_at` are always finite; the stored shape is unchanged.
  - Docs: the option's, `askPassphraseAt`'s, the core README's *Locking* section, the `bad_option` message ("greater than zero ... and Infinity means never"), a `notes/security.md` bullet, and `.changeset/20261015-unlimited_reentry.md` (patch on `safebyok`).
  - Tests (`tests/vault.test.ts`, in the reentry `describe`): `Infinity` unlocks, stays unlocked after a thousand years of the test clock, shows the clamped deadline and a valid `Date`; the device record holds the clamped `expires_at` and a reopen picks it up; `lock()` ends it, on the device too; a passphrase change on this device keeps it; huge finite values (1e12, 1e300, `MAX_VALUE`) clamp the same; a window that fits (1e6 hours) is exact; 0, negative, `-Infinity`, `NaN`, 1e-12, `'12'`, `null`, `true` and `{}` are `bad_option`; the message mentions both "greater than zero" and "Infinity". The old test that listed `Infinity` among the refused is changed.

* **Decisions taken**:
  - **Clamp the sum, not the span.** The span alone cannot know `now`; the clamp is on the deadline, where it is the stored fact.
  - **`FarFuture` is exported from the package entry** (the Coach's ruling, after filing: "yes, but call it FarFuture"; it was first `LatestAskPassphraseAt`, unexported). Its doc block is the public contract: the latest instant the package accepts, what `askPassphraseAt` equals under `Infinity`, and how a host compares against it. The exact-surface test lists it; the React binding re-exports no core constants, so it does not.
  - **The remembered path clamps `expires_at` on read** (the reviewer's c5b8861, which corrected my first reading that a finite stored value needs no clamp): records from a host's own deviceDB could hold a finite deadline past the ceiling. Since the follow-up the schema refuses those outright, so the clamp is belt and braces, left in place for thread 3 of second_harvest, which rewrites that function.
  - **Timers: none.** `grep setTimeout|setInterval` over the core, the React binding and the demo finds nothing. Expiry is checked at use (`ensureUnlocked`, `vaultState`), so nothing computes `deadline - now` into a delay.

* **Follow-up: bounds on every time** (the Coach, after filing: "the microsecond epochalypse ... as our no-dates-past-this number, enforced by Zod; I'd also exclude epoch millis before 1981"):
  - `FarFuture` is now `9_007_199_254_740` ms (`Math.floor(Number.MAX_SAFE_INTEGER / 1000)`, 2255-06-05T23:47:34.740Z), still the clamp for `Infinity` and what `askPassphraseAt` then equals. `FarPast` is `347_155_200_000` (1981-01-01T00:00:00Z). `EpochMillis` (`types.ts`) is `Z.number().int().min(FarPast).max(FarFuture)`, each refusal naming the likely unit mistake. All three are exported (the exact-surface test lists them).
  - The fields it guards: the device record's `expires_at`, the only epoch-ms field anywhere. Surveyed: the bundle's and lockboxes' `created_at`/`updated_at` are ISO strings (STYLE.md says times are epoch ms; changing them is a stored-format change, not this thread's); the Convex validators carry no epoch ms; the host's `Clock` is a function, not validated.
  - A device record out of bounds or fractional fails `DeviceUnlock` in `memoryDeviceDB`, `idbDeviceDB` and the vault's own check, so it reads as no remembered unlock and is erased. Tests: an `EpochMillis` case list (`types.test.ts`), out-of-bounds deadlines through `memoryDeviceDB` and spoiled rows through a host's unchecking deviceDB (`vault.test.ts`), and a deadline of exactly `FarFuture` still read as unlocked.
  - The React binding's pass-through test clock moved from 1000 to 2026; the `Infinity` test advances 200 years, not 1000 (past 2255 even `FarFuture` expires).
  - `vault.ts`: doc comments only. `rememberedUnlock`'s running comment ("a finite deadline past what a Date can") is now stale; left for thread 3, which owns those lines.

* **Deviations**: none.

* **Discoveries**:
  - The React passphrase dialog still says "Stays unlocked on this device for seven days" whatever the option is (thread 2 noted it; the expiry thread, roadmap 5, should derive or take the text). With `Infinity` it is now plainly wrong for such a host.
  - The demo's `LockChip` prints `new Date(askPassphraseAt).toLocaleString()`; for the clamped value that is a date in 2255, valid but odd. A host showing "never" should special-case `askPassphraseAt === FarFuture`.

* **For the Coach**:
  - **Open, significant, not blocking merge:** an unlock granted under `Infinity` outlives a later lowering of the option: the device record holds `FarFuture`, and a reopen with `forcePassphraseReentryHours: 24` still reads it as unlocked. A real fix caps at read time (stored deadline no later than the unlock's own time plus the current window, which needs the record to carry when it was granted) and rewrites the device record. It ties to your open question from [#43](https://github.com/mrflip/safebyok/pull/43) (clamp `expires_at` on read). The security note says so; the fix waits on your answer.
  - Settled: export it, as `FarFuture`. Showing "until locked" in the demo's chip is still open.
