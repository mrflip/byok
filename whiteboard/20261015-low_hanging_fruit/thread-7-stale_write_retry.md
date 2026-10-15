# Thread 7: stale_write_retry (2026-10-15)

Branch `20261015-stale_write_retry`, PR not yet filed, stacked on
[#43](https://github.com/mrflip/safebyok/pull/43) (thread 6). Justify: green (safebyok 317,
safebyok-convex 219, safebyok-react 8, demo 24, root 91). No sprint-doc tab (Docs tools
disconnected).

* **Built**: `store()` in `packages/safebyok/src/vault.ts` runs its read-then-write body through
  `retryStale`, a small module-level helper, up to `MaxWriteAttempts = 3` (module constant, not
  exported: an export is public surface). One attempt: `ensureUnlocked()`, `readBox`,
  `ensureRoomFor` (new box only), `ensureUnlocked()` again, fresh `revision_id`, fresh
  lockboxKey, `noteToStore(givenNote, prev)`, cipher, `updateBox` with the expectation inside
  `refreshOnStale`. Outside the loop, once: the first `ensureUnlocked`, `parseLabel`,
  `parseNote`, the whisper check and size check, and the final `refresh()`. `erase()` is
  unchanged in behaviour; a code comment and the doc block say why it is never retried. Tests in
  `tests/vault.test.ts` ("versioned updates: two devices writing at once"). Changeset
  `.changeset/20261015-stale_write_retry.md` (patch). A `notes/security.md` bullet.
* **Decisions taken**:
  - Three means three **attempts** (one try, two retries), stated in the doc block. The test of
    the losing store counts exactly three `updateBox` calls.
  - A retry is not given a delay or backoff: the re-read is the wait, and the limit is small.
  - **Relock mid-retry**: `refreshOnStale` already catches the device up. A reborn vault or a
    changed passphrase nulls the vaultKey there, so `ensureUnlocked()` at the top of the next
    attempt throws `vault_locked` before any read or write. Vault destroyed and not remade: same
    (`vault_locked`; the snapshot then says `absent`).
  - `retryStale` is recursive (functional style), takes `() => Promise<void>`, and rethrows any
    non-stale error as it came; the last stale error is the original `VaultError`.
  - `changePassphrase` and `destroy` are not retried: not in this thread's text.
* **Deviations**: none from the plan. `pnpm changeset` is interactive and exits 13 without a
  terminal, so the changeset is written by hand under the name the script would give.
* **Discoveries**:
  - **Behaviour changes a host sees, beyond fewer `stale_write`s** (all in the changeset): a
    `store()` into a vault reborn elsewhere now throws `vault_locked`, where it threw
    `stale_write` (and relocked). Five existing tests said so and are updated. A `store()` over a
    box another device erased meanwhile used to be refused ("erase wins"); the retry now makes
    the box anew, as the caller's own retry would have. Last writer wins, as the old doc block
    said of a caller's retry.
  - The cap race stays open where the box itself is not contended: a `store()` of a new label
    expects "no such box", which a rival filling the *other* slots does not break, so there is no
    stale write and no recount (thread 1's security note covers the overshoot). A retry re-counts
    only when the same box changed under it; the cap test builds that case (replacement erased,
    its room taken, retry sees a new box in a full vault: `vault_full`).
  - `twoDeviceWorld` in the test file now gives `here` its own `VaultDB` over the shared store, so
    a spy on `here`'s writes counts attempts without catching the rival's writes; it takes
    `OpenVaultOpts` overrides for `here`.
  - TODO.md's conflict-handler item says "after the retry (low-hanging-fruit thread 6)"; it is
    thread 7. Not edited here.
* **For the Coach**: whether `vault_locked` (over the original `stale_write`) is right when a
  retry finds the device relocked. It is the orchestrator's stated expectation and tells the host
  the useful thing (ask for the passphrase), but it changes what an existing host catches.
