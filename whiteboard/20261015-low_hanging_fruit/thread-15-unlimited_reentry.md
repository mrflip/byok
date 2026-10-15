# Thread 15: unlimited_reentry (2026-10-15)

Branch `20261015-unlimited_reentry`, cut from origin/main at 374d3d4; PR not yet filed. Justify: green (root 98, safebyok 332, safebyok-convex 219, safebyok-react 15, demo 28).

The Coach's ruling on [#40](https://github.com/mrflip/safebyok/pull/40)'s question about an upper cap on `forcePassphraseReentryHours`: "allow unlimited, u do u". Thread 2's file explains the option's origin.

* **Built**:
  - `forcePassphraseReentryHours` accepts any positive number, `Infinity` included, with no upper cap (`vault.ts`, the schema beside `declaredBytes`, which already used the `Z.union([Z.number().positive(), Z.literal(Infinity)])` shape because zod 4's `number()` refuses `Infinity`). The converted milliseconds are piped through `min(1)` or `Infinity`; the old `int()` and `MAX_SAFE_INTEGER` ceiling are gone.
  - `LatestAskPassphraseAt = 8.64e15` (`types.ts`, doc block), the last instant a `Date` holds. `deadlineAfter(nowMs, reentryMs)` in `vault.ts` is `Math.min(nowMs + reentryMs, LatestAskPassphraseAt)`, used by `unlock()` and `changePassphrase()`, the two places a deadline is made. So `askPassphraseAt` and the stored `expires_at` are always finite; `DeviceUnlock` is unchanged and records written before read as before.
  - Docs: the option's, `askPassphraseAt`'s, the core README's *Locking* section, the `bad_option` message ("greater than zero ... and Infinity means never"), a `notes/security.md` bullet, and `.changeset/20261015-unlimited_reentry.md` (patch on `safebyok`).
  - Tests (`tests/vault.test.ts`, in the reentry `describe`): `Infinity` unlocks, stays unlocked after a thousand years of the test clock, shows the clamped deadline and a valid `Date`; the device record holds the clamped `expires_at` and a reopen picks it up; `lock()` ends it, on the device too; a passphrase change on this device keeps it; huge finite values (1e12, 1e300, `MAX_VALUE`) clamp the same; a window that fits (1e6 hours) is exact; 0, negative, `-Infinity`, `NaN`, 1e-12, `'12'`, `null`, `true` and `{}` are `bad_option`; the message mentions both "greater than zero" and "Infinity". The old test that listed `Infinity` among the refused is changed.

* **Decisions taken**:
  - **Clamp the sum, not the span.** The span alone cannot know `now`; the clamp is on the deadline, where it is the stored fact.
  - **`LatestAskPassphraseAt` is not exported from the package entry.** It would widen the public surface (and the exact-surface test in `index.test.ts`). A host that wants to show "never" can compare against 8.64e15, which the docs state. Easy to export later.
  - **The remembered path reads `expires_at` as stored.** A finite stored value needs no clamp, and the schema already refuses `Infinity`, `NaN` and text.
  - **Timers: none.** `grep setTimeout|setInterval` over the core, the React binding and the demo finds nothing. Expiry is checked at use (`ensureUnlocked`, `vaultState`), so nothing computes `deadline - now` into a delay.

* **Deviations**: none.

* **Discoveries**:
  - The React passphrase dialog still says "Stays unlocked on this device for seven days" whatever the option is (thread 2 noted it; the expiry thread, roadmap 5, should derive or take the text). With `Infinity` it is now plainly wrong for such a host.
  - The demo's `LockChip` prints `new Date(askPassphraseAt).toLocaleString()`; for the clamped value that is a year-275760 date, valid but odd. A host showing "never" should special-case `askPassphraseAt === 8.64e15`.

* **For the Coach**:
  - Say whether to export `LatestAskPassphraseAt` (and show "until locked" in the demo's chip).
