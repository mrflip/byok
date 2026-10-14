# 2026-10-14: Convex adapter designed; whisper cap in PR #7 -- three questions

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

## Questions

* `MaxWhisperBytes` carries an `eslint-disable-line unicorn/numeric-separators-style`, so it
  stays greppable as `40444`. OK?
* Should `VaultProvider` forward `maxWhisperBytes` (and `rememberForMs`, which it doesn't today),
  or take an `openVault` options object?
* Should each adapter declare a ceiling (Convex about 1 MiB, DynamoDB 400 KB) that `openVault`
  refuses to exceed?
