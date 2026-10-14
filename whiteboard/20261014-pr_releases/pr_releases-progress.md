# Sprint pr_releases: progress

**Status**: thread 1 filed; thread 2 underway.

## Status

| # | Thread | Model | Base | Status |
| - | ------ | ----- | ---- | ------ |
| 1 | `20261014-react_publishable` | sonnet | `origin/main` | filed [#15](https://github.com/mrflip/safebyok/pull/15) |
| 2 | `20261014-core_under_packages` | opus | thread 1's tip (#15) | underway |
| 3 | `20261014-changeset_releases` | opus | thread 2's tip | pending |

## What the threads have taught

*Review of thread 1:* clean at medium; no fixes. Minor notes left: peer range `^0.0.0` matches only 0.0.0
(for 0.x semver; thread 3 must check lockstep installs work for hosts: see below); root `test` now runs
package tests so the flaky core test can fail `test-build`; `pnpm pack` skips `prepublishOnly`. Not checked:
the `packages` job on GitHub, Node 22/26, demo click-through.

*Orchestrator, after thread 1 `ready`:*

* **Pretest builds, not aliases.** The binding (and the demo) run `build:deps` =
  `pnpm --filter '<pkg>^...' build` from `pretest`, `pretest:coverage`, `pretypecheck` and `prebuild`,
  because tsc and tsdown's declaration build resolve `safebyok` through `dist/` too. Filtering by name
  survives thread 2's move. Thread 2: keep the pattern for any package that depends on another.
* **Root `build` is not recursive yet**: with the core as the root package, `build:deps` selects the root
  and `pnpm -r build` loops. Thread 2 moving the core down makes root `build` = `pnpm -r build` safe; do it
  and check it does not loop.
* **Thread 2 owes**: fold the `packages` CI job (runs `pnpm --filter safebyok-react justify`) into the
  main jobs and delete it; the root `test`/`test:coverage` currently run the core's vitest first and then
  `pnpm -r` (the root is skipped by `-r`), which becomes plain `pnpm -r` after the move.
* **`safebyok-convex`** test script is now `vitest run --passWithNoTests` (thread 1's one-word touch).
* **Thread 3**: `pnpm pack` rewrites `workspace:^` -> `^0.0.0` (verified), but does not run
  `prepublishOnly`; the script must justify/build before staging tarballs.
* **Known flake, not ours**: `tests/vault.test.ts` "altered ciphertext" fails ~1/64 runs (prepends `A`).
  Mentioned in the PR; fix is its own thread.
* Passphrase-dialog click-through of the demo was not done (no browser in the sandbox): Coach to check.
