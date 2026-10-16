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
* **Status**: handing over to a fresh session (the Coach's word, near the session limit): read
  *Resume here*, below, first. 5b in progress or ready (see *Resume here*); 15 (#138) flagged, waiting on the
  Coach; the line main → 1 (#128) → 2 (#133) → 3 (#127) → 4 (#132) → 13 (#137) → 10 (#136) is
  restacked; 6 (#126), 7 (#129), 8 (#130), 11 (#131), 14 (#134) filed, restack before 16; then
  16 and 17 (new, the fifth batch of rulings), 9, and 12 after 23:01Z

## Resume here (for a fresh session)

The sprint ran in one session until near its limit; the Coach restarts `/sprint` in a fresh one
(YOLO, `/turbochat`), which picks up from this section. Everything else in this file stands.

* **Worktrees**: this sprint's own, `/workspace/byok-push_to_100_a` (branch
  `20261016-push_to_100_a`, the sprint PR [#125](https://github.com/mrflip/safebyok/pull/125)).
  `/workspace/byok-store_base` (5b, `20261016-store_base`, cut from 10's restacked tip `8439aa01`,
  sprintbase set). `/workspace/byok-deriver_shim` (15, `20261016-deriver_shim`, unfiled at
  `46674a7b`, sprintbase `adc94772`). No other sprint worktrees exist. The main checkout
  (`/workspace/byok`) is the Coach's: never write to it.
* **5b** (`store_base`; its PR: `gh pr list -R mrflip/safebyok --head 20261016-store_base`):
  asked, as the session closed, to commit and push at its next green point, open its draft PR,
  and bring `thread-5b-store_base.md` up to date. If it reported `ready`: verify, spawn its
  reviewer over `8439aa01...<tip>`, then "File it" through a fresh `thread-worker` reading the
  thread file, post the review comment, sweep its 34 Gripefest rows, one row per open matter. If
  it reported `checkpoint` (or nothing): read its thread file and `git -C` its log and status, and
  resume it with a fresh `thread-worker` in the same worktree. The progress file's status table
  says which.
* **15** ([#138](https://github.com/mrflip/safebyok/pull/138)) waits on the Coach's row "An
  overridden deriveKeyBytes skips the 32-byte check": the reviewer's fix (`keyBytesOf`, both
  callers, a test) was refused by the permission check, so it may not be routed to another agent
  without the Coach's yes. On yes: a fresh `thread-worker` in `/workspace/byok-deriver_shim`
  applies it, then a second review over the new commits only, then "File it".
* **G138**: the Gripefest sweep of row `.34138` (Vault core tab) was refused by the permission
  check; it waits on the Coach (they delete it, or allow the write).
* **Next, in order**: (1) 5b, as above; (2) restack 5 → 6 → 15 → 7 → 14 → 8 → 11 onto 10's tip
  (§5.1, with the owed lines in `restack-owed-rulings.md`, and the restack notes in progress's
  *Notes*), each conflict back to a fresh worker of that thread; if 15 still waits, it goes to
  the line's top later instead; (3) threads 16 and 17 from the line's top, side by side, then
  restack 17 onto 16; (4) thread 9 on top; (5) thread 12 after 2026-10-16T23:01Z; (6) wrap-up §5.
* **Owed by the orchestrator**: the fifth batch's `→ *Coach (2026-10-16):*` lines in the PR bodies
  ([#131](https://github.com/mrflip/safebyok/pull/131),
  [#132](https://github.com/mrflip/safebyok/pull/132),
  [#133](https://github.com/mrflip/safebyok/pull/133),
  [#134](https://github.com/mrflip/safebyok/pull/134),
  [#136](https://github.com/mrflip/safebyok/pull/136),
  [#137](https://github.com/mrflip/safebyok/pull/137)) were not yet written when the session
  ended: `restack-owed-rulings.md` lists them; the resolutions file has each in full. The doc
  mirror of Plan, Progress and Resolutions is behind (the sprint doc's *Open Matters* is current).
* **The sprint doc**: https://claude.ai/code/artifact/12453adc-57ea-4c47-9a4a-1425a670bb98, Open
  Matters node `d50b4c27-347b`, matters table `mnkssgs7kk7.647`, state enum `a4555458-a970`
  (0 drafting, 1 proceed, 2 explain, 3 elevate, 4 noted). Read it `sinceRev` the last rev in the
  resolutions file's newest heading. The Gripefest doc
  (https://claude.ai/code/artifact/db860eaa-e42b-4b34-99e0-bb9b68256f9c) holds 126 matters; sweeps
  go one at a time through a subagent.
* **Standing rules from the Coach this sprint**: one row per matter, never rolled up; each
  ruling restated beside its question (PR body, thread file, `human/`) and in full in the
  resolutions file; a tool permission refusal goes to the Coach, never to another agent.

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
* **15** on 6. In the merge order it follows 6.
* **5 is two steps**: 5a, the design (`store-base-design.md` in this directory), written early by
  a design agent and committed here by the orchestrator; 5b, the build, which waits on the
  Coach's word on the design (a row in the sprint doc's *Open Matters*). If the rest of the
  sprint is done and the row is unanswered, the sprint pauses on it.
* **12** is time-gated: `convex-test@0.0.61` ages at 2026-10-16T23:01Z (`notes/security.md`); it
  starts after that, on top of the line.
* **9** goes last before 12, on top of the line.

Planned merge order: main -> 1 -> 2 -> 3 -> 4 -> 13 -> 10 -> 5 -> 6 -> 15 -> 7 -> 14 -> 8 -> 11 -> 16 -> 17
-> 9 -> 12 -> the sprint PR. **16** and **17** (the fifth batch of rulings) are cut from the line's
top once 5 through 11 are restacked onto it; 17 restacks onto 16 when both file. If 15 still
waits on the Coach then, it moves to just below 9.

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
* **Changed by the Coach's ruling** (the joiner row): no host-chosen join, split or delimiter.
  `^` is fixed; `ckeyDelimiter` goes from every surface. `^` joins the name floor for every
  adapter (YOLO 7). Rebuilt after its first review; a second reviewer covers the new commits.

### 2. `public_bag` -- drop `note`, add the bound `public` bag, reserve the two codec fields

* **Touches**: `types.ts`, `vault.ts` (`boxBinding`, `store()`), `crypto.ts`, every adapter's
  schema/columns/SDL, the battery, the React demo, VOCABULARY.md. A crypto binding change: the
  reviewer looks hard at it.
* **Model**: opus. **Depends on**: 1.
* **Look-ahead**: the format-snapshot test (G482) is its first commit; every later thread that
  changes a stored shape (3's `DeviceMark`) must bump the format it guards -- 3 is cut from main
  without it, so the restack onto 2 will show whether 3's bump was made (3 bumps it anyway).
* *Review* (`flagged` twice, #133): the first review fixed `store()`'s doc (`67244e8d`) and
  flagged two findings, sent back in YOLO 12: a tampered bag was resealed by the next store
  (now carried forward only from a record that deciphers), and a deep bag made `openVault` throw
  a bare `RangeError` (the record check now demands canonical text). The second review confirmed
  both and flagged the depth band below the check (a bag or whisper ~3,000-6,000 deep still
  reaches a bare `RangeError` in `store()` and `lockSoon`): filed for the Coach (YOLO 15), a row
  asking a ~64-level cap before #133 merges, built in thread 9 if yes. Rows also: `lockSoon`
  erasing first, `Lockbox` in its own module (2 kB off two budgets), `__proto__` keys, unknown
  `store()` options, `cipherBinding`'s guard. Filed at `c397b745`.

### 3. `locks_and_expiry` -- the soft lock as ruled, versioned device erase, `Millis`

* **Touches**: `vault.ts` (`shutAfter`, `ensureUnlocked`, `takeUpUnlock`, `changePassphrase`,
  `rememberedUnlock`), `types.ts`, `device-db.ts`, `idb.ts`, `safebyok-react` (the rename), the
  README, `notes/wontfix.md` (new), `notes/security.md`.
* **Model**: opus. **Depends on**: nothing.
* **Look-ahead**: 4 stacks on it and rewrites `refresh`/`store`/`destroy` in the same file. 6
  changes `changePassphrase` to take any proof (G072): keep the renewal in one place a proof of
  any kind passes through, so 6 adds a proof kind without re-plumbing the window. G119 and
  G516's first bullet went to thread 4 once the Coach ruled (see 4).

### 4. `refusals_and_catchup` -- one catch-up before a kind is named, damage quarantined

* **Touches**: `vault.ts`, `vault-db.ts`, `errors.ts` (`newer_format`), `types.ts` (`syncing`,
  `DamagedLockbox.revision_id`), VAULTDB.md, READMEs. ~~`safebyok-react` (`VaultProvider`:
  G333)~~ -- pulled forward by thread 7.
* **Added**: thread 3's review leftovers (1, 2, 3, 5, 6, 7 in the progress document). And four
  Coach rulings, sent mid-build: `lockSoon()` is a soft lock (an unlock under way finishes);
  `whenIdentityRevoked` goes whole ('stay' dropped, G119 part one); a `read()` refuses when a hard
  lock landed during its awaits (G119 part two); a refresh meeting `rolled_back` drops the key, one
  rule with `identity_revoked` in `refusal-policy.ts`, no knob (G516's first bullet).
* **Model**: opus. **Depends on**: 3.
* **Look-ahead**: 5 builds the base class on its `vault-db.ts`; 10 and 13 are cut from it. 7
  adds the G333 test against the provider this thread changes.

### 5. `store_base` -- the base class, the logger everywhere, and the adapters' leftovers

* **5a, design**: a design agent writes `store-base-design.md` from `main` and this plan (aware
  of what 1 and 4 change); the orchestrator commits it here, mirrors it to the sprint doc, and
  opens a row for the Coach. Started at once.
* **5b, build**: a thread-worker on 4's restacked tip, adapter by adapter, the battery green at
  each. **The Coach said proceed**, with comments in the design (the *Store base design* tab):
  - every adapter factory takes one options bag: `myDatabaseVaultDB({ ...options })`, e.g.
    `convexVaultDB({ client, api, logger })`, `localVaultDB({ store, logger })`;
  - `openVault` hands its logger to the adapter by default (an adapter's own `logger` wins). If
    that takes more than a little code, given the entry point plus a bag of options that most
    hosts fill from `safebyok/browser`, build what the design says and report it, and the
    orchestrator files a TODO;
  - `reportError` checked at call time stands; the Coach filed a TODO to review call-time work
    that could be composed once or memoized;
  - a second unsubscribe stays silent (the Coach asked whether it should warn; the answer is a
    row in *Open Matters*, default no);
  - no `bindValidators` (thread 1 built none: drop that part of the design); no ShelfVaultDB (a
    TODO).
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
* **Notes**: the `@formatjs/intl-relativetimeformat` polyfill is **not** added as a dependency,
  and, as the Coach ruled, there is no presence check: the README says how to guarantee it. The
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
* **Added, the Coach's ruling** ("yes fix in a later thread", on thread 11's review leftovers,
  #131): in `e2e/tests/postgres/`, retitle the all-at-once rounds and the REPEATABLE READ /
  SERIALIZABLE "writers made together" cases to what they prove (bounds and read-back, not the
  cap); make `untilStatementBlocked` wait for the write under test, not any lock wait (filter on
  the device's pid or its statement); give the `pg` pools and clients an `'error'` listener so a
  dropped server fails a test rather than crashing the run; publish the CI service on
  `127.0.0.1:5432:5432`; and add a CI step that fails when the image digest in `ci.yml` and in
  `e2e/compose.yaml` differ (Dependabot moves only the compose file's).
* **Added, the Coach's ruling** ("put as WONTFIX", on thread 14's Chrome autocomplete question,
  #134): an entry in `notes/wontfix.md` -- Chrome ignores `autocomplete="off"` on a password-type
  field, so the whisper field may still be offered a saved password; avoiding it would take a
  text field masked by the non-standard `-webkit-text-security`, which not every browser honours.

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
* **Added**: refuse an all-zero derived key as `bad_option` (G032; the Coach's yes): thread 6
  wipes the deriver's output after use, so a host deriver that caches it would hand back zeros.
* **Note**: the three Soonish lines become rows the orchestrator sweeps; the worker writes their
  settlement in its thread file.
* *Review* (`flagged`, then `fixed`, #136): the first review flagged that an inline
  `passphraseStrengthTest` arrow reopened the vault on every parent render; YOLO 13 sent it back
  (a ref plus one stable wrapper, four provider tests), and softened the all-zero check's
  constant-time claim. The second review fixed two doc lines (`cb7fb3ea`, `03a75dec`) and left
  three minors, each a row: a child's same-commit layout effect runs the previous test; the
  provider copies the core's not-a-function check; three provider test gaps. Left from the first:
  zxcvbn as hard dependencies (a row), whitespace in the length floor (a row), a host test's
  throw passes through (a row), the `userInputs` reason never fires (a row). Filed at `3c0a63a3`.

* **Added, the fifth batch of rulings (doc rev 7737)**, each in full in the resolutions file:
  * lower the room set aside per lockbox to 1,024 bytes, and report how many more lockboxes fit
    under the same limit (the Coach: not too many more);
  * `store()` refuses unknown option keys with `bad_option`, through one helper shared with
    `validators`' strict check if one serves both;
  * extend `cipherBinding`'s part guard to a top-level `undefined` or `null` part;
  * Lockbox and its canonical-text check in a file of their own, before the budgets are lowered;
  * a `notes/wontfix.md` entry: an own `__proto__` key in a bag or whisper is undefined
    behaviour, as `undefined` and functions are (no refusal);
  * the demo's WaysIn passphrase field in a form with a hidden username, read by ref at submit;
  * an inline `display: none` beside `hidden` on the dialog's username field;
  * delete the Postgres README's hard-cap recipe; in its place a very short prompt a host pastes
    to an agent, which reads the library and writes the recipe for them, explaining the
    trade-offs; the changeset says so;
  * the Postgres e2e helper's random names from `crypto.getRandomValues`, the helper exported
    from the e2e Postgres helpers for the suites to share (YOLO 19);
  * **struck**: the App tests' order (RAGEBAIT now), the `__proto__` refusal (WONTFIX now), the
    zxcvbn optional peers (thread 16 now).
  * **Waits on the Coach**: the `FOR SHARE` race in `races.test.ts` (the row is back at
    `explain`/`drafting`).

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
* **Added, the Coach's ruling** on thread 4's hand-rolled refresh queue (#132): "yes, but can it
  live outside vault, which is jumbo jumbo context mojo". Move the one-at-a-time,
  one-more-run-for-everyone-who-asked queue out of `vault.ts` into a small module of its own in
  `packages/safebyok/src/`, named for what it does, with its own doc block and tests
  (`tests/<same path>`), and have `vault.ts` use it. No behaviour change: thread 4's tests stay
  green untouched.
* **Added, the Coach's rulings** on thread 4 (#132), sent mid-build:
  * **Hard locks** ("yes"): `close()` and a key outlived by a refresh count as hard locks, so a
    read in flight across either refuses, with tests; `lock()`'s doc says a clock that cannot be
    read and `lockSoon()` past its shut time are not.
  * **`storage_unavailable`** ("failure messages should be as fine-grained as reasonable; we can
    assign contextual groupings if needed"): the kind stays, as the grouping; each message says
    exactly which read or write of the device store failed. A case that wants a kind of its own
    comes back as an open matter.

* *Review* (`fixed`, #137): one fix (`990da2c5`, an `eraseUnlock` failure says "try again");
  line 3.8 confirmed atomic in every adapter, the advisory-lock recipe free of cycles, `oneAtATime`
  unchanged in behaviour (its synchronous-throw wedge was real), the hard locks and per-verb
  messages sound. At filing, a `docs:` commit corrected the Postgres wording (writes never wait
  for each other *on the bundle*). Rows: a stale remembered unlock never retried, the duplicated
  `begin`/`soon`, the epoch race on real Postgres, a store that never opens, the advisory key.
  Filed at `95e6e223`. At the restack: delete `comparesVaultKeyEpoch: false` from thread 11's
  battery; 5b carries the IndexedDB expectation rows into the core's tests.

### 15. `deriver_shim` -- one KeyDeriver facade, the Coach's ruling

* **What**, the Coach's words, on the `KeyDeriver` union (#126, explained in *Open Matters*):
  "yes, shim. Why does it give up a first-class route for non-Argon algorithms? I'd have an
  abstract class presenting a facade that our two different derivers and any conjectured other
  ones subclass". So `KeyDeriver` becomes an abstract class: the core calls one method on it, the
  base class holds the shared work (the parameter spec and its floor check, the output's length,
  wiping), and each deriver -- the web Argon2id, `safebyok-fastkey`'s WebAssembly one, the cheap
  test derivers, and any other algorithm a host or a later thread adds -- subclasses it and
  supplies only its runner and its own spec check. Nothing is given up for non-Argon
  algorithms: one would be another subclass with its own spec, and the core's checks for
  Argon2id's floors live in the Argon2id family, not in `openVault`. `class X extends KeyDeriver`
  replaces `implements`, so the union and the "a class cannot implement a union" trouble go.
* **Touches**: `key-deriver.ts`, `key-deriver-spec.ts`, `openVault`'s deriver check,
  `envelope.ts`'s call, `safebyok-fastkey`, the test derivers, `notes/security.md`, the README
  and changeset (an exported type changes shape before 1.0: say what a host writes now).
* **Model**: opus. **Depends on**: 6 (#126), cut from its tip.
* **Look-ahead**: thread 10 (on 4) adds the all-zero-output refusal where the core receives a
  deriver's output; at the restack it may move into the base class's one method. Put the
  base-class design in the thread file before building it, as a short sketch with the method
  names, so the reviewer can check it against the Coach's words.

* *Review* (`flagged`, #138): the facade is the one the Coach asked for, but an override of
  `deriveKeyBytes` skips the 32-byte check (a 16-byte return gave an AES-128 key, confirmed; a
  regression from `envelope.ts`'s check). The fix, a `keyBytesOf` helper on both sides, was
  refused to the reviewer by the tool permission check, so the orchestrator did not route it to
  another agent: #138 waits unfiled on the Coach's word. Also rows: label shadowing (getters over
  a frozen spec), a `WeakSet` brand for lookalikes, the size lines.

### 14. `uncontrolled_fields` -- cleared by the Coach; underway, cut from 7 (3d62fc04)

* **What**: `WhisperField` and the passphrase field become uncontrolled, so neither secret is
  copied into the input's `value` attribute (React 19 does that for a controlled input; thread
  7's review found it). Changes both fields' props.
* **Added, the Coach's rulings (2026-10-16, Open Matters):**
  * **Keep the eyeball, and room for pleasant validations.** The Coach: "does this still let me
    have an eyeball to see the password? Pleasant validations next to it? (\"passphrase must
    contain a capital letter\"?)". An uncontrolled field keeps its reveal toggle (it flips the
    input's `type`), and the passphrase field gets a message beside it, tied by
    `aria-describedby` and announced politely, fed by a host callback. No composition rules of our
    own ("must contain a capital letter"): NIST SP 800-63B advises against them, and the Coach's
    thread 10 ruling already says no meter of ours; thread 10's `passphraseStrengthTest()` is what
    feeds that message once the line is restacked (14 sits above 10). Record the capital-letter
    question as an open matter, Rec: length and strength, not composition.
  * **Two fields, two jobs.** The Coach: "we need to offer two different things: 1) a field for
    entering a secret to store; this is best NOT offered to a password generator to complete or
    for a generator to manufacture; 2) a field for entering a passphrase tied to this URL -- that
    should be in every way the bestest most bestpractices compliant and password manager friendly
    field there is". So `WhisperField` turns autofill and generators away (no
    `autocomplete="new-password"`; `autocomplete="off"` and the password-manager ignore attributes
    `safebyok/utils` exports), and the passphrase field invites them: a real `<form>`, `type`
    `password`, `autocomplete` `new-password` when setting and `current-password` when entering,
    with a username the manager can file it under (the vault's user, in a hidden
    `autocomplete="username"` field). Cite the sources (WHATWG autofill, the password managers'
    own guidance) in the thread file.
  * **CI flakes, first.** CI is red on several of the sprint's PRs. The worker reproduces them,
    finds the cause and fixes it before anything else, as its own commit(s):
    `packages/safebyok-react/tests/vault-provider.test.tsx` > `eraseDamagedVault`, both "opens
    again, and still rejects, when the erase finds storage changed: it reads sound now" (774:55,
    "promise resolved undefined instead of rejecting") and "erases the vault openError says is
    damaged ... opens a fresh one" -- on main already, seen on the node-compat jobs of #125, thread 4's
    draft and #128; and `demos/safebyok-demo-react/tests/App.test.tsx` > "clicks through the
    passphrase dialog: set, lock, mistype, dismiss, enter, and start over" (7 s, on #129's
    test-build). A timing fix that only raises a timeout is not a fix.
* **Model**: opus. **Depends on**: 7 (#129).
* *Review* (`fixed`, #134): the reviewer committed `bb00f0a5` (`passphraseAdvice` hears the
  passphrase in plain text; its doc, the README and `notes/security.md` say keep it on the device)
  and `c7aaa5a5` (the changeset names the `defaultValue` removal and the `ref` passthrough). The
  flake fixes were proven at their causes (5/240 → 0/480; 1/128 → 0/256). At filing, YOLO 14 added
  the three advice hardenings. Left as rows: the reveal toggle's `aria-pressed`, the demo
  `WaysIn` form, the changeset's migration framing, the demo App tests' order, host CSS against
  `hidden`. The debounce stays out, by decision. Filed at `d9b7a5b3`.

### 16. `strength_principles` -- the Coach's three principles for passphrase strength (new)

* **The Coach's text** (rows on #134 and #136, doc rev 7737): "if these principles are met by
  end of sprint I'm happy: 1. we do not offer a weaksauce strength estimator (eg just length)
  2. the batteries-included safebyok/browser gives a good strength estimator 3. optional: the
  customer can override or tweak the strength estimator". On the spaces gap: "this is why we are
  not implementing the length test". On the user's names: "this doesn't seem hard, pass a bag
  including their id, vault label". On the inline test: "can we do the same thing as we do for
  logger?". On the provider's check: "we should be validating these at the earliest opportunity
  and leaving them immutable".
* **Model**: opus. **Depends on**: 10 and 14, so it is cut from the line's top once 14 is
  restacked onto it.
* **Gloss**: `passphraseLengthTest` stops being offered as an estimator (public surface: the
  Coach's ruling, before 1.0); `safebyok/browser` gives `zxcvbnPassphraseTest` as the good default
  for a browser host; a host can pass its own. The core's behaviour with no test given, and how
  the browser default arrives without putting zxcvbn's 216 kB into `browserOpts`, are the
  worker's design calls (YOLO), each recorded as a row. The test takes a second argument, a bag
  with the user's id, the app label and the vault label, which the zxcvbn test hands zxcvbn as user
  inputs. The strength test becomes an ordinary option like `logger` (YOLO 17): no ref wrapper;
  the vault keeps it for its life; a new identity reopens; the README says build it once. The
  core exports `checkStrengthTest` beside `checkValidators`; the provider calls it at render.
  `@zxcvbn-ts/core` and `@zxcvbn-ts/language-common` become optional peers if that squares with
  principle 2; if not, principle 2 wins and a row says why. The provider shows the strength
  test's reason as the passphrase advice when the host passes no `passphraseAdvice` (the restack
  wiring of 10 into 14). The 12-character floor inside the good estimator stays unless the worker
  finds cause (NIST's 15 was the Rec; the Coach answered with the principles).

### 17. `written_at` -- the store compare goes, and the refusals the Coach sharpened (new)

* **The Coach's text** (rows on #132 and #137, doc rev 7737): "have a thread remove the
  changed_at guarantee and make it written_at, with no information about whether a change
  happened. Even if it's safe it raises too many questions for a library with this much to think
  about". On a device store that never opens: "What does it cost to have the extra kind? it's
  fundamentally important to know 'this cannot succeed, and we know wny' vs 'this cannot succeed,
  and we know why, but it might succeed later'". On erase into a reborn vault: "as long as the
  message says what happens 'the contents of <box> could not be erased because its vault is
  inaccessable' or whatever".
* **Model**: opus. **Depends on**: 5b (it touches every adapter's stored fields), so it is cut
  from the line's top; it may run beside 16 and restack onto it.
* **Gloss**: `store()` no longer opens the old box to compare; `changed_at` becomes
  `written_at`, stamped on every write, in the stored record, every adapter's schema and columns
  (Convex validators, Postgres columns and SQL, GraphQL fields), the docs and the demo. A stored
  shape change before 1.0: no migration, no reading of the old field; the changeset says what a
  host sees (CLAUDE.md, *What the package promises*). A kind of its own for a device store that
  cannot succeed until something outside changes (YOLO 18), named by VOCABULARY.md and STYLE.md,
  beside `storage_unavailable` for a failure a retry may mend. `erase()` into a reborn vault keeps
  `stale_write`, with a message that says what happened. A store's catch-up passes
  `identity_revoked`, `rolled_back` and `newer_format` through unchanged, unless thread 13 already
  does (thread 4's review, Rec taken).

## Coach rulings during the sprint

From the sprint doc's *Open Matters*, as rows are swept:

* **`user_id` characters** (thread 1): yes, letters, digits and `-_.:@+|`, 1 to 100.
* **Standard Schema** (G497): stays NOT YET.
* **The adapters' logger option** (thread 5): `logger`, in every adapter.
* **A hint on the whisper field** (thread 7): yes, a host `placeholder`, none by default. And a
  new NOTYET: "Option to let the user add a hint on their passphrase".
* **Relative-time polyfill** (thread 7), the Coach's words: "we implement nothing but
  `Intl.RelativeTimeFormat` code, assume it's there, and tell people how to make sure it's 100%
  always there". So no presence check and no fallback in the dialog; the README says how a host
  guarantees it (the `@formatjs/intl-relativetimeformat` polyfill import, for runtimes like
  Hermes); no dependency.
* **Password-manager attributes** (thread 7): yes, exported from `safebyok/utils` beside `mask`.
* **`PostgresVaultDB`** (thread 5): drop the type ("we found out we don't need to export it":
  yes, drop it).
* **Password strength** (thread 10), the Coach's words: "The 'don't let customers shoot
  themselves in the foot' rule says we should not offer a bullshit password meter. Add a
  pluggable callback `passphraseStrengthTest()` to the entry point. Have `safebyok/browser`
  export `@zxcvbn-ts/core` as a tree-shakeable default." This is the Coach's yes to
  `@zxcvbn-ts/core` as a runtime dependency of `safebyok` (thread 10's gloss has the shape). And a
  new NOTYET: "Break out dependencies, including -fastkey, into a -utils or -bestpractices
  package".
* **Store base design** (5): proceed, with the comments in 5's gloss.
* **No `bindValidators`** (1): accepted, as built.
* **The key joiner** (1), the Coach's words: "don't let a host set the key join and split, or
  specify a different character". So `^`, fixed.
* **`lockSoon()`** (3), the Coach's words: "lockSoon is a soft lock". Flipped in thread 4.
* **An all-zero derived key** (6, G032): yes, refuse it as `bad_option`. In thread 10.
* **Passkey changing a passphrase** (6, G072): keep as built, and a TODO: "Are we doing anyone a
  favor by accepting multiple passphrases?" (beside NOTYET G530).
* **ShelfVaultDB** (5): not this sprint; a TODO.
* **Lock promises** (G119, G516), from the Coach's notes: drop 'stay' ("Remove 'stay' please");
  a read in flight refuses once a hard lock lands ("no more reading if the goons are at the
  door"); `rolled_back` on a refresh drops the key, one rule with the sign-out, no knob ("one
  rule, simple to reason about"). All three in thread 4.
* **A new TODO**, the Coach's note: "Identity should not be tied to the backing database".
* **Coach rulings, second batch (2026-10-16, after the session limit).** Thread 14 proceeds,
  with the eyeball kept, a validation message beside the passphrase field, and the two fields'
  two jobs (thread 14's entry has the words). A second unsubscribe stays silent. The provider not
  reopening on `bad_option`, with `retryOpen()` to mend the race, stands. NOTYET: the React
  binding under a real screen reader, shadow-DOM host and browser (G356 stays). TODO: `postgres`
  and `node-compat (22)` become required checks (the ruleset is the Coach's). Noted: thread 11's
  answers to the side questions, and thread 8's two unproven release paths (the Coach watches the
  first failed release and the first Dependabot runtime PR). CLAUDE.md's stale *Commands* lines:
  fixed in the Coach's own branch. The `KeyDeriver` union: explain only, no action yet. Full
  question and answer for each: `20261016-push_to_100_a-resolutions.md`.

* **Coach rulings, fourth batch (doc rev 4547).** `storage_unavailable` stays, its messages made
  fine-grained (thread 13). G499's conflict handler stays NOT YET, in `NOTYET.md`, so a returning
  idea has a place to point to. `close()` and an outlived key become hard locks (thread 13).
  Chrome offering a saved password on the whisper field: WONTFIX (thread 9 writes the entry).

* **Coach rulings, fifth batch (doc rev 7737).** Passphrase strength: the Coach's three
  principles (no weak estimator, a good one in `safebyok/browser`, host override), the test told
  the user's id and labels, held like `logger`, checked by an exported `checkStrengthTest` --
  thread 16. `store()`'s compare goes and `changed_at` becomes `written_at`; a kind for a device
  store that cannot succeed; erase's message says what happened; catch-up kinds pass through --
  thread 17. Thread 9 gains the 1,024 allowance, unknown `store()` options, the `cipherBinding`
  guard, the Lockbox file, a `__proto__` WONTFIX, the WaysIn form, the inline `display: none`, the
  hard-cap recipe replaced by an agent prompt, and `crypto.getRandomValues`. Kept as built: lockSoon
  as a soft lock, an omitted bag keeping the old (RAGEBAIT), the empty bag counted, the second
  zxcvbn dependency, a score of 3, the creation race, a throwing host test, the one-line all-zero
  check, the demo's plain editor, the passphrase entry's default name. RAGEBAIT: the App tests'
  order. Thread 14's changeset loses its migration framing at the restack. `FOR SHARE`: explained
  in the doc, waiting. Full text: the resolutions file.

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
7. **`^` joins the name floor for every adapter** once the Coach ruled the delimiter fixed:
   otherwise a Convex, Postgres or GraphQL host whose names hold `^` meets `bad_label` only from
   the browser's device store, at `openVault`, with no remedy. One refusal, at entry, everywhere.
8. **Thread 7 files without a second review** of its post-review changes: they remove code to
   a Coach ruling (the polyfill check), add documentation, and at most memoize one formatter.
9. **The lock rulings go to thread 4**, mid-build, not to a new thread on top of it: they live
   in `refusal-policy.ts` and the lock code that thread 4 already holds.
10. **Thread 4 may raise the `openVault` budget**, that line only, to the rule's round number:
    CI found it 1.7 kB over on thread 4's draft. Thread 9 lowers every budget at the end.
    *Corrected:* the overrun was only because thread 4 stands on 3, from main, and not yet on 1,
    whose `f227fd1c` already set `openVault` to 30 kB for the whole sprint. So at the restack,
    thread 4's `tools:` commit (`312bcd50`, 23 to 28 kB) is dropped, and thread 1's 30 kB stands.
11. **The CI flakes go to thread 14**, first, as their own commits: it is cut from 7, which holds
    the failing demo test, and works in the same package as the `vault-provider` flake on main.
    No new thread, so the sprint stays at three agents building at once.
12. **Thread 2's two significant review findings are fixed in the thread** (#133), then a second
    review: `store()` carries the old bag and `registered_at` forward only when the old record
    deciphers (a tampered bag was resealed as authentic), and a lockbox's `public_json` must equal
    its own stable re-serialization (a deep bag made `openVault` throw a bare `RangeError`). Both
    tighten a format born in this thread, before 1.0. Rows in *Open Matters* let the Coach object.
13. **Thread 10's provider holds the strength test in a ref** (#136), then a second review: an
    inline arrow reopened the vault on every parent render, and the test plays no part in
    opening. The all-zero check stops claiming constant time.
14. **Thread 14 adds three advice hardenings before filing** (#134), its reviewer's
    recommendations: a superseded call's rejection is ignored, advice resets when `creating`
    changes, and an `undefined` answer reads as `null`. One small commit, with tests, no second
    review.
15. **Thread 2 files with its second review `flagged`** (#133), rather than waiting unfiled: the
    skill allows no third review, both fixes held, and the open finding (a bag or whisper nested
    about 3,000-6,000 deep still reaches a bare `RangeError` in `store()` and in `lockSoon`'s
    synchronous compare, before it erases the remembered unlock) is closed by an additive depth
    cap the Coach rules on. Holding #133 would stall 5b and the 3 → 4 restack. The PR's open
    questions name it first, and the row says #133 waits on the Coach's word before it merges;
    if yes, thread 9 builds the cap.
16. **5b is cut from 10's restacked tip, not 4's.** The line runs 4 → 13 → 10 → 5, and 13
    edits `safebyok-indexeddb/src/expectations.ts`, which 5b deletes, while 10 changes
    `openVault`, where 5b hands over the logger. Restacking 13 and 10 first (their own workers,
    each with a lease) moves those conflicts to now, where each worker knows its own code, rather
    than to the wrap-up. Thread 4 dropped `312bcd50` in its restack, as YOLO 10 corrected says.

17. **The strength test becomes an ordinary option, like `logger`** (thread 16): the Coach asked
    "can we do the same thing as we do for logger?", and `logger` reopens the vault when its
    identity changes. Holding the test the same way drops the ref wrapper of YOLO 13 and leaves
    the vault's options immutable for its life, as the Coach asked on the provider's check; the
    context bag the test now receives removes the usual reason to write it inline. A row lets the
    Coach object.
18. **A kind of its own for a device store that cannot succeed** (thread 17): the Coach asked
    what it costs and why it matters; the cost is one member of the kinds union, its docs, and
    one branch where the device store opens, which buys a host the difference between "retry"
    and "change something first". A row says so.
19. **"yes export" on the `node:crypto` row** read as: export the random-name helper from the
    e2e Postgres helpers so the suites share it, using `crypto.getRandomValues`. A row asks.

## For the Coach

* **The opened questions** are rows in the sprint doc's *Open Matters* tab, each with a default
  the threads build to: `user_id`'s charset (1), the Standard Schema landing (1), the adapters'
  logger option name (5), the `Intl.RelativeTimeFormat` polyfill dependency and the "hint"
  question (7), a strength library (10), which suites run against the Postgres container (11).
* **Two rows in *Open Matters***: the uncontrolled secret fields (14), and whether a second
  unsubscribe should warn (your question in the design).
* **From thread 8, only your hands**: add `node-compat (22)` to the branch ruleset; check whether
  the `releasing` environment's `RELEASE_APP_PRIVATE_KEY` reaches a Dependabot
  `pull_request_target` run (else add it as a Dependabot secret); CLAUDE.md's *Commands* lines
  for `pnpm justify` and `pnpm size` are a line stale (justify now runs size).
* The preplan's *Only your hands*, *Real devices*, *Design first* and *NOT YET* lists stand as
  written there; nothing in this sprint touches them.
