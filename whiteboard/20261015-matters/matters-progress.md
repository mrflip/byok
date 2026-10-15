# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | underway                   |
| 2 | release_age       | filed #96                  |
| 3 | passkey_button_ux | underway                   |
| 4 | small_sweep       | underway                   |
| 5 | vaultdb_battery   | waiting on the gripes line |
| 6 | race_helper       | waiting on thread 5        |
| 7 | indexeddb_fixes   | waiting on the gripes line |

## What the threads have taught

* **Thread 2 (#96), release_age.** Seven days, strict; the lockfile re-resolved, ten floors lowered
  to aged releases, the big_feats hand pins retired. One exclusion, `convex-test@0.0.61`, ages at
  **2026-10-16T23:01Z**: whoever touches the line after that removes it (the PR says how). Every
  later thread: a dependency floor must name a release at least seven days old, or the frozen
  install fails. *Review:* fixed one (the exclusion's expiry was a date, not a time); left as minor
  the caret-on-0.0.x cosmetic, Dependabot security updates bypassing the cooldown (by design,
  PROCESS.md), the days-vs-minutes skew, and dist byte-identity after tsdown 0.23.1 -> 0.23.0
  (unchecked).

*Orchestrator:* for `/turbochat`, learned while running it: a new table row goes in as blocks
(`insert`, `"as":"blocks"`, a `row` of `cell`s, at `side: "end"` of the table), with placeholder
text in each cell; then each placeholder paragraph is replaced with markdown that carries its chip.
A markdown row inserted after a row is refused (`shape_mismatch`). The doc mirror of this sprint is
a status tab linking to these files, not a full copy: the doc takes only inline text, and
re-sending the plan whole costs more than the Coach's token budget wants.
