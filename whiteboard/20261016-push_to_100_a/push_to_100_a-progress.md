# Sprint push_to_100_a -- progress

**Status**: threads 4, 8 and 11 underway; 1 and 7 in review; 3 and 6 filed; 5b waits on the Coach.

## Status

| # | Thread | Base | Status | PR |
|---|---|---|---|---|
| 1 | names_and_keys | main | in review | [#128](https://github.com/mrflip/safebyok/pull/128) |
| 2 | public_bag | on 1 | pending | |
| 3 | locks_and_expiry | main | filed #127 | [#127](https://github.com/mrflip/safebyok/pull/127) |
| 4 | refusals_and_catchup | on 3 (98b70b80) | underway | |
| 5a | store_base design | -- | written: `store-base-design.md`; the Coach's row in *Open Matters* | |
| 5b | store_base build | on 4 (restacked) | pending: the Coach's word on 5a | |
| 6 | crypto_small | main | filed #126 | [#126](https://github.com/mrflip/safebyok/pull/126) |
| 7 | react_tidy | main | in review | [#129](https://github.com/mrflip/safebyok/pull/129) |
| 8 | ci_release | main | underway | |
| 9 | sweep_small | top of the line | pending | |
| 10 | secure_floor | on 4 | pending | |
| 11 | pg_container | main | underway | |
| 12 | floors_forward | top of the line | pending: after 2026-10-16T23:01Z | |
| 13 | epoch_expectation | on 4 | pending | |

## What the threads have taught


* *Orchestrator:* **Sweep ledger.** At the start: the 23 no-code rows (G204, G205, G206, G478,
  G215, G291, G135, G321, G440, G443, G445, G474, G475, G235, G238, G253, G293, G376, G400,
  G444, G465, T01, G064). Thread 6 (#126): its 14 rows; NOTYET rows G531 (passphrase hint) and
  G532 (a -utils or -bestpractices package) added. The Gripefest doc stands at 232 matters.
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
* *Orchestrator:* **Thread 7** (ready, [#129](https://github.com/mrflip/safebyok/pull/129)):
  pulled G333 forward (`VaultProvider` reopens only on `stale_write`, with its test): **thread 4
  strikes G333**, and its identical edit collapses at the restack. Exports `parseLogger` from
  `safebyok` and `WhisperFieldAttributes` from `safebyok/utils`. Kept main's `ForeverMs` names with
  a local `MinuteMillis`; the restack onto 3 takes 3's names. React measure for thread 8's new
  line: everything 4,554 B -> **6.9 kB**.
