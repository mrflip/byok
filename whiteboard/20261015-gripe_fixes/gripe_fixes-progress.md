# Sprint gripe_fixes -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread             | Base                  | Status  |
| - | ------------------ | --------------------- | ------- |
| 1 | kdf_configs        | #66 tip `dfdbbec`     | underway |
| 2 | vaultdb_validation | #66 tip `dfdbbec`     | underway |
| 3 | react_dialog       | #66 tip `dfdbbec`     | in review |
| 4 | ci_tooling         | #66 tip `dfdbbec`     | pending |
| 5 | docs_refresh       | #66 tip `dfdbbec`     | pending |
| 6 | thin_tests         | #66 tip `dfdbbec`     | pending |
| 7 | test_helpers       | thread 6's tip        | pending |
| 8 | comment_width      | #66 tip, after 1-7    | pending |

## What the threads have taught

*Orchestrator:* thread 3 (react_dialog) is `ready`: `PassphraseModal` takes an optional `reentryHours` prop that `VaultProvider` fills from its `forcePassphraseReentryHours`. No core accessor exists for the window, so a host rendering the dialog by hand repeats the value; a later core accessor would end that (thread 3 left `vault.ts` to threads 1 and 2).
