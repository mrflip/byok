# Thread 15: unlimited_reentry (2026-10-15)

Branch `20261015-unlimited_reentry`, cut from origin/main at 374d3d4; PR [#53](https://github.com/mrflip/safebyok/pull/53). Reviewed: three commits (c5b8861 clamp on read, 67f0597 tests, 2689275 security note). Justify: green (root 98, safebyok 333, safebyok-convex 219, safebyok-react 15, demo 28).

The Coach's ruling on [#40](https://github.com/mrflip/safebyok/pull/40)'s question about an upper cap on `forcePassphraseReentryHours`: "allow unlimited, u do u". Thread 2's file explains the option's origin.

* **Built**:
  - `forcePassphraseReentryHours` accepts any positive number, `Infinity` included, with no upper cap (`vault.ts`, the schema beside `declaredBytes`, which already used the `Z.union([Z.number().positive(), Z.literal(Infinity)])` shape because zod 4's `number()` refuses `Infinity`). The converted milliseconds are piped through `min(1)` or `Infinity`; the old `int()` and `MAX_SAFE_INTEGER` ceiling are gone.
  - `FarFuture = 8.64e15` (`types.ts`, doc block), the last instant a `Date` holds. `deadlineAfter(nowMs, reentryMs)` in `vault.ts` is `Math.min(nowMs + reentryMs, FarFuture)`, used by `unlock()` and `changePassphrase()`, the two places a deadline is made. So `askPassphraseAt` and the stored `expires_at` are always finite; `DeviceUnlock` is unchanged and records written before read as before.
  - Docs: the option's, `askPassphraseAt`'s, the core README's *Locking* section, the `bad_option` message ("greater than zero ... and Infinity means never"), a `notes/security.md` bullet, and `.changeset/20261015-unlimited_reentry.md` (patch on `safebyok`).
  - Tests (`tests/vault.test.ts`, in the reentry `describe`): `Infinity` unlocks, stays unlocked after a thousand years of the test clock, shows the clamped deadline and a valid `Date`; the device record holds the clamped `expires_at` and a reopen picks it up; `lock()` ends it, on the device too; a passphrase change on this device keeps it; huge finite values (1e12, 1e300, `MAX_VALUE`) clamp the same; a window that fits (1e6 hours) is exact; 0, negative, `-Infinity`, `NaN`, 1e-12, `'12'`, `null`, `true` and `{}` are `bad_option`; the message mentions both "greater than zero" and "Infinity". The old test that listed `Infinity` among the refused is changed.

* **Decisions taken**:
  - **Clamp the sum, not the span.** The span alone cannot know `now`; the clamp is on the deadline, where it is the stored fact.
  - **`FarFuture` is exported from the package entry** (the Coach's ruling, after filing: "yes, but call it FarFuture"; it was first `LatestAskPassphraseAt`, unexported). Its doc block is the public contract: the latest instant a `Date` holds, what `askPassphraseAt` equals under `Infinity`, and how a host compares against it. The exact-surface test lists it; the React binding re-exports no core constants, so it does not.
  - **The remembered path clamps `expires_at` on read** (the reviewer's c5b8861, which corrected my first reading that a finite stored value needs no clamp): records from a host's own deviceDB, or from before this change, can hold a finite deadline past 8.64e15, which would reach the snapshot as an Invalid Date. The schema already refuses `Infinity`, `NaN` and text.
  - **Timers: none.** `grep setTimeout|setInterval` over the core, the React binding and the demo finds nothing. Expiry is checked at use (`ensureUnlocked`, `vaultState`), so nothing computes `deadline - now` into a delay.

* **Deviations**: none.

* **Discoveries**:
  - The React passphrase dialog still says "Stays unlocked on this device for seven days" whatever the option is (thread 2 noted it; the expiry thread, roadmap 5, should derive or take the text). With `Infinity` it is now plainly wrong for such a host.
  - The demo's `LockChip` prints `new Date(askPassphraseAt).toLocaleString()`; for the clamped value that is a year-275760 date, valid but odd. A host showing "never" should special-case `askPassphraseAt === 8.64e15`.

* **For the Coach**:
  - **Open, significant, not blocking merge:** an unlock granted under `Infinity` outlives a later lowering of the option: the device record holds 8.64e15, and a reopen with `forcePassphraseReentryHours: 24` still reads it as unlocked. A real fix caps at read time (stored deadline no later than the unlock's own time plus the current window, which needs the record to carry when it was granted) and rewrites the device record. It ties to your open question from [#43](https://github.com/mrflip/safebyok/pull/43) (clamp `expires_at` on read). The security note says so; the fix waits on your answer.
  - Settled: export it, as `FarFuture`. Showing "until locked" in the demo's chip is still open.
