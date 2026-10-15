# Sprint gripe_rulings -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread                 | Base       | Status   |
| - | ---------------------- | ---------- | -------- |
| 1 | damaged_boxes          | #83 tip    | underway |
| 2 | dialog_wording         | #83 tip    | filed [#91](https://github.com/mrflip/safebyok/pull/91) |
| 3 | tuple_ckeys            | #83 tip    | underway |
| 4 | replaceable_validators | thread 3   | pending  |

## What the threads have taught

*Orchestrator:* thread 2, dialog_wording, filed as [#91](https://github.com/mrflip/safebyok/pull/91):
the dialog reads "Locks on this device in 7 days" while creating the vault, and "Locks again on
this device in 7 days" otherwise, through `Intl.RelativeTimeFormat('en')` (one `Locale`
constant); `ForeverMs` reads "Stays unlocked on this device until you lock it". *Review:*
`flagged` -- the planned fallback for engines without RTF relied on `NumberFormat`'s unit style,
which no such engine has; dropped as a YOLO decision (see the plan). Second review `fixed` (the
doc block and README gave only the "again" wording). Left: an engine without RTF throws to the
error boundary, as before; the unit matrix tests only the creating wording. **Commit prefix for
`safebyok-react` is `client:`** (PROCESS.md), not `react:`.
