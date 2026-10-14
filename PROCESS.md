# Process

How work moves from an idea to a published version: threads, commits, pull requests, releases,
and what may be added to the package. CLAUDE.md has the values these serve; STYLE.md has how the
code itself reads.

## Threads

Work goes in **threads**: one line of work, one branch, one PR. A branch is named
`YYYYMMDD-<label>`, the date it was cut and a short lowercase label (`20261014-scaffold`). Plans
and progress for a thread that takes more than a sitting go in `whiteboard/YYYYMMDD-<label>/`.

Within a thread you have standing permission to commit, push its branch, and open its PR without
asking. Commit at natural milestones: a set of related changes, with `pnpm justify` green. Not
mid-refactor, not on a timer.

## The history we keep

* **History on main is semi-linear.** Every PR branch is rebased onto the tip of `main` and lands
  as one merge commit, so `git log --first-parent main` reads one line per PR and
  `git revert -m 1 <merge>` backs a PR out whole.
* **Never merge `main` into a branch**, and never use GitHub's "Update branch" in merge mode:
  rebase. CI rejects a PR branch holding a merge commit.
* **Every commit lands in main individually**, so each should pass `pnpm justify`. An
  intermediate red commit is allowed only when it isolates something, say a large mechanical
  change from the thoughtful repairs after it, and the PR says so.
* **Force-push only with an explicit lease**: `--force-with-lease=<branch>:<sha you expect>`.
  Never plain `--force`, and never a branch that isn't your thread's.
* **Never merge a PR or enable auto-merge. The Coach merges.**
* Before a command that throws work away (`reset --hard`, `restore`, `clean`, `branch -D`), make
  what it would discard reachable first: commit it or put a branch on it. If you can't tell what
  it would discard, stop and ask. Anything that touches `main` directly: stop and ask.

### Rebase conflicts

Fix the straightforward ones yourself and carry on: the lockfile (take the base's, then
`pnpm install`), edits side by side that don't contradict, docs and import lists, tests the base
broke mechanically. Stop and ask when both sides changed the same logic, when the base changed
something the thread depends on, or when resolving would drop a change from either side. Before a
hairy rebase, tag the tip (`git tag prerebase/<branch> <branch>`, kept local) so there is a named
place to rewind to.

## Commit messages

One prefix, lowercase, a colon, a space, and a plain-language sentence saying what changed. The
prefix names the part of the package the commit is about, never the kind of change (no `feat:`,
`fix:`, `chore:`), and never two.

| Prefix | What it covers |
| --- | --- |
| `crypto` | key derivation, encryption, key wrapping, randomness: anything a cryptographer would review. Takes precedence over every other prefix. |
| `format` | the shape of what is stored, and reading what older versions stored. Beats everything but `crypto`. |
| `vault` | the vault's lifecycle and state: create, unlock, lock, refresh, rotate, subscribe |
| `storage` | the storage interfaces and their adapters |
| `api` | the public surface: exports, entry points, exported types, errors |
| `tools` | build, lint, test and TypeScript configuration, CI and release workflows |
| `deps` | adding, removing or bumping a dependency, and the lockfile |
| `agent` | `CLAUDE.md` and other directives to agents |
| `docs` | `README.md`, `PROCESS.md`, `STYLE.md`, `notes/` |
| `plan` | `whiteboard/` plans and `human/` entries |
| `tests` | tests and fixtures, when the tests themselves are the work |

Tests and notes that ride along with a change take its prefix. When two areas change in one
commit, that is a sign to split it. A small change is usually one commit: don't split a
twelve-line fix into three to look diligent.

## Pull requests

File against `main`, unless *significant* questions hang -- ones whose answer would change the
code in the PR -- then ask in chat first.

* **Title**: plain language, saying what changed.
* **Body**: what changed, in short paragraphs or bullets with **bold lead-ins**; a **Tests:**
  line naming what ran and the counts; "Stacked on #N" for an unmerged PR the branch stands on;
  and an *Open questions* list for what remains. Put those questions in chat and `human/` too: a
  PR description is easy to miss.
* A change to the public surface or to the stored format says so in its first line, and says
  what a consumer or an existing vault has to do about it.

CI runs on every PR: `lint-typecheck` (lint, typecheck, no merge commits) and `test-build` (tests
with coverage, then the build with its package checks) must pass; `node-compat` runs the tests on
the other Node majors and reports.

## Releases

The Coach releases; agents never tag, publish, or change a version number unasked.

* Versions are semver. Until 1.0, a minor bump may break the public surface, and its release
  notes say how.
* A release is a PR that bumps `version` in `package.json`, merged; then a GitHub release tagged
  `v<version>`. Publishing the release runs `.github/workflows/release.yml`, which checks the tag
  against the version, runs `pnpm justify`, and publishes to npm with provenance. A prerelease
  version (`0.3.0-beta.1`) goes out under the `next` dist-tag.

## Dependencies

Everything we build with is chosen against the same test: **boring** (proven, widely adopted),
**agent-friendly** (old enough to be in an agent's training), **ergonomic**, **zero-ops**, and
offering a **disciplined interface**. Nothing still being proven; but we move with the front of
the crowd once it is clear where the long-term relevance lies.

* **Runtime dependencies** (`dependencies`, `peerDependencies`) ship to every app that installs
  us. Propose one in chat, with what it replaces and how widely it is used, before adding it.
* **Development dependencies** that are plainly the boring answer may simply be installed: say so
  afterwards.
* Version numbers and release status drift. Before pinning anything, check the current release;
  don't trust a recalled version number, including one recalled by an agent.

The toolchain: TypeScript (pinned exact: typescript-eslint caps the version it supports), Vitest,
ESLint with typescript-eslint, unicorn, sonarjs, import-x and @stylistic, and tsdown for the
build, with publint and arethetypeswrong checking the package it makes.

## Where things are written

* **`human/`** -- from agents, to Coaches: one file per entry (`human/README.md`).
* **`whiteboard/`** -- a thread's plans and progress, while it is open.
* **`notes/security.md`** -- a decision a security reviewer should look at, in a sentence or two,
  dated. Add one when you make such a decision, in the same PR.
* **Doc blocks** -- what a caller needs, and nothing about how the code came to be.
