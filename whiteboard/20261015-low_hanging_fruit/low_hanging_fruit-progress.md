# Sprint low_hanging_fruit: progress

**Status**: threads 1, 3, 4 underway. Newer than the plan wherever the two disagree.

Sprint doc: [Sprint low_hanging_fruit](https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9), a live mirror: *Plan* and *Progress* tabs (the orchestrator's), and under *Threads* one tab per thread, written by that thread's worker.

## Status

| #  | Thread | Base | Status |
| -- | ------ | ---- | ------ |
| 1  | `vault_size_cap` | `origin/main` | underway |
| 2  | `explicit_options` | thread 1 | pending |
| 3  | `provider_open_rejection` | `origin/main` | in review |
| 4  | `epoch_millis` | `origin/main` | in review |
| 5  | `mask_utils` | `origin/main` | pending |
| 6  | `boundary_audit` | thread 2 | pending |
| 7  | `stale_write_retry` | thread 6 | pending |
| 8  | `size_budget` | thread 2 | pending |
| 9  | `docs_sweep` | `origin/main` | pending |
| 10 | `sandals` | `origin/main` | pending |
| 11 | `label_grammar_report` | `origin/main` | pending |

## What the threads have taught

* *Orchestrator:* **`pnpm changeset` names files at random on main.** PROCESS.md's
  `.changeset/YYYYMMDD-<label>.md` naming comes from `scripts/changeset.ts`, which is not on
  main yet (it is uncommitted work in the main checkout). Rename yours by hand to
  `.changeset/20261015-<label>.md` so the PRs match the rule that is coming.
* *Orchestrator:* **Thread 4** found almost nothing to change outside the stored fields: the demo's
  account `created_at` and one test clock. `DeviceUnlock.expires_at` and `expiresAt` were
  already numbers. Thread 2's rename of `expiresAt` inherits a number.
* *Orchestrator:* **Thread 3**: `VaultProvider` now throws a rejected `openVault` during render.
  A host needs an error boundary around it; the React README line saying so rides with thread
  3 at filing. Threads 1 and 2 add and require provider props: thread 3 left the props and the
  `satisfies` line alone, so their rebase is mechanical. The `open_vault_unsubscribe` work is
  still on pre-move paths (`src/vault.ts`) and needs repathing before it can land.
