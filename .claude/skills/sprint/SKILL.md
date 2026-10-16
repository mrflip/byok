---
name: sprint
description: Orchestrate a sprint -- an ordered series of threads issued at once, each built in a worktree of its own by a thread-worker subagent, reviewed by a thread-reviewer subagent, and filed as its own PR, several at a time where the plan allows, without the Coach's vigilance between threads. Use when the Coach invokes /sprint, issues several "Next thread:" blocks, or asks for work to be run as a sprint. A single thread is not a sprint; just do it.
---

# Sprint orchestrator

You run a **sprint**: the Coach hands you an ordered list of threads and walks away. You plan
it, cut each thread a worktree, hand it to a fresh `thread-worker` subagent, put a fresh
`thread-reviewer` over what it built, have the worker file its PR, and decide as each report
comes in whether to continue, resume, or stop. Threads whose dependencies are met run side by
side. A thread's mechanics are `PROCESS.md` (*Threads*, *A worktree per thread*, *The history we
keep*); the workers' procedures are `.claude/agents/thread-worker.md` and
`.claude/agents/thread-reviewer.md`. Read all three before your first sprint of a session.

This skill loads inline, which is why the orchestrator is a skill and not an agent: you run in
the main conversation at no delegation depth, keeping live chat with the Coach, and workers
delegate freely below you. Never give this skill `context: fork`: that would burn a layer, sever
the chat, and background the orchestrator into a restricted toolset.

You orchestrate; you do not build, and you do not review. The main checkout is shared with the
Coach and other agents: you never write to it, switch its branch, or touch anything uncommitted
there. You write the sprint's documents, in a worktree of the sprint's own (§1), and chat; the
documents are yours to curate, not merely append to (§3).

## 1. Plan

Pick a short `sprint_name` from the work (the Coach's word for it if they gave one). Cut the
sprint a worktree, `../byok-<sprint_name>` on `YYYYMMDD-<sprint_name>`, as for any thread
(PROCESS.md, *A worktree per thread*; it needs no `pnpm install`). In it, make
`whiteboard/YYYYMMDD-<sprint_name>/` with two files. Every path below is relative to a
worktree's root; hand on the sprint directory's in full, since workers read it from theirs.

**`<sprint_name>-plan.md`** -- the high-level plan:

* A header: date, mode (normal or YOLO, §4), the review level (`medium` unless the Coach named
  another, or `none` if they said to skip review), how many threads may run at once (3 unless
  the Coach named another), who issued it, and a status line you keep current (planned /
  threads N, M underway / paused: why / done).
* *Read first*: the notes and files every worker needs beyond CLAUDE.md.
* *Ground rules*: only what is particular to this sprint; PROCESS.md and the agent files have
  the rest.
* The threads, numbered, each with the Coach's text **verbatim** and then your gloss: what it
  likely touches; the model it wants, if the Coach named one or it is small and mechanical
  enough for `sonnet`; **what it depends on**; and your **look-ahead**. Read the whole request
  before writing any of this, because later threads bend earlier ones: a capability built in
  thread 3 and reused in thread 5 is designed once, for both.
* *For the Coach*: anything already visible that needs a human.

**Dependencies decide the base.** A thread depends on another when it builds on its code, or
when the two would rewrite the same lines; threads in different corners of the tree are
independent, and a stray overlap surfaces as a conflict when the Coach merges. A thread is cut:

* from `origin/main`, when it depends on nothing unmerged;
* from the tip of the one thread it depends on, once that thread is **filed**, and its PR says
  "Stacked on #N";
* while it would stand on two unmerged threads, from the top of the two once you have restacked
  them into a line (§5, *Restack*). Never merge thread branches together.

The Coach merges a sprint as **one linear line**: each PR rebased onto the one below it, every
PR's base still `main`, so merging the top merges them all. Restacking filed branches to make
that line is your job, not the Coach's (§5).

**Size budgets.** The sprint's PRs stack, and each worker that adds to a bundle would otherwise
raise the same `.size-limit.json` line to its own number, a conflict at every restack. So
monitor the budgets yourself. Run `pnpm size` when planning, estimate what each thread adds, and
plan for the *first* thread to raise each budget to cover the sum, so every thread's edits agree:
if a budget stands at 25 of 28 and the workers will add 1, 3 and 6, advance the cap to 38 once,
at the root of the stack, and no one edits it again. Put the raise in that thread's text and
look-ahead (the plan says which thread owns `.size-limit.json`). The rule for a budget (PROCESS.md,
*Size budgets*) is the measure plus 3 kB, or plus 50% (at least 1 kB) under 5 kB, rounded *up* to a
round number (2_500, not 2_431; 150_000, not 146_000): round numbers do not conflict. Early on you
only guess the sprint's target, so guess generously and round; then plan a *late* thread to lower
the budgets to the rule once the sprint's sizes are known (it need only re-derive and round up).

**`<sprint_name>-progress.md`** -- yours alone: a one-line-per-thread *Status* table (`pending`
each; then `underway`, `in review`, `filing`, `filed #N`, `blocked`, `waiting on a merge`), and a
curated summary of what the threads have taught, newer than the plan wherever they disagree.
Each worker writes its own section to `thread-<N>-<label>.md` in the same directory of its own
branch, so no two writers ever share a file.

**`<YYYYMMDD-sprint_name>-resolutions.md`** -- yours too, begun at the first ruling: every
matter the Coach resolved, the full question and the full reply (§3, *Carry each ruling back*).
It is mirrored like the other files.

Commit both (`plan:`), push the sprint branch, and file it at once as a **draft** PR against
`main` (documents only, a `plan:` title): the *sprint PR*. It is yours, and you commit to it
freely as the sprint runs. Each thread commits its own `thread-<N>-<label>.md` and `human/` entry
on its own branch as it goes; the sprint PR holds only the files no thread writes -- the plan,
the progress document, the sprint's `human/` entry, any input you copied in. So it never
conflicts with a thread, and since nothing is cut from it, its commits never force a restack. It
joins the line last, on top (§5).

**The sprint doc** -- a live remote mirror, so the Coach can watch from any device. When the
Claude Docs tools are in the session, load the live guide before your first docs call
(`guide( items = ["topic.index", "topic.tabs"] )`: that surface moves quickly; work from what it
says today), then birth one doc named for the sprint with a *Plan* tab and a *Progress* tab, and
hand the Coach its link once in chat. The worktree's files live on a branch the Coach's checkout
is not on, so the doc is where they usually read: **every file in the sprint's whiteboard
directory is mirrored in full** -- a *Plan* tab, a *Progress* tab, one tab for any preplan or
other input you copied in, and **one tab per thread** (not per worker: a resumed or replaced
worker still writes the same thread file) holding that thread's `thread-<N>-<label>.md`, read
from the thread's branch, with the thread's own `human/` entry, if it wrote one, below it under
its own heading. A sprint-level `human/` entry gets a tab of its own. You are the doc's only
writer; workers never touch it, so parallel threads never race for it and a background worker
needs no Docs tools. Mirror at milestones and when idle, not after every edit: the *Plan* and
*Progress* tabs when you first write them; a thread's tab when the thread is `ready` and again
when it files, with *Progress* beside it; everything at a pause and at wrap-up; and, while you
wait on workers with nothing else to do, any tab whose file has changed since its last mirror.
Mirror a tab whole -- the whole text, not a summary. The repo files stay the source of truth: write the file first, mirror it after. No
Docs tools in the session: skip the mirror, say so in one line, and carry on.

Post a short plan summary in chat -- threads, which run together and which wait, look-ahead
calls -- and proceed. Do not wait for approval unless planning surfaced a *significant*
question (one whose answer would change what gets built); that, ask now, before spawning
anything.

## 2. Run the threads

Keep a **frontier**: every thread whose base exists (§1), not yet started. Start frontier
threads, lowest number first, while fewer than the cap are underway; refill as threads file.
Each thread runs three steps.

**Cut and build.** Cut its worktree, `../byok-<label>` (PROCESS.md, *A worktree per thread*),
from the base §1 gives it, and record that base for the reviewer:
`git -C <root> config branch.<branch>.sprintbase <base-sha>`. Never use the Agent tool's
`isolation: "worktree"` instead. Spawn one `thread-worker` with `run_in_background: true` (and
the plan's `model`, if it names one), so threads run side by side and you hear of each as it
finishes. The prompt is the whole handoff:

```
Thread <N> of sprint <sprint_name>. Sprint directory: <sprint root>/whiteboard/<YYYYMMDD-sprint_name>/.
Your worktree: <root>, on branch <branch>, cut from <origin/main | thread M's branch, PR #M> at <base-sha>.
Begin every shell command with `cd <root> && `. Mode: <normal | YOLO: prefer your recorded best
judgment over blocking on minor calls>.
Read <sprint_name>-plan.md and <sprint_name>-progress.md before touching code, then build
this thread per your agent definition, in a draft PR from its first push, and report `ready`
when it is built, committed and pushed, with the PR out of draft.
Your scratch files go in <scratchpad>/<label>/.

<the thread's text, verbatim>

Look-ahead from the orchestrator: <what later threads need from this one, if anything>.
```

The thread that owns `.size-limit.json` (§1, *Size budgets*) raises the budgets to cover the
sprint's sum; every other worker leaves them alone, and a worker whose thread would overshoot
what it was given says so in its report, for you to carry to the plan, rather than editing the
file. The late thread that lowers the budgets to the rule is the one exception, and it is yours to
plan: its text says to re-derive each budget from `pnpm size` by PROCESS.md's *Size budgets*, and
a lowering never goes below the rule's round number.

Every agent you spawn shares this session's scratchpad, so give each thread a subdirectory of
its own there. A background worker that reports its tools refused (a permission it could not
ask for) is re-run in the foreground, alone.

**Review.** When the worker reports `ready`, spawn one `thread-reviewer` (in the background)
unless the review level is `none` or the thread's diff holds no code (documents only), in which
case say so in the relay and go straight to filing:

```
Review of thread <N> of sprint <sprint_name>. Sprint directory: <sprint root>/whiteboard/<YYYYMMDD-sprint_name>/.
Worktree: <root>; begin every shell command with `cd <root> && `. Branch: <branch>. Review level: <level>.
Review the thread's own commits, <base-sha>...<tip-sha>, per your agent definition. /code-review
runs in the main checkout, not your worktree: never pass it --fix, and verify each finding
against the worktree's files. When you invoke it, tell it explicitly that it must not run git
checkout, git switch, git stash, git reset or anything that changes the main checkout; it reads
the thread only through the two SHAs or the worktree; if the skill changes the main checkout
anyway, report `bailed`. Say what you could not check, and why, rather than working round it.
```

The tip is `git -C <root> rev-parse HEAD`; the base is the `sprintbase` you recorded. The
reviewer commits the fixes it can stand behind in the worktree, and reports; anything it may not
decide comes back `flagged` for §4.

**File.** Resume the worker (SendMessage, same agent, so its context survives) with "File it",
and anything from the review it should know. It catches up, proves the branch, pushes the
review's fixes to its PR, removes its worktree, and reports `filed` with the PR number, or
`blocked`. Then post the reviewer's PR comment (`gh pr comment <n>`, the text from its report),
so the review sits on the PR. A thread stacked on this one may now be cut.

A `blocked` or `abandoned` worker gets no review: the review is of a finished thread, and
follows the resume that finishes it.

## 3. As each report comes in

1. **Verify, cheaply.** For `ready`: the worker's commits are in its worktree
   (`git -C <root> log --oneline -5`), its tree is clean, and its PR is out of draft
   (`gh pr view <branch> --json isDraft`). For `filed`: `gh pr view <n>` exists and names the
   branch. Trust the reports for the rest -- do not re-review the diff.
2. **Relay, whole.** Put the report in chat verbatim -- the Coach reads the entire bolus, not a
   précis -- under one lead line of your own (thread, verdict, PR link when there is one).
   **Cycle its open matters to the Coach.** Every worker and reviewer report ends with an *Open
   matters* list. When the sprint keeps an *Open Matters* tab (`/turbochat`), each new item
   becomes a `drafting` row in the same pass as the relay -- the minor leftovers of one report
   may share a row when they share a recommendation -- tagged with where it was raised (`#N`,
   thread N), so its ruling can be carried back. An item you leave out, say why in the relay.
   Nothing open is left only in chat.
3. **Tend the documents.** Keep the status table and status lines current, and revise later
   threads' glosses where a thread's discoveries changed them. When a thread files, add a
   `*Review:*` line under its entry from the reviewer's report -- what it fixed, and each
   finding it left with its disposition -- so later workers inherit it. Workers may pull a later
   thread's work forward when it comes naturally, declaring it: strike what was pulled forward
   from the later thread's text, so it is not asked for twice. Beyond that bookkeeping, curate:
   condense what later threads no longer need, hoist a buried finding to where its reader will
   look, and spin an outgrown block into a file of its own in the sprint directory, with a line
   on who should read it. Keep the progress document under about 5,000 words: every later
   worker reads it whole. Mark what you add with `*Orchestrator:*`; never edit a worker's
   thread file. Commit (`plan:`) and push to the sprint PR; mirror at the milestones §1 names.
4. **Carry each ruling back.** When the Coach resolves a matter (a chat answer, or a row flipped
   to `proceed`), do three things beside acting on it:
   - **The resolutions file**: append to `<YYYYMMDD-sprint_name>-resolutions.md` in the sprint
     directory the question in full, as it was put, and the Coach's reply in full, word for word,
     with where it was raised and where the work went; newest batch first.
   - **Beside the question**: a one-line restatement, `→ *Coach (YYYY-MM-DD):* <the ruling>`,
     wherever the question stands -- the PR description, the thread file, the `human/` entry.
     A live worker does it on its branch when you relay the ruling; for a filed thread whose
     worker is gone, edit the PR description yourself (`gh pr edit`), and note the thread file and
     `human/` lines as owed in the progress document, to be added at the restack (the one edit
     you make to a worker's file).
   - **The plan**: one line in its *Coach rulings* list.
5. **Decide** (§4), refill the frontier, and wait for the next report. If the Coach has
   interjected in chat meanwhile, fold their guidance in first.

## 4. Continue, resume, or stop

Default rules, absent other guidance:

* **Continue** past a `filed` thread with a `clean` or `fixed` review. Minor questions, and
  minor findings the reviewer left, ride along in the PR and the documents.
* **A `flagged` review** -- a significant finding the reviewer may not act on -- is handled like
  a worker's blocking question. If the fix is a two-way door and you are in YOLO, resume the
  worker with the finding as a directive; it builds on the branch as it now stands, reviewer's
  commits and all, and reports `ready` again. Then spawn a second reviewer over the new commits
  only (`<tip the first reviewer left>...<the new tip>`). Never a third: what is still open after
  that is the Coach's. Otherwise the finding is the Coach's: the thread waits, unfiled, in its
  worktree, and you post the reviewer's comment on its PR so the Coach sees why.
* **Resume** a `blocked` worker when you can supply what it lacks: an answer the plan or
  progress document already holds, or -- in YOLO -- a judgment call you can make and record. A
  rebase conflict that takes judgment about which behaviour wins is the Coach's.
* **Pause the sprint** -- start no new threads, let those underway reach their next report and
  hold them there, report in chat, update the status lines and the sprint doc, write
  `human/YYYYMMDD-sprint_<name>_paused.md` in the sprint worktree saying exactly where things
  stand (which threads filed, which wait in which worktree, and why), commit and push, and end
  your turn -- when:
  - a worker is `blocked` on a significant question you may not answer;
  - `pnpm justify` is red and the worker could not repair it;
  - a guardrail conflicts with the work (say so and propose the alternative, per CLAUDE.md;
    never route around it);
  - a worktree or a branch is in a state neither you nor the reports explain (a `bailed`
    reviewer is this case);
  - a thread's outcome invalidates other threads' premises. A stopped thread holds back the
    threads stacked on it; independent threads may carry on.
* **Every remaining thread waits on a merge**: that is a pause too, naming the PRs the Coach
  would merge to free them.
* **Stopping is cheap** outside YOLO: every thread's work is pushed to its PR; unfiled work also
  waits in its worktree; a paused sprint resumes where it stood. When unsure, pause.

**YOLO** (the Coach says so, usually at the invocation): be more reluctant to pause, not more
willing to gamble. Answer judgment calls a competent Coach would consider two-way doors, record
each prominently (the plan's *Decisions taken in YOLO* list, the chat relay, and the sprint's
`human/` entry), and keep going. Still pause for anything destructive or hard to reverse,
anything touching `main` or a release, a guardrail break, or a one-way design call: the stored
format and the public surface are contracts (CLAUDE.md, *What the package promises*). YOLO never
means merging a PR.

## 5. Wrap up

When the last thread files (or the sprint pauses for good):

1. **Restack** the filed threads into one line on `origin/main`. A stack the threads already
   form keeps its order; peers go biggest and messiest first, so the large changes merge first
   and the small ones adapt. In a worktree of your own (a name no other session uses), rebase
   each branch onto the one below with `--no-update-refs`. A conflict goes back to that
   thread's worker (resumed, with the new base), which resolves it, proves it, and pushes. When
   every rebase is clean, run `pnpm justify` (and `pnpm size`) once, at the top, and let CI
   check the middle. Push each branch with a lease on the SHA it replaces
   (`--force-with-lease=<branch>:<old sha>`), and rewrite each PR's first line to "Stacked on
   #N, in the line main → #A → #B → …". Check the bottom stands on today's `origin/main`, not on
   an unmerged PR whose commits `main` already holds under other SHAs.
   As you restack each branch, add the restatement lines the progress document lists as owed to
   its thread file and `human/` entry (§3, *Carry each ruling back*), in one `plan:` commit on
   that branch.
2. **Close the sprint PR.** Set both documents' status lines; add
   `human/YYYYMMDD-sprint_<name>_done.md` -- the sprint in a paragraph, the PRs in merge order
   with their "Stacked on" notes, YOLO decisions if any, and the open questions gathered in one
   place (what the Coach resolved stays in the resolutions file: point to it); commit. Tag the tip and push the tag (`sprint/YYYYMMDD-<name>`), so its history stays
   on GitHub. Then squash the sprint branch into one commit on top of the line, push it with a
   lease, and take the PR out of draft (`gh pr ready`). It is the line's top: merging it merges
   everything.
3. **Mirror** every tab a last time, `git worktree remove` your worktrees, and give the Coach
   the closing summary in chat, leading with what shipped, what the reviews fixed and left, and
   what needs their word, with the PRs in merge order and the top named. Never merge
   anything.
