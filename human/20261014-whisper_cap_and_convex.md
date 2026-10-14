# 2026-10-14: Convex adapter designed; whisper cap in PR #7 -- two questions

Two threads, both stacked on #6 (`20261014-nonextractable`), each in its own worktree so the
agent working in `/workspace/byok` is undisturbed.

* **`20261014-convex`** (branch only, no PR yet): the design, as you decided it, is in
  `whiteboard/20261014-convex/design.md`, a component in `packages/byok-convex` with typed columns
  and Ciphered fields stored nested. The package so far is a `package.json` with `convex` (peer),
  `convex-test` and `@edge-runtime/vm`. The esbuild install script is denied. TODO.md gained the
  scoped Convex skill, padding, a pluggable stringifier and tree-shakability (Soonish), and a blob
  helper (Not yet).
* **`20261014-whisper-cap`**, PR [#7](https://github.com/mrflip/byok/pull/7): `openVault({ maxWhisperBytes })`,
  default `MaxWhisperBytes = 40444`, checked on write only.

## Settled in chat

* `MaxWhisperBytes = 40_444 // searchable: 40444`.
* `VaultProvider` takes every openVault option and passes each through as given.
* Each VaultDB declares `maxRecordBytes`; openVault refuses a `maxWhisperBytes` over half of it.

## Questions

* `localVaultDB` declares a mebibyte per record: localStorage has no per-record limit, only about
  5 MB per origin in all, so the number is a choice, not a fact. `idbVaultDB` declares `Infinity`.
  Right?
* `VaultProvider` drops an `openVault` rejection on the floor (`void openVault(...).then`), as it
  did before this PR. Now that props can be refused (`bad_option`), should it surface the error,
  through the context or an `onError` prop?
