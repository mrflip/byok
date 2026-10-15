# Sprint big_feats -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in
`thread-<N>-<label>.md` on that thread's branch.

## Status

| # | Thread            | Base                                   | Status                         |
| - | ----------------- | -------------------------------------- | ------------------------------ |
| 1 | argon2_wasm       | #68 (kdf_configs) `80ac694`            | underway                       |
| 2 | unlock_envelopes  | #63 `ea4b93d`                          | in review                      |
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
