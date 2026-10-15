# Sprint low_hanging_fruit: progress

**Status**: 2 building; 5 (second review, re-run) and 10 in review; 11 filing; 1, 3, 4, 9 filed. Newer than the plan wherever the two disagree.

Sprint doc: [Sprint low_hanging_fruit](https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9), a live mirror: *Plan* and *Progress* tabs (the orchestrator's), and under *Threads* one tab per thread, written by that thread's worker.

## Status

| #  | Thread | Base | Status |
| -- | ------ | ---- | ------ |
| 1  | `vault_size_cap` | `origin/main` | filed [#34](https://github.com/mrflip/safebyok/pull/34) |
| 2  | `explicit_options` | thread 1 (#34, dd8c7ca) | underway |
| 3  | `provider_open_rejection` | `origin/main` | filed [#32](https://github.com/mrflip/safebyok/pull/32) |
| 4  | `epoch_millis` | `origin/main` | filed [#31](https://github.com/mrflip/safebyok/pull/31) |
| 5  | `mask_utils` | `origin/main` | in second review (re-run) |
| 6  | `boundary_audit` | thread 2 | pending |
| 7  | `stale_write_retry` | thread 6 | pending |
| 8  | `size_budget` | thread 2 | pending |
| 9  | `docs_sweep` | `origin/main` | filed [#33](https://github.com/mrflip/safebyok/pull/33) |
| 10 | `sandals` | `origin/main` | in review |
| 11 | `label_grammar_report` | `origin/main` | filing (documents only, no review) |

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
  *Review:* fixed -- the security note now says concurrent stores on one handle overshoot too.
  Taken at filing: `ensureLimitsFit` refuses an undeclared `maxRecordBytes` as well; "not even
  one lockbox fits" when none do. Left: no server-side cap (a check in the Convex component's
  `updateBox` would close it); a full vault refreshes on every refused store. Rebased onto #29:
  options are `number | undefined` now, and #29's lint wants module-scope test helpers.
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
  *Review:* flagged, two significant, decided by the orchestrator in YOLO and sent back: (1)
  `maxLen` below `head + tail + 9` collapsed into a *longer* result -- now refused as
  `bad_option`, so the result is never longer than `maxLen`; (2) bidi controls survived the
  strip -- now `\p{Bidi_Control}`, U+200B, U+2060 and U+FEFF are stripped too (ZWJ, ZWNJ,
  variation selectors and tags kept). A second review covers the new commits only. Built; the
  worker added that an omitted `maxLen` defaults to `max(15, head + tail + 9)`, so a raised
  `head` alone is not refused for a default the caller never typed.
* *Orchestrator:* **Thread 10** (`sandals`): **for every thread whose tests change, after
  thread 10 merges**: `packages/safebyok/tests/helpers.ts` is now `test-helpers.ts`, star-imported
  as `TH` in every core test; a rebased test that uses a bare `testDeriver`, `scopeOf` or
  `tweakB64` fails typecheck -- write `TH.x`. Root scripts now run the root check and then
  `pnpm -r --no-bail`, failing if either fails. `safebyok` is a peer (and dev) dependency of
  `safebyok-convex`. The slow justify is 13 tsdown builds (core rebuilt by each dependent's
  `pre*` scripts); cheapest fix: build once at the start of justify and let `pre*` skip it.
* *Orchestrator:* **Thread 9** found the core README had no locking section: it appended
  *Locking* (`visibilitychange` -> `vault.lock()`, "when `lockSoon()` lands") and *No recovery*
  at the README's end, so threads 1 and 2's README edits rebase mechanically. The expiry thread
  should update the `lockSoon()` line. The demo now calls `navigator.storage.persist()` through
  a small `keepStorage` module. The devcontainer volumes stay `byok-*`: renaming orphans them.
  *Review:* fixed -- the *Locking* section now says `lock()` also erases the device's remembered
  unlock; `domStore`'s doc block. Sent back at filing: a clean recipe snippet (unsubscribe; no
  unhandled `vault_closed`), and a dated `notes/security.md` bullet for the release App key.
  Filed: the recipe is a `lockWhenHidden(vault)` function returning an unsubscribe -- the same
  name as the planned core API, so the expiry thread should rename one or the other.
* *Orchestrator:* **`strict_configs` landed as [#29](https://github.com/mrflip/safebyok/pull/29)**:
  one strict `tsconfig.base.json`, sibling packages read from source through a `@safebyok/source`
  condition, every eslint config cut from the core's. Threads cut before it rebase onto it at
  filing (thread 9 met two empty-arrow lint errors). [#31](https://github.com/mrflip/safebyok/pull/31)
  (thread 4) now conflicts with main in the demo's `auth.ts`; a filed branch needs a
  force-push to rebase, which workers may not do (Coach, below).
* *Orchestrator:* **Thread 11** (report, `human/20261015-label_grammar_report.md`): all three
  labels could take a host grammar without touching a stored record or the binding (JSON-array
  AD escapes anything); **the colon is the one forbidden character** (the ckeys are plain
  concatenations, and `user_id` is already free-form); the real hazard is the read path (`Label`
  types the record schemas, so a wider host grammar reads back as `corrupt_record`). Seam: a
  fixed `LabelFloor` for reads, `OpenVaultOpts.labelRules` per slot for writes, validate never
  transform. No server-side grammar in Convex.
* *Orchestrator:* **Main-checkout moves are the owner's**: thread 5's second reviewer bailed on
  a `rebase` of `20261015-roadmap_fruit` onto origin/main in the main checkout; its owner
  finished that rebase at 04:04:15. Ruled not the review's; the second review was re-run.
* *Orchestrator:* **Slots count builders, not reviews** (YOLO, two-way): with 1, 5 and 9 all in
  review and nothing building, thread 10 started as a fourth agent.
* *Orchestrator:* **The main checkout moves under reviewers.** Another agent's uncommitted work
  there became [#30](https://github.com/mrflip/safebyok/pull/30) mid-review. Both reviewers traced
  it and carried on rightly. Reviewers: a change whose HEAD, reflog and stash are untouched,
  matching a pushed branch of another agent's, is not the review's.

## For the Coach

* **[#31](https://github.com/mrflip/safebyok/pull/31) conflicts with main** since #29 merged
  (`demos/safebyok-demo-react/src/lib/auth.ts`, a small textual overlap). Rebasing a filed branch
  needs a force-push, which thread workers may not do: yours to rebase, or to tell the
  orchestrator to have it done with `--force-with-lease`.

* **Merge order and thread 10's `TH` rename.** Thread 10 rewrites the import line and helper
  uses of nearly every core test; the chain (1, 2, 6, 7) adds tests on the old names. Whichever
  lands second rebases: merging the chain first and thread 10 last keeps the stacked PRs
  rebase-free and puts all the `TH.x` repairs in one rebase of thread 10.

* **The ruled screen-lock recipe defeats the remembered unlock** (thread 9's review): `lock()`
  also erases the device's seven-day unlock, so `visibilitychange` -> `lock()` asks for the
  passphrase on every return to the tab, against the dialog's "stays unlocked for seven days".
  Should `lockSoon()` / `lockWhenHidden` drop the in-memory key but keep the device record?
* **A race in `unlock()`** (thread 9's review, `vault.ts`, outside every thread): a `lock()` that
  lands during unlock's KDF or `rememberDevice` awaits is overwritten, leaving the vault unlocked
  and remembered. The recipe makes it likely. No thread in this sprint touches `unlock()`: a
  candidate for its own small thread.

* **Thread 1's fit check departs from the preplan** (above): stronger, measured, and the
  defaults still fit. And `maxVaultBytes` is abstract, so third-party adapters must declare it;
  a default of `Infinity` would be gentler but lets a limited backend forget. `vault_full` should
  join TODO.md's *Error families* as a condition (#26 owns TODO.md).

* **`storage_unavailable` in the React provider** (thread 3): the preplan said every pre-vault
  rejection is misuse or unfixable storage trouble, so it is thrown to the boundary; its own
  message says "try again shortly". Worth a look when the misuse-versus-condition split
  (TODO.md, *Error families*) comes up.
