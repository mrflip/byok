---
name: branch-sweep
description: Sweep finished threads out of the local repository -- fetch, survey every local branch and worktree, tag each branch whose PR has merged as closed/<branch> and point it at its merged head on main, remove the worktrees of finished threads that are clean and idle, and report what was swept, what looks in progress, and what looks weird. Use only when the Coach invokes /branch-sweep.
disable-model-invocation: true
context: fork
agent: general-purpose
model: sonnet
argument-hint: "[clarifications, e.g. \"leave the convex worktree\", \"dry run\"]"
---

# Sweep finished branches and worktrees

The Coach's words after the command: `$ARGUMENTS`

They are clarifications, and where they conflict with this file, they win. `dry run` means:
survey and report what you would do, and write nothing.

**This skill is the exception to two standing rules**, by the Coach's decision: PROCESS.md and
`/closeout` say never to move a branch that isn't your thread's, and never to remove another
worker's worktree. Here you may do both -- only to what the survey calls finished, and only in
the ways below. Every other rule stands: no push, no remote branch deleted, no local branch
deleted, no tag deleted or moved (a `-prerebase` tag is someone's marker), no `--force`, and the
main checkout (`/workspace/byok`, on `main`) is never touched.

Other agents and the Coach work in this repository while you sweep: a PR may merge, a branch
may move, a worktree may appear. So the survey is a snapshot, and every write below checks its
ground again at the moment it writes.

## 1. Survey

```sh
.claude/skills/branch-sweep/survey.sh /workspace/byok
```

It fetches, reads every local branch, its PRs (`gh`) and its worktree, and writes nothing. Its
header comment documents the rows. In short, each branch gets one verdict:

* `close` -- a PR from this branch merged into main, that PR's head is on main, and every commit
  on the local branch has a counterpart on main (itself, a patch-equivalent, or a commit with
  the same long subject). The row carries the full local and target SHAs.
* `done` -- swept already.
* `active` -- an open PR, a worktree, or a fresh branch with no PR yet.
* `weird` -- anything else, with the reason.

and each worktree `remove` (its branch is finished, and it has no changes, no ignored files but
build output, no process running in it, and no file touched in the last half hour) or `keep`.

Do not second-guess a `close` into action you would not otherwise take, nor promote a `weird` or
`active` row to `close` because it looks finished to you: the survey's rules are the line. You
may *demote* a row -- treat a `close` as `weird` -- when something you see makes you less than
certain, and say why.

## 2. Remove the finished worktrees

For each `tree remove` row, in turn:

```sh
git -C <path> status --porcelain        # must print nothing
git worktree remove <path>              # never --force
```

If either step balks, the worktree stays: report it under *weird* with git's words. Removing a
worktree deletes its ignored build output (`node_modules`, `dist`, caches) with it, which is
expected; anything else would have kept it off the `remove` list.

Then `git worktree prune --dry-run --verbose`: entries it lists are worktrees whose directory is
already gone. Prune them (`git worktree prune`) and name them in the report.

## 3. Close the finished branches

For each `branch close` row (`<branch> <local> <target>`), in turn:

```sh
git worktree list --porcelain | grep -x "branch refs/heads/<branch>"   # must print nothing
git tag closed/<branch> <local>                                         # fails if it exists: good
git update-ref -m "branch-sweep: closed, at its merged head" refs/heads/<branch> <target> <local>
```

* A branch still checked out in a worktree (one step 2 kept) is not moved: moving a checked-out
  branch strands its worktree. Tag it, leave it where it is, and report it under *weird* with the
  worktree's reason.
* `update-ref` with the old value is a compare-and-swap: if the branch moved since the survey,
  it fails and changes nothing. Report that under *weird*; do not retry from a fresh survey.
* When `<local>` and `<target>` are the same, the tag is the whole of it; skip the `update-ref`.
* The tags stay local. Never push them.

## 4. Look at the weird ones -- do not fix them

For each `weird` row, spend a few commands finding out what it is, enough to give the Coach a
one-line read and a recommendation: a closed PR whose work landed another way, a branch holding
commits that were reworded on main, a restack's leftover, a worktree checked out on a branch
whose label does not match its directory. Touch nothing.

## 5. Report

Your final message goes to the Coach, who may be reading on a phone. Link each PR in full the
first time it appears (`[#12](https://github.com/mrflip/safebyok/pull/12)`). Three lists, in this
order, each line one branch or worktree:

* **Swept** -- each removed worktree (path and branch); then each closed branch with its PR,
  `moved <local7> → <target7>` or `tag only`, and the survey's reason when it is anything but
  "local is the merged head". Long runs of tag-only branches may share one line.
* **Likely in progress** -- each `active` branch: its PR or "no PR yet", its worktree, and
  anything odd the survey noted (a local tip that differs from the PR's head).
* **Weird** -- each `weird` row, and each thing in steps 2 and 3 that balked: what it is, what
  you found, and what you recommend. These are the questions for the Coach.

Close with one line each for: the `done` count, any worktree prunes, and the survey's `remote`
count (finished branches still on origin; GitHub's "Automatically delete head branches" setting
would clear them, and that is the Coach's call). Then end, without a summary of the summary.
