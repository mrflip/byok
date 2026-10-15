# Sprint gripe_rulings -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread                 | Base       | Status   |
| - | ---------------------- | ---------- | -------- |
| 1 | damaged_boxes          | #83 tip    | filed [#93](https://github.com/mrflip/safebyok/pull/93) |
| 2 | dialog_wording         | #83 tip    | filed [#91](https://github.com/mrflip/safebyok/pull/91) |
| 3 | tuple_ckeys            | #83 tip    | in review ([#92](https://github.com/mrflip/safebyok/pull/92)) |
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

*Orchestrator:* thread 1, damaged_boxes, filed as [#93](https://github.com/mrflip/safebyok/pull/93):
a lockbox whose record fails its check lists as `{ boxlabel, damaged: true }`, named by the ckey
it sits under (so a row that isn't JSON can still be removed); `openVault` and `refresh()` no
longer refuse over one; `erase()` removes it from any handle; `store()` erases then writes it
afresh; `read()`/`use()` still refuse. **Breaking for adapter authors**: `doListBoxes` returns
`{ boxlabel, lockbox }` pairs. *Review:* `fixed` -- the demo's Enter key knocked past the
button's gate; the security note names the two store-over-damaged races; the worker then
corrected the docs' "fails verification" wording (ed42ce5). Left, minor: those races (closing
them needs a revision-guarded erase in the adapter contract); a JS adapter on the old contract
lists every box as damaged. **For the restack**: `boxlabelOfCkey` and both string/IndexedDB
listings conflict with thread 3 (the boxlabel becomes the tuple's last element);
`NameableLockbox` and `listedOrDamaged` should take thread 4's validators. Size: `everything`
24.45 of 24.5 kB.
