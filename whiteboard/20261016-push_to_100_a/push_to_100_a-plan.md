# Sprint push_to_100_a -- plan

* **Date**: 2026-10-16
* **Mode**: YOLO
* **Review level**: medium
* **Threads at once**: 3
* **Issued by**: the Coach (flip), via `/sprint ... YOLO mode!!! /turbochat`, on the preplan the
  Coach and Fable wrote together (`20261016-push_to_100_a-preplan.md`, beside this file). The
  Coach: reason independently, and evolve the plan on what the threads discover.
* **Sprint PR**: [#125](https://github.com/mrflip/safebyok/pull/125)
* **Sprint doc**: https://claude.ai/code/artifact/12453adc-57ea-4c47-9a4a-1425a670bb98 --
  *Open Matters* is its first tab
* **Status**: threads 1, 3, 6 and 5a underway

## Read first

Beyond CLAUDE.md, STYLE.md, VOCABULARY.md and PROCESS.md, every worker reads:

1. **The preplan**, `20261016-push_to_100_a-preplan.md` in this directory, whole: *The rule this
   sprint is cut by*, *Rulings these rest on* (the Coach's rulings: do not re-litigate them),
   *Ground rules for every thread*, and the section for your thread. Your thread's text in this
   plan points there and does not repeat it.
2. **The matters snapshot**, `matters/` in this directory: every tab of the Gripefest matters doc
   (https://claude.ai/code/artifact/db860eaa-e42b-4b34-99e0-bb9b68256f9c), exported 2026-10-16
   before any sweep. Each `G###` your thread closes is a row there with the Coach's answer; read
   each one before building it. `whiteboard/20261016-gripes_boogaloo/gripes-list.md` has the
   one-line form.
3. **Threads 1 to 5**: `matters/01-strawman.md`, Fable's strawman (principles P1 to P12, the
   *Validation: four jobs, six moments* table, *Names and keys, derived*, *Races and corrupt
   records, derived*). The preplan cites it throughout.
4. **This sprint's progress document**, `push_to_100_a-progress.md`, which is newer than this
   plan wherever they disagree.

## Ground rules

* **Two-way doors only** (the preplan's first rule). A change that is not -- a new runtime
  dependency, anything published or paid for -- is reported, not made.
* **Changesets bump `minor`** for anything touching a stored shape or an exported name (G435);
  `patch` otherwise; `--empty` for tooling and docs.
* **Rows are swept by the orchestrator**, not by workers. When your thread files, the
  orchestrator removes the rows it closed from the Gripefest doc. So your thread file must say,
  for every `G###` in your thread's *Closes* list, **closed** (and where it settled: code, a doc
  block, a note) or **not closed** (and why). A row you leave open stays in the doc.
* **Size budgets**: thread 1 owns `.size-limit.json` (below). No other thread edits an existing
  line in it. A thread cut from `main` before thread 1 lands may see `pnpm size` over main's
  budget in CI: say so in the PR and the report, with the measure; the restack puts thread 1
  under it. Thread 8 appends new entries at the end of the file only; thread 9 lowers them all.
* **`notes/security.md` and `notes/wontfix.md`** are append-mostly files many threads touch:
  add your entries at the end of the list, dated, to keep restack conflicts mechanical.
* **Overlaps**: `vault.ts` is rewritten by threads 1 (the bag argument), 3, 4, 5, 6, 10 and 13;
  `safebyok-react` by 3 (a rename), 4 (`VaultProvider`'s reopen) and 7. The stacks below keep
  the heavy overlaps serial; the rest meet at the restack, where the later thread's worker
  resolves them.

## Size budgets

Measured on `main` (`f63bd915`), bytes, against today's limits; the sprint's growth is a guess.

| Bundle | Measure | Limit now | Guess after | Thread 1 sets |
|---|---|---|---|---|
| everything | 30_625 | 34 kB | ~36 kB | **40 kB** |
| openVault | 21_794 | 23 kB | ~26.5 kB (3, 4, 5, 6, 10 grow `vault.ts`; 5 grows `VaultDB`) | **30 kB** |
| argon2idWebV1Deriver | 5_002 | 8.1 kB | ~5.3 kB (6's checks) | **9 kB** |
| idbDeviceDB | 9_034 | 13 kB | ~10 kB (3's conditional write, 1's joiner) | **15 kB** |
| browserOpts | 13_949 | 18 kB | ~16 kB | **20 kB** |
| stableJsonify, mask, validators, DefaultValidators, fastkey's two | -- | as is | same or smaller | unchanged |

Thread 8 appends `safebyok-indexeddb`'s entry (G269) and, if the React package has none, one for
`safebyok-react`, each at the rule on its own measure. Thread 9 re-derives every line from
`pnpm size` by PROCESS.md, *Size budgets* (G520), never below the rule's round number.

## The line

Bases and the planned merge order. "On N" is cut from thread N's tip once N has filed.

* **From `main`, independent**: 1, 3, 6, 7, 8, 11.
* **2** on 1. **4** on 3.
* **5** on 1 and 4: once 1, 2, 3 and 4 have filed, the orchestrator restacks 3 and 4 onto 2, so
  the code stack reads main -> 1 -> 2 -> 3 -> 4, and 5, 10 and 13 are cut from 4's restacked tip.
* **5 is two steps**: 5a, the design (`store-base-design.md` in this directory), written early by
  a design agent and committed here by the orchestrator; 5b, the build, which waits on the
  Coach's word on the design (a row in the sprint doc's *Open Matters*). If the rest of the
  sprint is done and the row is unanswered, the sprint pauses on it.
* **12** is time-gated: `convex-test@0.0.61` ages at 2026-10-16T23:01Z (`notes/security.md`); it
  starts after that, on top of the line.
* **9** goes last before 12, on top of the line.

Planned merge order: main -> 1 -> 2 -> 3 -> 4 -> 13 -> 10 -> 5 -> 6 -> 7 -> 8 -> 11 -> 9 -> 12
-> the sprint PR.

## The threads

Each thread's Coach text is its section in the preplan, verbatim (`### N.`); the worker's
handoff carries it whole. Below, the orchestrator's gloss.

### 1. `names_and_keys` -- strict names, `^`-joined keys, validators deposited once

* **Touches**: `validators.ts`, `vault-db.ts` (`bindValidators`, the nine verbs lose the bag),
  `ckeys.ts`, every adapter's `do*` hook signature, `safebyok-indexeddb/src/ckeys.ts`, the device
  shelves, VAULTDB.md, `.size-limit.json`.
* **Model**: opus. **Depends on**: nothing.
* **Size**: owns `.size-limit.json`: set the five lines in *Size budgets* above, in its first
  commit, and touch nothing else in that file.
* **Look-ahead**: 2 stacks on it (rewrites `validators.ts`' note slot and the adapters' schemas);
  5's base class inherits `bindValidators` and the delimiter checks, so put them where a base
  class can own them later (on `VaultDB`, not repeated per adapter). 13 adds a term to each
  adapter's write: keep the adapters' write paths legible.

### 2. `public_bag` -- drop `note`, add the bound `public` bag, reserve the two codec fields

* **Touches**: `types.ts`, `vault.ts` (`boxBinding`, `store()`), `crypto.ts`, every adapter's
  schema/columns/SDL, the battery, the React demo, VOCABULARY.md. A crypto binding change: the
  reviewer looks hard at it.
* **Model**: opus. **Depends on**: 1.
* **Look-ahead**: the format-snapshot test (G482) is its first commit; every later thread that
  changes a stored shape (3's `DeviceMark`) must bump the format it guards -- 3 is cut from main
  without it, so the restack onto 2 will show whether 3's bump was made (3 bumps it anyway).

### 3. `locks_and_expiry` -- the soft lock as ruled, versioned device erase, `Millis`

* **Touches**: `vault.ts` (`shutAfter`, `ensureUnlocked`, `takeUpUnlock`, `changePassphrase`,
  `rememberedUnlock`), `types.ts`, `device-db.ts`, `idb.ts`, `safebyok-react` (the rename), the
  README, `notes/wontfix.md` (new), `notes/security.md`.
* **Model**: opus. **Depends on**: nothing.
* **Look-ahead**: 4 stacks on it and rewrites `refresh`/`store`/`destroy` in the same file. 6
  changes `changePassphrase` to take any proof (G072): keep the renewal in one place a proof of
  any kind passes through, so 6 adds a proof kind without re-plumbing the window. G119 and
  G516's first bullet are **not** in this thread unless the Coach flips their row in the sprint
  doc (then they become a thread on top of 4).

### 4. `refusals_and_catchup` -- one catch-up before a kind is named, damage quarantined

* **Touches**: `vault.ts`, `vault-db.ts`, `errors.ts` (`newer_format`), `types.ts` (`syncing`,
  `DamagedLockbox.revision_id`), `safebyok-react` (`VaultProvider`: G333), VAULTDB.md, READMEs.
* **Model**: opus. **Depends on**: 3.
* **Look-ahead**: 5 builds the base class on its `vault-db.ts`; 10 and 13 are cut from it. 7
  adds the G333 test against the provider this thread changes.

### 5. `store_base` -- the base class, the logger everywhere, and the adapters' leftovers

* **5a, design**: a design agent writes `store-base-design.md` from `main` and this plan (aware
  of what 1 and 4 change); the orchestrator commits it here, mirrors it to the sprint doc, and
  opens a row for the Coach. Started at once.
* **5b, build**: a thread-worker on 4's restacked tip, adapter by adapter, the battery green at
  each, once the Coach's row says proceed.
* **Model**: opus. **Depends on**: 1 and 4, and the Coach's word on 5a.
* **Look-ahead**: 9 moves test helpers into `safebyok/testing` (G380): leave shared helpers
  where 9 can find them.

### 6. `crypto_small` -- refusals with a kind, the KDF tidy-ups, two ways-in verbs

* **Touches**: `envelope.ts`, `key-deriver.ts`, the ways-in half of `vault.ts`
  (`changePassphrase`, `UnlockSummary`), `notes/security.md`.
* **Model**: sonnet; the opus reviewer looks hard at G031 (the `KeyDeriver` split, an exported
  type) and G072. **Depends on**: nothing (cut from main; meets 3's `changePassphrase` at the
  restack).
* **Look-ahead**: G031 splits an exported type before 1.0: 5 and 10 read the deriver's
  label/algorithm; keep the old field names where the split allows.

### 7. `react_tidy` -- the dialog's words, its races, and the demo

* **Touches**: `safebyok-react/src/` (a new `messages.ts`, the dialogs, `VaultProvider`), the
  React README, `demos/`. Also the entry-field items of `whiteboard/20261015-push_to_100/`.
* **Model**: opus (the dialog keying and the provider are the risk). **Depends on**: nothing
  (cut from main; meets 3's rename and 4's `VaultProvider` change at the restack).
* **Notes**: the `@formatjs/intl-relativetimeformat` polyfill is **not** added as a dependency:
  wire the presence check and name it in the README (the Coach's yes is an open row). The
  far-future rule is 3's (`>= FarFuture - MinuteMillis`): use it with a local constant if 3 has
  not landed, and say so. There is no `safebyok-react` size-limit entry today: report the
  measure, and thread 8 adds the line. The note's password-manager ignore attributes are
  exported from `safebyok/utils` beside `mask` (framework-neutral; no new package), and the
  React field spreads them; the whisper field takes a host `placeholder`, none by default (both
  defaults of open rows in the sprint doc).

### 8. `ci_release` -- the release workflow's ruled changes and the CI leftovers

* **Touches**: `.github/workflows/`, `scripts/` (and `tests/scripts/`), PROCESS.md, `package.json`
  scripts, `eslint.config.mjs` files, READMEs' platform lines, a new `notes/release-checklist.md`.
* **Model**: sonnet. **Depends on**: nothing.
* **Size**: appends `safebyok-indexeddb`'s entry, and `safebyok-react`'s if none exists, at the
  end of `.size-limit.json`; edits no existing line (thread 1 owns those).
* **Look-ahead**: `pnpm size` folds into `justify` (G404): every thread after it in the line
  justifies with size, so its budgets must be thread 1's. 11 adds a CI job beside the ones this
  thread edits in `ci.yml`.

### 9. `sweep_small` -- the small tab, last, on top of the line

* **Model**: sonnet. **Depends on**: the top of the line (every other filed thread but 12).
* **Look-ahead**: lowers every size budget to the rule (G520), last.

### 10. `secure_floor` -- the Coach's three Soonish lines

* **Touches**: `vault.ts` (`openVault`'s secure-context check, the strength test), `errors.ts`
  (`insecure_context`, `weak_passphrase`), `safebyok/browser`, the React README.
* **Model**: opus (it now adds a runtime dependency and an exported option). **Depends on**: 4.
* **Changed by the Coach's ruling** (*Coach rulings during the sprint*): in place of the
  preplan's `minPassphraseChars` alone, `openVault({ passphraseStrengthTest })`, a host callback
  run at `create`, `addPassphrase` and `changePassphrase` (never at `unlock`), refusing
  `weak_passphrase` with the callback's reason; the default in core is the NIST length floor (12
  characters, no composition rules). `safebyok/browser` exports a zxcvbn-backed test built on
  `@zxcvbn-ts/core` (the Coach's yes), as its own named export so an app that does not import it
  does not bundle it, and **not** folded into `browserOpts` unless its measure is small: the
  dictionaries are large, so measure first and say what each choice costs. Check the release is
  over seven days old (PROCESS.md, *Dependencies*). Its size-limit line is appended at the end of
  `.size-limit.json`. No meter UI anywhere.
* **Note**: the three Soonish lines become rows the orchestrator sweeps; the worker writes their
  settlement in its thread file.

### 11. `pg_container` -- the Postgres battery under real concurrency

* **Touches**: `e2e/`, a compose file, `.github/workflows/ci.yml` (a new job).
* **Model**: sonnet. **Depends on**: nothing.
* **Note**: Docker may not be available in the worker's container; the CI job is the proof. If
  it cannot be run locally, the worker says so, and the PR's CI run is the check.

### 12. `floors_forward` -- time-gated, after 2026-10-17

* **Model**: sonnet. **Depends on**: the top of the line, and the clock: starts after
  2026-10-16T23:01Z.

### 13. `epoch_expectation` -- VAULTDB.md 3.8 in every adapter

* **Touches**: `safebyok-indexeddb`, `safebyok-convex`'s component, `safebyok-postgres`,
  `safebyok-graphql`'s recipe and README, the battery flag.
* **Model**: opus. **Depends on**: 4.

## Coach rulings during the sprint

From the sprint doc's *Open Matters*, as rows are swept:

* **`user_id` characters** (thread 1): yes, letters, digits and `-_.:@+|`, 1 to 100.
* **Standard Schema** (G497): stays NOT YET.
* **The adapters' logger option** (thread 5): `logger`, in every adapter.
* **A hint on the whisper field** (thread 7): yes, a host `placeholder`, none by default. And a
  new NOTYET: "Option to let the user add a hint on their passphrase".
* **Password strength** (thread 10), the Coach's words: "The 'don't let customers shoot
  themselves in the foot' rule says we should not offer a bullshit password meter. Add a
  pluggable callback `passphraseStrengthTest()` to the entry point. Have `safebyok/browser`
  export `@zxcvbn-ts/core` as a tree-shakeable default." This is the Coach's yes to
  `@zxcvbn-ts/core` as a runtime dependency of `safebyok` (thread 10's gloss has the shape). And a
  new NOTYET: "Break out dependencies, including -fastkey, into a -utils or -bestpractices
  package".

## Decisions taken in YOLO

1. **Rows are swept by the orchestrator at filing**, through a subagent, one sweep at a time, not
   by workers: parallel workers would race on the same doc tabs, and a row is removed only once
   its PR is filed. A PR the Coach rejects brings its rows back from the doc's history.
2. **The sprint doc is a new doc**, *Open Matters* first, for the questions this sprint opens;
   the Gripefest doc keeps its rows, and is only swept.
3. **The matters are snapshotted to `matters/`** before any sweep, so workers read rows (and the
   Coach's answers) without Docs tools, and swept rows stay readable.
4. **5 splits**: the design starts now; the build waits on the Coach's row (the preplan's "the
   Coach reads it before (b)").
5. **Thread 7 runs on opus**, not the preplan's sonnet-and-opus mix: one worker, and the
   provider's keying is the risk.
6. **6 and 7 are cut from main** despite overlapping 3 and 4 in `vault.ts` and the React
   provider; their workers resolve at the restack. Serializing them would idle two slots for
   hours.

## For the Coach

* **The opened questions** are rows in the sprint doc's *Open Matters* tab, each with a default
  the threads build to: `user_id`'s charset (1), the Standard Schema landing (1), the adapters'
  logger option name (5), the `Intl.RelativeTimeFormat` polyfill dependency and the "hint"
  question (7), a strength library (10), which suites run against the Postgres container (11).
* **5b waits on your word** on `store-base-design.md` (a row in *Open Matters*).
* **G119 and G516's first bullet**: the preplan's *Your word first*. A `proceed` on their row
  adds a small thread on top of 4.
* The preplan's *Only your hands*, *Real devices*, *Design first* and *NOT YET* lists stand as
  written there; nothing in this sprint touches them.
