# Sprint gripes_part2 -- progress

## Status

| #   | Thread                | Status   |
| --- | --------------------- | -------- |
| 1   | validators_tightening | underway |
| 2   | convex_setup_check    | underway |
| 3   | test_hygiene          | underway |
| 4   | docs_rulings          | filed #101 |

## What the threads have taught

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
