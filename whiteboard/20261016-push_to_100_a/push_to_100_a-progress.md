# Sprint push_to_100_a -- progress

**Status**: thread 4 underway; 1 rebuilding to a Coach ruling; 8 and 11 in review; 3, 6 and 7 filed; 5b cleared, cut once 4 files.

## Status

| # | Thread | Base | Status | PR |
|---|---|---|---|---|
| 1 | names_and_keys | main | rebuilding: the joiner ruling, then a second review | [#128](https://github.com/mrflip/safebyok/pull/128) |
| 2 | public_bag | on 1 | pending | |
| 3 | locks_and_expiry | main | filed #127 | [#127](https://github.com/mrflip/safebyok/pull/127) |
| 4 | refusals_and_catchup | on 3 (98b70b80) | underway | |
| 5a | store_base design | -- | done: the Coach said proceed, with comments (plan, thread 5) | |
| 5b | store_base build | on 4 (restacked) | pending: 4 | |
| 6 | crypto_small | main | filed #126 | [#126](https://github.com/mrflip/safebyok/pull/126) |
| 7 | react_tidy | main | filed #129 | [#129](https://github.com/mrflip/safebyok/pull/129) |
| 8 | ci_release | main | in review | [#130](https://github.com/mrflip/safebyok/pull/130) |
| 9 | sweep_small | top of the line | pending | |
| 10 | secure_floor | on 4 | pending | |
| 11 | pg_container | main | in review | [#131](https://github.com/mrflip/safebyok/pull/131) |
| 12 | floors_forward | top of the line | pending: after 2026-10-16T23:01Z | |
| 13 | epoch_expectation | on 4 | pending | |
| 14 | uncontrolled_fields | on 7 | proposed: its *Open Matters* row | |

## What the threads have taught


* *Orchestrator:* **Sweep ledger.** At the start: the 23 no-code rows (G204, G205, G206, G478,
  G215, G291, G135, G321, G440, G443, G445, G474, G475, G235, G238, G253, G293, G376, G400,
  G444, G465, T01, G064). Thread 6 (#126): its 14 rows; NOTYET rows G531 (passphrase hint) and
  G532 (a -utils or -bestpractices package) added. Thread 3 (#127): 12 rows swept, G324
  annotated (its wording half is thread 7's); G129's row carried the Coach's answer, which
  `matters/` keeps. The Gripefest doc stands at 220 matters.
* *Orchestrator:* **Coach rulings, mid-sprint** (the plan's *Coach rulings* has their words):
  the key delimiter is fixed at `^`, with no option (thread 1 rebuilds); `lockSoon()` is soft,
  `whenIdentityRevoked` goes, a `read()` refuses when a hard lock landed during its awaits, and
  `rolled_back` on a refresh drops the key (all four in thread 4); an all-zero derived key is
  refused (thread 10); 5b proceeds with one options bag per adapter factory and openVault's
  logger handed down by default.
* *Orchestrator:* **Thread 6** (filed, [#126](https://github.com/mrflip/safebyok/pull/126)):
  `KeyDeriver` is now `Argon2idKeyDeriver | CustomKeyDeriver` with field names unchanged
  (`key_deriver_label`, `algorithm`), so 5 and 10 read them as before; a host class writes
  `implements CustomKeyDeriver`. `changePassphrase(proof, new, { unlockId? })` takes any proof;
  thread 3's renewal meets it at the restack in `changePassphrase`'s body. `ensureSaltFits` is
  exported. openVault measured 22.75 kB against main's 23 kB: thread 1's raise to 30 kB covers it.
  *Review:* `fixed`. Kept: a passkey-proved `changePassphrase` stamps the bundle's
  `vault_key_epoch` (it copied the replaced envelope's); a length-refused deriver result is zeroed
  too; the changeset's two overclaims corrected. Left: `KeyDeriver` is not discriminated (the
  recorded G031 shape); a caching deriver sees zeros (an all-zero refusal is an Open Matters row);
  `fill(0)` can throw on an immutable buffer; `absentUnlock()`'s message is wrong when the id names
  a passkey (thread 9 may restore a passphrase-specific one); `ensureSuppliedSpecKept` runs twice;
  the `test_` warning is case-sensitive.

* *Orchestrator:* **5a's design** (`store-base-design.md`) adds to the preplan: `Refusals` and
  `Expectations` exported from core (the key-value adapters share core's expectation predicates,
  which brings VAULTDB.md 3.8 to IndexedDB too: thread 13 should know), `ChangeBell` moved from
  `safebyok-indexeddb` into core's `safebyok/idb` (G270), and GraphQL calling `onChange` when its
  subscription fails. It declines a list/replace/delete-only connector (not atomic), and offers
  `ShelfVaultDB` as a later question.
* *Orchestrator:* **`matters/`** holds all fourteen tabs of the Gripefest doc as of the sprint's
  start. G247 (thread 5's Convex `vault_id` check) appears only in the strawman and Validators
  tabs; follow the preplan's wording.
* *Orchestrator:* **Thread 3** (filed, [#127](https://github.com/mrflip/safebyok/pull/127)) --
  what later threads inherit:
  * `Ms` is `Millis` everywhere (`ForeverMillis`, `reentryWindowMillis`, `MinuteMillis`,
    `MaxReentryHours` = 588). The far-future test is `>= ForeverMillis - MinuteMillis`; 3 already
    changed that one line in `safebyok-react`'s `passphrase-modal.tsx` (thread 7: rebase onto it).
  * One function, `deadlineFor(proof, call)`, sets every deadline; a passkey-proved change keeps
    the standing deadline. Thread 6's passkey-proved `changePassphrase` goes through
    `reviseUnlocks`, so the restack should be mechanical.
  * **Thread 4**: unlocks go through `noteStart()` and `takeUpUnlock(..., started, until)`;
    `destroy()` goes through `shut()` -> `forgetUnlock()`. `close()` locks nothing now.
  * **Thread 2**: the device mark is `safebyok-mark-v2` (with `lock_generation`): list it in the
    format-snapshot test.
  * **`DeviceDB.writeUnlock(unlock, expected)`** is now conditional on the mark's generation (no
    unconditional path); `writeMark` never lowers it. Host `DeviceDB`s change.
  * **Tests**: every unlock arms a `setTimeout` (unref'd). A test spying on `setTimeout` filters
    those (`delaysAsked` in `vault.test.ts`); `vi.runAllTimers()` locks the vault.
  * openVault measured 22.21 kB on 3 alone.
  *Review:* `fixed`. Kept: the changeset's clause about renaming `safebyok/testing`'s private
  timing constants removed. Left, and **handed to thread 4**: (1) the drop timer is armed a fixed
  grace after a late ring, not for `dueAt - now` -- the fix needs the timed test world's `pass()`
  to move clock and timers together; (2) `destroy()`'s `eraseMark` resets the generation to 0, so
  an unlock under way at generation 0 elsewhere can take up a destroyed vault's key; (3) a lock
  before any mark exists raises nothing; (5) `store()`'s stale-write retry calls
  `ensureUnlocked()` where `keyInHand()` would honour the grace; (6) G130's wrap covers only
  `rememberedUnlock`, not `refresh()`'s `readMark`; (7) `keptMark()`'s warning is tagged
  `call: 'refresh'` from a lock. Left as accepted: (4) the post-deadline minute and a stepped-back
  clock (G128's class). Not checked: real-browser IndexedDB atomicity (fake-indexeddb only).
* *Orchestrator:* **Thread 1** (ready, [#128](https://github.com/mrflip/safebyok/pull/128)) --
  what later threads inherit:
  * **No `bindValidators`** (a deviation, an Open Matters row): host validators run at entry only
    (`openVault`, `store`, `addPassphrase`, `addPasskey`); no VaultDB verb takes a bag. Thread 5's
    design assumed a binding: **5b drops that part**; the base inherits the floor and name checks
    (`heldScope`, `heldBoxlabel` in `vault-db.ts`).
  * **A floor** (`NameFloor`, `NoteFloor`: well-formed, NFC, no controls, 1 KiB name / 4 KiB note)
    runs beneath everything, in every verb and every record schema. Adapters declare
    `maxNameBytes` and `reservedNameChars` (VAULTDB.md 7.3, 7.4). Postgres and GraphQL: 640 bytes.
  * **`Ckeys.joiner(delimiter = '^')`**, a one-character delimiter (a deviation, an Open Matters
    row); the key-value adapters take `ckeyDelimiter`. No record format bump for the ckey.
  * **Thread 2**: `NoteFloor`, `NoteFloorBytes`, `LockboxNote` and `Lockbox.note`'s floor go with
    the note. `DefaultValidators` is at 3,981 B of its 4 kB budget: 2's removal of the note slot
    should free room; if not, raise that line by the rule and say so.
  * `listBoxes` sorts by UTF-16 code unit.
  *Review:* `fixed`. Kept: `boxRange` exact again (U+FFFF-led boxlabels were missed by the old
  inclusive bound); `browserOpts` passed `ckeyDelimiter` on (now moot: the Coach then ruled the
  delimiter fixed, so the thread rebuilds without the option and puts `^` in the floor, YOLO 7).
  Left: `memoryDeviceDB` throws a refusal synchronously from promise-returning methods;
  `listBoxes` filters by the floor, not `maxNameBytes`; GraphQL's `ServerMaxNameBytes` copies
  Postgres's 640 by hand; a `TextEncoder` per name check. Not checked: real Postgres, real Convex,
  browser IndexedDB ordering.
* *Orchestrator:* **Thread 7** (ready, [#129](https://github.com/mrflip/safebyok/pull/129)):
  pulled G333 forward (`VaultProvider` reopens only on `stale_write`, with its test): **thread 4
  strikes G333**, and its identical edit collapses at the restack. Exports `parseLogger` from
  `safebyok` and `WhisperFieldAttributes` from `safebyok/utils`. Kept main's `ForeverMs` names with
  a local `MinuteMillis`; the restack onto 3 takes 3's names. React measure for thread 8's new
  line: everything 4,554 B -> **6.9 kB**.
  *Review:* `fixed`. Kept: a start-over erase refused as `stale_write` closes its question (a
  second press could erase a vault made since); a vault erased elsewhere ends the question;
  "Erase and start over" is disabled while it runs. Left: **the whisper sits in the input's
  `value` attribute** (React 19 copies a controlled input's value there; the passphrase field
  too) -- a README line and a security note now, and proposed thread 14 to make both fields
  uncontrolled; no focus trap under `aria-modal`; focus lost if the focused passkey button goes;
  Escape on the start-over question closes the dialog; `passkeyAskFailed` speaks to developers.
  Filed with the Coach's polyfill ruling (no presence check, three tests gone), a test proving the
  `value` attribute, and one `Intl.RelativeTimeFormat` per locale made at first use.
* *Orchestrator:* **Thread 8** (ready, [#130](https://github.com/mrflip/safebyok/pull/130)):
  `pnpm justify` now runs `pnpm size:check` against what is built, so **every thread after 8 in
  the line justifies against the budgets**. Appended size entries: `idbVaultDB` 2.6 kB,
  `VaultProvider` 4.7 kB, `reactEverything` 5.3 kB, each measured on main (thread 7's changes
  land at the restack; thread 9 re-derives). tsdown's `root` flattens `dist/src/` (it needs an
  array `entry`). `safebyok/testing`: `vaultDBTimingChecks`' handles are camelCase and one
  `MakeDevices` type covers both device-factory shapes; thread 11 meets them. `unicorn/prefer-
  iterator-to-array` and `prefer-promise-with-resolvers` are off in every config. G517 closed in
  part (three limits stated in the doc block). Needs the Coach's hands: the `node-compat (22)`
  ruleset entry, the Dependabot secret check, CLAUDE.md's stale *Commands* lines.
* *Orchestrator:* **Thread 11** (ready, [#131](https://github.com/mrflip/safebyok/pull/131)): the
  `postgres` CI job runs `e2e/tests/postgres/` (battery, eight-device races, foreign key, the
  README's hard-cap trigger at three isolation levels) on `postgres:17`; `OnRealPostgres` lists
  them and every suite skips without `SAFEBYOK_PG_URL`. A database per test file (`NOTIFY` is per
  database), so the URL's role needs `CREATEDB`. The adapter's own PGlite-shaped tests do not run
  there without a wrapper (not built; the Coach's drafting Postgres-suites row). G203 and G288
  closed; G524 half (Convex's slot only commented). A `node-compat (22)` flake in
  `vault-provider.test.tsx` ("opens again ... made anew") passed on rerun: watch it.
