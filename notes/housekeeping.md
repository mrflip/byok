# Housekeeping

Occasional chores, for when the clutter starts to annoy. None of this is part of a thread's
routine: that is `PROCESS.md`.

## Retiring stray branches

```
scripts/git-attic [--apply] [--against <ref>] [--retire <branch>]... [--no-prs]
```

Local branches pile up that `git branch --merged` cannot clear: a branch whose PR merged after a
rebase (its work reached `main` under other commits), a backup taken before a rebase, a draft of
a commit that landed reworded. `scripts/git-attic` finds them and retires each to a tag that says
what it was. It only reports what it would do until it is given `--apply`.

* `--apply` -- retire what the report lists.
* `--against <ref>` -- the history to judge by, `HEAD` unless given. Stand on (or name) a branch
  that holds `main`.
* `--retire <branch>` -- retire a branch whose work is not merged, once you have looked and
  decided to let it go. Repeat it for several.
* `--no-prs` -- don't ask GitHub which pull request each branch was. Otherwise `gh` is asked
  once, and its answer left out of the tags if it cannot be had.

Every local branch is one of:

* **In history** -- its tip is in the history it is judged by: on the line `HEAD` stands on, or
  in a pull request merged into it. Left alone.
* **Merged** -- off that history, but each of its commits is in it, either as the same change
  (`git cherry`) or under the same subject line. Retired.
* **Unmerged** -- a commit with no match. Reported with those commits, and left alone until you
  name it with `--retire`.

A branch checked out in any worktree is never retired, and the report says so.

**Retiring** makes an annotated tag `attic/<branch>` at the branch's tip, then deletes the
branch. The tag's message names the pull request (when `gh` knows it), the tip, and how many of
the branch's commits matched by change and how many by subject, listing those, and for a branch
let go with `--retire`, the commits that matched nothing. Read one with `git tag -n20
attic/<branch>`. If `attic/<branch>` already exists at the same commit (another checkout retired
the branch first, and its tag was fetched), the branch is just deleted; if that tag names another
commit, the new one is `attic/<branch>-<short hash>`.

It never touches a remote: nothing is pushed, and no remote branch is deleted.

**Publishing the attic.** The tags stay local until pushed:
`git push origin 'refs/tags/attic/*'`. In another checkout, `git fetch origin --tags` brings
them. A plain fetch does not: it follows only the tags that point at commits it is already
fetching, and an attic tag points at a commit no branch holds any more.

## Stale worktrees

`git worktree list` marks a worktree whose directory is gone as *prunable*, and its branch stays
checked out there, so nothing will retire or delete it. `git worktree prune` clears the stale
entries.

## Finder's .DS_Store files

```
scripts/clear-ds-store.sh
```

macOS Finder writes a `.DS_Store` file into each folder it shows, including folders in a
container's workspace that the Mac shares. They are gitignored, but one left in a folder that git
is emptying, in a rebase or a `git worktree remove`, keeps the folder from being deleted. Run
this in the worktree first.

It takes no arguments: it clears the worktree holding the current directory, and nothing else --
not the main checkout from a linked worktree, not a sibling, not a worktree nested inside this
one. It deletes only a regular file named exactly `.DS_Store` that git ignores, so a tracked one
stays, and what git sees never changes. It follows no symlink, crosses into no other filesystem,
and skips `.git` and `node_modules`. Finder may write a new one a moment later; if git still
balks, run it once more.
