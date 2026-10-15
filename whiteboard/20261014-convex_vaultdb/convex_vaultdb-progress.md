# Sprint convex_vaultdb: progress

**Status**: thread 1 filed (#17); thread 2 underway

The orchestrator's document: newer than the plan wherever they disagree. Each worker's own
account is in `thread-<N>-<label>.md` on its branch.

## Status

| Thread | Label            | Branch                       | Base               | Status   |
| ------ | ---------------- | ---------------------------- | ------------------ | -------- |
| 1      | convex_skills    | `20261014-convex_skills`     | origin/main        | filed [#17](https://github.com/mrflip/safebyok/pull/17) (no review: docs only) |
| 2      | storage_verbs    | `20261014-storage_verbs`     | origin/main        | underway |
| 3      | convex_component | `20261014-convex_component`  | thread 2, on filing | pending  |
| 4      | convex_client    | `20261014-convex_client`     | thread 3, on filing | pending  |

## What the threads have taught

*Orchestrator:* from thread 1 (convex_skills):

* **Six Convex skills** live under `packages/safebyok-convex/.claude/skills/` (from get-convex/agent-skills
  at 191a5c33, Apache-2.0), edited so none runs `npx convex dev` or touches a deployment. Threads 3 and 4
  read them with `git show origin/20261014-convex_skills:packages/safebyok-convex/.claude/skills/<path>`:
  `convex-create-component` (and its `references/`) for the component; `convex-expert` for schema,
  validators, queries and mutations; `convex-test` and `convex-verify` for tests (the latter has the
  edge-runtime vitest config); `convex-reviewer`; `convex-docs` for version pinning. Thread 1's file,
  `thread-1-convex_skills.md` on that branch, has the full table.
* **No skill covers the client** (`ConvexClient`, `ConvexReactClient`, `onUpdate`) or `ConvexError` with
  `data`. Read docs.convex.dev, the `.d.ts` files under `node_modules/convex/dist/esm-types/`, and
  `node_modules/convex-test/README.md`.
* **Thread 3's package eslint config must ignore `.claude/**`.** Today `pnpm justify` inside
  `safebyok-convex` fails on main too ("all files ignored"), because the package has no source; thread 3's
  sources fix that.
* Nested skills load once an agent reads a file in that subtree. Whether a subagent sees them is undocumented,
  so read the SKILL.md directly.

*Review:* thread 1 had no review, since it is documents only. At filing, the worker found one more
deployment-running rule (`npx convex dev --typecheck-components` in
`references/packaged-components.md`) and removed it (`9af2ddd`). The full local edits are
`git diff 96c7a91 9af2ddd -- packages/safebyok-convex/.claude`. Open: the TODO.md two-line conflict
with the Coach's uncommitted rewrite, and whether to install Convex's own Claude Code plugin.

*Orchestrator:* **a flaky core test, for the Coach.** `tests/crypto.test.ts` › "refuses altered ciphertext
and the wrong key alike" overwrites the first base64url character with `A`. When that character already is
`A` (1 run in 64), the test fails. The defect is in the test, not the crypto. The fix is to flip a byte
instead. No thread of this sprint owns it; thread 2 may fix it if it touches that file anyway, declared.
