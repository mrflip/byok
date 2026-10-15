# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | underway                   |
| 2 | release_age       | underway                   |
| 3 | passkey_button_ux | underway                   |
| 4 | small_sweep       | pending                    |
| 5 | vaultdb_battery   | waiting on the gripes line |
| 6 | race_helper       | waiting on thread 5        |
| 7 | indexeddb_fixes   | waiting on the gripes line |

## What the threads have taught

Nothing yet.

*Orchestrator:* for `/turbochat`, learned while running it: a new table row goes in as blocks
(`insert`, `"as":"blocks"`, a `row` of `cell`s, at `side: "end"` of the table), with placeholder
text in each cell; then each placeholder paragraph is replaced with markdown that carries its chip.
A markdown row inserted after a row is refused (`shape_mismatch`). The doc mirror of this sprint is
a status tab linking to these files, not a full copy: the doc takes only inline text, and
re-sending the plan whole costs more than the Coach's token budget wants.
