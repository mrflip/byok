# Sprint gripe_followups -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread              | Base          | Status   |
| - | ------------------- | ------------- | -------- |
| 1 | vault_amendments    | `origin/main` | underway |
| 2 | validation_overrides | `origin/main` | filed [#85](https://github.com/mrflip/safebyok/pull/85) (no review: documents only) |

## What the threads have taught

*Orchestrator:* thread 2, validation_overrides, filed as [#85](https://github.com/mrflip/safebyok/pull/85)
(documents only, no review). The write-up, `validation-overrides.md`, recommends a fixed
**floor** (ASCII, no colon, length ceilings, checked everywhere, reads included) under a
replaceable **policy** (checked only where a name is made, defaulting to today's grammar), set
through `openVault({ validators: { boxlabel?, userId?, note? } })`. The defaults move into
`safebyok/validators`, with no `z` re-export and no ckey stringifier for now. Its six questions
for the Coach decide a later build thread; none blocks this sprint. For thread 1: a `validators`
bag would make `VaultProvider` reopen the vault on every render if built inline, and the size
allowance assumes ASCII labels.
