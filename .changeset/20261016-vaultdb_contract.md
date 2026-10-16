---
"safebyok": minor
---

The VaultDB contract, written down: `VAULTDB.md`, shipped in the package, says in numbered lines what every storage adapter promises -- records read back whole, versioned writes, whole listings, a lockbox limit kept on a best effort, calm errors -- what it may leave undone, and which layer owns what (the adapter its atomic compare-and-write, the vault the read before it and the retry after it). `describeVaultDB` from `safebyok/testing` now runs one group of tests per line, each titled by its line, and `VaultDBContract` names the lines for an adapter's own tests to cite.

`describeVaultDB` takes a third, optional argument: `makeCappedVaultDB`, a factory for an adapter held to a given `maxLockboxes`, which runs the lockbox limit's lines (4.2 to 4.5), and `makeVaultDBFor`, a fresh backend as a way to sign in to it as any user or none, which runs line 5.4 (another user, or no one, is refused every verb as `identity_revoked`, reading and writing nothing); without them those lines are skipped. The battery also gains tests for lines it did not cover: a write seen by the next read, a listing of many lockboxes left whole, two devices creating a bundle at once, a refused write leaving the whole vault as it stood, writes to different lockboxes made at once all landing, the declared `maxLockboxes`, and refusals quoting nothing. An adapter that passed before may meet them for the first time; every adapter in this repository passes. Its group titles changed (`<adapter>, as a VaultDB, 3.3: ...`), so a filter on the old titles needs updating.

`VaultDB.maxLockboxes`'s doc now says what the contract says: a backend's limit is a best effort, which writers racing for the last places may pass by a few, and never stops a replacement.
