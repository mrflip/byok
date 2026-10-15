# Sprint big_feats -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in
`thread-<N>-<label>.md` on that thread's branch.

## Status

| # | Thread            | Base                                   | Status                         |
| - | ----------------- | -------------------------------------- | ------------------------------ |
| 1 | argon2_wasm       | #68 (kdf_configs) `80ac694`            | filing                         |
| 2 | unlock_envelopes  | main (#63 merged; was `ea4b93d`)       | filed #71                      |
| 3 | passkey_unlock    | #71 `983bd0c`                          | underway                       |
| 4 | indexeddb_package | #70 (vaultdb_validation) `d874db3`     | underway                       |
| 5 | postgres_vaultdb  | #71 `983bd0c` (rebased from `ea4b93d`) | filed #73                      |
| 6 | graphql_vaultdb   | thread 5                               | pending                        |

## What the threads have taught

* *Orchestrator:* **Adapters store field by field** (the Coach, 2026-10-15). The plan first said
  "store records whole"; the Convex component in fact keeps a typed column per field, and the
  Coach ruled that the cutoff is one opaque (`jsonb`) column per ciphered value or structured
  public payload, each its own field. The plan's *Ground rules* now say so, and thread 5 rebases
  onto thread 2 before filing.
* *Orchestrator:* **Thread 2 (unlock_envelopes), what later threads inherit** (from its thread
  file, `thread-2-unlock_envelopes.md` on `20261015-unlock_envelopes`):
  - **The bundle, for the adapters (threads 4-6):** `{ format, applabel, user_id, vaultlabel,
    vault_id, passphrase_epoch, unlocks, registered_at }`. `unlocks` is plain JSON, one `jsonb`
    column: a list of 1 to 8 `{ method: 'passphrase', unlock_id, unlocklabel, key_deriver_label,
    salt_b64, vault_key_wrapped: { cipher_iv_b64, ciphertext_b64 } }`. Nothing a verb compares is
    inside it. Build test bundles with `TH.bundleOf` / `TH.envelopeOf`, never by hand with the old
    field names (`vault_key_passphrase_wrapped`, `passphrase_salt_b64`).
  - **For thread 3 (passkey):** add `PasskeyEnvelope` to the union and `UnlockMethodVals`, its
    purpose to `PurposeForMethod` (`envelope.ts`), its public fields to `UnlockSummary` (make it a
    union) and `Envelope.summarize`; filter non-passphrase envelopes where `openWithPassphrase`'s
    comment says. **Every envelope change takes a proof** (the session vaultKey is
    non-extractable): adding a passkey needs a passphrase or another passkey's PRF bytes as
    proof, through a generalized `reviseUnlocks`, never an extractable vaultKey.
  - The envelope binding is `[format, scope, vault_id, purpose-per-method, header]`, with the
    epoch out, so one envelope's change never needs the other passphrases.
* *Orchestrator:* **Thread 4's base is [#70](https://github.com/mrflip/safebyok/pull/70)**
  (gripe_fixes `vaultdb_validation`, `d874db3`). What it changes under thread 4: `idbVaultDB`'s
  `dbName` is checked by a private parser, `src/idb-opts.ts`, shared with `idbDeviceDB`,
  `browserOpts` and `inspectIdb`. VaultDB's write verbs now validate each record and expectation
  before `do*` sees it, and hand the adapter the *parsed* record (unknown fields stripped).
  `openVault` duck-types `vaultDB`, since `instanceof` breaks across package copies. And #68 plus
  #70 together likely exceed the 16.5 kB `openVault` budget; thread 2 already raised it to 17.5 kB
  on its branch.
* *Orchestrator:* **Thread 5 (postgres_vaultdb), for thread 6** (from `thread-5-postgres_vaultdb.md`
  on `20261015-postgres_vaultdb`):
  - **The listBoxes resolver uses `PostgresVaultDB.listBoxRecords(scope)`**, not `listBoxes`: a
    VaultDB's public listing (summaries: no `format`, `note: null`) is not valid `doListBoxes`
    input, so a VaultDB over a wire cannot pass it through. #70 kept listings validated by the
    listed shape, so `listBoxRecords` stands as built.
  - The subscription resolver wraps `vaultDB.subscribe(scope, onChange)`; one `listen` (the
    README's `pg` fan-out) serves every per-request VaultDB. Change channel `safebyok_vault_changes`,
    payload the scope as JSON.
  - `describeVaultDB` over a per-request VaultDB needs `TH.perUser`. PGlite starts in about a
    second; share one per test file and truncate between tests.
  - Its README's route recipe (a POST handler plus a client VaultDB over `fetch`, tested in
    `tests/route-recipe.test.ts`) is the REST shape thread 6 parallels.
* *Orchestrator:* **Thread 1 (argon2_wasm), ready.** hash-wasm's Argon2id derives
  `argon2id_web_v1` in about 130 ms against noble's 580 ms (Node 24), byte for byte the same, and
  both meet Argon2id's reference test vector. It exports `parseKeyDeriverSpec` from the core (a
  public-surface addition awaiting the Coach's yes), so any Argon2id stand-in refuses exactly what
  `argon2idDeriver` refuses. hash-wasm runs synchronously (it holds the thread for its ~130 ms)
  and needs a Content-Security-Policy allowing `'wasm-unsafe-eval'`.
* *Orchestrator:* **The second_harvest stack has merged** (main is #63's merge, `0152367`, whose
  tree is byte-identical to `ea4b93d`, though the stack's commits were rebased, so `ea4b93d` is
  not on main). Hence:
  - Thread 2 rebased onto main cleanly before filing (#71).
  - **Thread 5 rebases onto #71's tip** before filing, as planned; its `ea4b93d` commits then sit
    on main through #71.
  - **Threads 1 and 4 stand on gripe_fixes PRs** (#68, #70) that are still on the old stack.
    When gripe_fixes rebases them onto main, each of our threads rebases onto the new tip of its
    base before filing (unpushed, so allowed). If its base has not moved by then, it files
    stacked on the base as it is.
  - The sprint branch itself was cut from `ea4b93d`, and is rebased onto main at wrap-up.
