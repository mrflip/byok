# Sprint low_hanging_fruit: progress

**Status**: thread 10 building; 1, 5, 9 in review; 3 and 4 filed. Newer than the plan wherever the two disagree.

Sprint doc: [Sprint low_hanging_fruit](https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9), a live mirror: *Plan* and *Progress* tabs (the orchestrator's), and under *Threads* one tab per thread, written by that thread's worker.

## Status

| #  | Thread | Base | Status |
| -- | ------ | ---- | ------ |
| 1  | `vault_size_cap` | `origin/main` | in review |
| 2  | `explicit_options` | thread 1 | pending |
| 3  | `provider_open_rejection` | `origin/main` | filed [#32](https://github.com/mrflip/safebyok/pull/32) |
| 4  | `epoch_millis` | `origin/main` | filed [#31](https://github.com/mrflip/safebyok/pull/31) |
| 5  | `mask_utils` | `origin/main` | in review |
| 6  | `boundary_audit` | thread 2 | pending |
| 7  | `stale_write_retry` | thread 6 | pending |
| 8  | `size_budget` | thread 2 | pending |
| 9  | `docs_sweep` | `origin/main` | in review |
| 10 | `sandals` | `origin/main` | underway |
| 11 | `label_grammar_report` | `origin/main` | pending |

## What the threads have taught

* *Orchestrator:* **`pnpm changeset` names files at random on main.** PROCESS.md's
  `.changeset/YYYYMMDD-<label>.md` naming comes from `scripts/changeset.ts`, which arrives with
  [#30](https://github.com/mrflip/safebyok/pull/30). Rename yours by hand to
  `.changeset/20261015-<label>.md` so the PRs match the rule that is coming.
* *Orchestrator:* **Thread 1** (`vault_size_cap`) -- **for threads 2, 6, 7**:
  - The open-time check is **not the preplan's product**: it refuses when
    `maxLockboxes * (maxWhisperBytes + 1 KiB) > maxVaultBytes / 2`. The plain product let 207
    default-size lockboxes onto Convex, measured un-erasable (base64 and per-row fields). Defaults
    still fit (100 at 40444 bytes). YOLO: accepted as the stronger guard; the PR's first lines
    say so.
  - `store()` counts from the vault's current box list; `readBox` decides new-or-replacement; a
    vault that looks full triggers `ensureRoomFor`, which refreshes and recounts before refusing
    `vault_full`. It sits right after `readBox`, so thread 7's retry re-runs it.
  - Thread 2's landing spots: `maxLockboxes` follows `maxWhisperBytes` in `OpenVaultOpts`;
    option parsing is `parseMaxWhisperBytes`, `parseMaxLockboxes`, `ensureLimitsFit(vaultDB, ...)`;
    the provider adds `maxLockboxes` at the end of its destructure, `openOpts` and the deps.
  - `maxVaultBytes` is abstract: every third-party adapter must declare it (Coach, below).
* *Orchestrator:* **Thread 4** found almost nothing to change outside the stored fields: the demo's
  account `created_at` and one test clock. `DeviceUnlock.expires_at` and `expiresAt` were
  already numbers. Thread 2's rename of `expiresAt` inherits a number.
  *Review:* clean, no fixes. Left, minor: the demo reads account rows with `JSON.parse(...) as
  Account` (an old row keeps an ISO `created_at`; nothing reads it); `createAuth` takes no
  `clock` option, so its test checks a window.
* *Orchestrator:* **Thread 3**: `VaultProvider` now throws a rejected `openVault` during render.
  A host needs an error boundary around it; the React README line saying so rides with thread
  3 at filing. Threads 1 and 2 add and require provider props: thread 3 left the props and the
  `satisfies` line alone, so their rebase is mechanical. The `open_vault_unsubscribe` work is
  still on pre-move paths (`src/vault.ts`) and needs repathing before it can land.
  *Review:* fixed -- two tests added (a `null` rejection reaches the boundary; one after sign-out
  is ignored). Left: once the provider throws, its boundary unmounts it, so recovery needs the
  host to reset the boundary (`key={userId}`): the React README's new "When opening fails"
  section says so (pulled in from thread 9 at filing). `storage_unavailable` now reaches the boundary
  although its message says "try again shortly" (Coach, below). A failed open still leaks
  openVault's watch until `open_vault_unsubscribe` lands.
* *Orchestrator:* **Thread 5** (`safebyok/utils`, `mask`): **for thread 2 and any new entry**:
  tsdown's `exports: true` does not write `typesVersions`, and attw's node10 check fails the build
  until the entry is added there by hand, beside `idb`'s. **For thread 8**: `mask` pulls in
  `errors.ts` and `zod` but not the vault (built `utils.js` 4.1 kB); its budget waits on thread 5
  merging. Decisions: graphemes via `Intl.Segmenter`, code points where it is missing (Hermes);
  `maskAll` struck (`mask(w, { head: 0, tail: 0 })` is the stars-only form); `maxLen` wins over
  `minStars`; an empty whisper gives `''`. Commit prefixes: `utils:` and `react:` are not in
  PROCESS.md's table -- an entry point is `api:`, the React package `client:`.
* *Orchestrator:* **Thread 9** found the core README had no locking section: it appended
  *Locking* (`visibilitychange` -> `vault.lock()`, "when `lockSoon()` lands") and *No recovery*
  at the README's end, so threads 1 and 2's README edits rebase mechanically. The expiry thread
  should update the `lockSoon()` line. The demo now calls `navigator.storage.persist()` through
  a small `keepStorage` module. The devcontainer volumes stay `byok-*`: renaming orphans them.
* *Orchestrator:* **Slots count builders, not reviews** (YOLO, two-way): with 1, 5 and 9 all in
  review and nothing building, thread 10 started as a fourth agent.
* *Orchestrator:* **The main checkout moves under reviewers.** Another agent's uncommitted work
  there became [#30](https://github.com/mrflip/safebyok/pull/30) mid-review. Both reviewers traced
  it and carried on rightly. Reviewers: a change whose HEAD, reflog and stash are untouched,
  matching a pushed branch of another agent's, is not the review's.

## For the Coach

* **Thread 1's fit check departs from the preplan** (above): stronger, measured, and the
  defaults still fit. And `maxVaultBytes` is abstract, so third-party adapters must declare it;
  a default of `Infinity` would be gentler but lets a limited backend forget. `vault_full` should
  join TODO.md's *Error families* as a condition (#26 owns TODO.md).

* **`storage_unavailable` in the React provider** (thread 3): the preplan said every pre-vault
  rejection is misuse or unfixable storage trouble, so it is thrown to the boundary; its own
  message says "try again shortly". Worth a look when the misuse-versus-condition split
  (TODO.md, *Error families*) comes up.
