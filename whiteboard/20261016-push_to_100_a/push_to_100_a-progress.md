# Sprint push_to_100_a -- progress

**Status**: threads 1, 3 and 7 underway, 6 in review; 5a's design written, waiting on the Coach. Newer than the plan wherever they disagree.

## Status

| # | Thread | Base | Status | PR |
|---|---|---|---|---|
| 1 | names_and_keys | main | underway | |
| 2 | public_bag | on 1 | pending | |
| 3 | locks_and_expiry | main | underway | |
| 4 | refusals_and_catchup | on 3 | pending | |
| 5a | store_base design | -- | written: `store-base-design.md`; the Coach's row in *Open Matters* | |
| 5b | store_base build | on 4 (restacked) | pending: the Coach's word on 5a | |
| 6 | crypto_small | main | in review | [#126](https://github.com/mrflip/safebyok/pull/126) |
| 7 | react_tidy | main | underway | |
| 8 | ci_release | main | pending | |
| 9 | sweep_small | top of the line | pending | |
| 10 | secure_floor | on 4 | pending | |
| 11 | pg_container | main | pending | |
| 12 | floors_forward | top of the line | pending: after 2026-10-16T23:01Z | |
| 13 | epoch_expectation | on 4 | pending | |

## What the threads have taught

* *Orchestrator:* **Sweep ledger.** At the start: the 23 no-code rows (G204, G205, G206, G478,
  G215, G291, G135, G321, G440, G443, G445, G474, G475, G235, G238, G253, G293, G376, G400,
  G444, G465, T01, G064); the Gripefest doc stands at 244 matters.
* *Orchestrator:* **Thread 6** (ready, [#126](https://github.com/mrflip/safebyok/pull/126)):
  `KeyDeriver` is now `Argon2idKeyDeriver | CustomKeyDeriver` with field names unchanged
  (`key_deriver_label`, `algorithm`), so 5 and 10 read them as before; a host class writes
  `implements CustomKeyDeriver`. `changePassphrase(proof, new, { unlockId? })` takes any proof;
  thread 3's renewal meets it at the restack in `changePassphrase`'s body. `ensureSaltFits` is
  exported. openVault measured 22.75 kB against main's 23 kB: thread 1's raise to 30 kB covers it.

* *Orchestrator:* **5a's design** (`store-base-design.md`) adds to the preplan: `Refusals` and
  `Expectations` exported from core (the key-value adapters share core's expectation predicates,
  which brings VAULTDB.md 3.8 to IndexedDB too: thread 13 should know), `ChangeBell` moved from
  `safebyok-indexeddb` into core's `safebyok/idb` (G270), and GraphQL calling `onChange` when its
  subscription fails. It declines a list/replace/delete-only connector (not atomic), and offers
  `ShelfVaultDB` as a later question.
* *Orchestrator:* **`matters/`** holds all fourteen tabs of the Gripefest doc as of the sprint's
  start. G247 (thread 5's Convex `vault_id` check) appears only in the strawman and Validators
  tabs; follow the preplan's wording.
