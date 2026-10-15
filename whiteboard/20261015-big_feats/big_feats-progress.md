# Sprint big_feats -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in
`thread-<N>-<label>.md` on that thread's branch.

## Status

| # | Thread            | Base                                   | Status                         |
| - | ----------------- | -------------------------------------- | ------------------------------ |
| 1 | argon2_wasm       | gripe_fixes `kdf_configs`, when filed  | waiting on kdf_configs         |
| 2 | unlock_envelopes  | #63 `ea4b93d`                          | underway                        |
| 3 | passkey_unlock    | thread 2                               | pending                        |
| 4 | indexeddb_package | gripe_fixes `vaultdb_validation`       | waiting on vaultdb_validation  |
| 5 | postgres_vaultdb  | #63 `ea4b93d`, rebased onto 2 to file  | underway                        |
| 6 | graphql_vaultdb   | thread 5                               | pending                        |

## What the threads have taught

* *Orchestrator:* **Adapters store field by field** (the Coach, 2026-10-15). The plan first said
  "store records whole"; the Convex component in fact keeps a typed column per field, and the
  Coach ruled that the cutoff is one opaque (`jsonb`) column per ciphered value or structured
  public payload, each its own field. The plan's *Ground rules* now say so, and thread 5 rebases
  onto thread 2 before filing.
