# Sprint gripes_part2 -- progress

## Status

| #   | Thread                | Status   |
| --- | --------------------- | -------- |
| 1   | validators_tightening | underway |
| 2   | convex_setup_check    | filed #102 |
| 3   | test_hygiene          | in review (#103) |
| 4   | docs_rulings          | filed #101 |

## What the threads have taught

* **Thread 2 (#102), convex_setup_check.** `SafebyokComponent.api(opts)` refuses a bag without a
  `getUserId` function, and `new SafebyokComponent(component)` a non-object component (a forgotten
  `app.use(safebyok)`), both `bad_option` from `VaultError`; no new kind. Importing `VaultError`
  into `server.ts` costs a host's Convex bundle 98 B (esbuild-measured). *Review:* clean; left,
  minor: a `getUserId` relying on `this` passes the check (predates), the test setup repeats
  `hostWith`'s, one test pins 9 functions, `checkedApiOpts`'s generic is only a cast. At the
  orchestrator's word the worker then trimmed the message and added the component check (three
  tests): small, but after the review. An installed-looking proxy for a never-deployed component
  still fails only at the first call.

* **Thread 4 (#101), docs_rulings.** `TODO.md` *Soonish* gains the Coach's validator-guarantees
  heading (refused text in `snapshot.boxes`, control characters, lone surrogates, server-side names,
  `unlocklabel`), "Group error messages?", the damaged-box store race, and Convex's `getUserId`
  question; a *Rulings from gripes_part2* section before *Sand in the sandals*; `STYLE.md`'s
  `expect*` rule. *Review:* none (documents only). Deviation, accepted: *Pluggable label validator*
  and *Validating the user id* stay where they were (moving them would be a large hunk in a shared
  file). **For threads 1 and 2**: its TODO lines on control characters, lone surrogates and the
  Convex setup check assume your builds; if yours land differently, say so in your report.

*Orchestrator:* the three cleanup leftovers the Coach asked about (size checks, erase's double
read, `read()`'s doc), `withUnlockedVault` against #98, and `unlocklabel`'s slot are matter rows in
the doc's Open Matters tab, drafting.
