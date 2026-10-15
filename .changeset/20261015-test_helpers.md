---
'safebyok': minor
---

`safebyok/testing` gains helpers for a host's or an adapter's own tests, each additive:

* `memoryVaultOpts(overrides?)`: everything `openVault` needs, over fresh in-memory stores and the cheap test deriver, for `u1`'s `main` vault in the `acme` app.
* `describeDeviceDB(title, makeDeviceDB)`: the suite every `DeviceDB` owes, as `describeVaultDB` is for a `VaultDB`.
* `holdNextCall(target, verb)` and `beforeNextCall(target, verb, meanwhile)`: hold an adapter's next call at a gate, or run something inside it first, to land one call in the middle of another.
* `tallyWatches(vaultDB)`: a live count of the storage watches an adapter opens and closes, to check that nothing is left watching.
* `freshDbName()`: a database name no other test uses, for the IndexedDB adapters.
* `noBoxYet` and `thisVault`: the expectations a write or an erase into `bundleOf('u1')`'s vault carries.

Nothing already exported changes.
