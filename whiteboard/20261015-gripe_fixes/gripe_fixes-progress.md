# Sprint gripe_fixes -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread             | Base                  | Status  |
| - | ------------------ | --------------------- | ------- |
| 1 | kdf_configs        | #66 tip `dfdbbec`     | underway |
| 2 | vaultdb_validation | #66 tip `dfdbbec`     | underway |
| 3 | react_dialog       | #66 tip `5fefc90`     | filed [#67](https://github.com/mrflip/safebyok/pull/67) |
| 4 | ci_tooling         | #66 tip `5fefc90`     | underway |
| 5 | docs_refresh       | #66 tip `dfdbbec`     | pending |
| 6 | thin_tests         | #66 tip `dfdbbec`     | pending |
| 7 | test_helpers       | thread 6's tip        | pending |
| 8 | comment_width      | #66 tip, after 1-7    | pending |

## What the threads have taught

*Orchestrator:* **#66's tip moved** from `dfdbbec` to `5fefc90` during the sprint: three docs-only
commits (CLAUDE.md's console line, TODO.md's second_harvest questions, a changeset, the core's
eslint comment). Threads cut later start from `5fefc90`; a thread cut from `dfdbbec` rebases onto
it when it files, as thread 3 did.

*Orchestrator:* thread 3, react_dialog, filed as [#67](https://github.com/mrflip/safebyok/pull/67).
*Review:* `clean`, nothing fixed by the reviewer. The worker took two of its minor points before
filing: the pluralizer is `Intl.NumberFormat` (`useGrouping: false`, output identical), and the
test table's quotes follow STYLE.md. Left, as open questions on the PR: a misuse unlock never
settles the `withUnlockedVault` promise (follow-up: changes `onDone`'s contract); a sub-minute
window reads "1 minute"; the dialog's 168 default and recomputed `ForeverMs` can drift from the
core, which a core accessor for the window would end; the modal test's local helpers are thread
7's to consider.
