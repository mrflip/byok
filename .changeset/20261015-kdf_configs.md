---
"safebyok": minor
---

Key derivation is now a choice, and a supplied spec's label is enforced. New export `argon2idDeriver(spec)` makes a KeyDeriver for a whole Argon2id parameter set under a label of your own; `argon2idWebV1Deriver` is that factory over `Argon2idWebV1`, which stays the one supplied spec and what `browserOpts()` uses. The factory refuses with `bad_option` what Argon2id cannot run (a salt under 8 bytes or over 65536, memory under 8 KiB a lane or over 1 GiB, no passes or lanes, a key other than 32 bytes) and allows weaker parameters that run.

Breaking, for a host that supplies its own `keyDeriver`: a KeyDeriver now carries its spec's fields beside `deriveKeyBytes`, and `openVault` refuses (`bad_option`) one labelled `argon2id_web_v1` that does not carry exactly `Argon2idWebV1`'s parameters. A WebAssembly or native stand-in fixes this by spreading the spec into itself: `{ ...Argon2idWebV1, deriveKeyBytes }`. `openVault` also refuses a `salt_bytes` over 65536, and `unlock()` and `changePassphrase()` refuse a `deriveKeyBytes` that hands back anything but 32 bytes. `KeyDeriverSpec` is now the general Argon2id parameter type rather than the type of `Argon2idWebV1` alone. Stored vaults are untouched: a vault still records only its `key_deriver_label`.
