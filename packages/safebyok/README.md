# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, IndexedDB adapters ship in `safebyok/idb`, and a Convex adapter is planned.
`safebyok/testing` is for tests only: a cheap key deriver, shape-valid records with fake
ciphertext, and `describeVaultDB`, the vitest suite every storage adapter owes.
`whiteboard/20261013-relic/proposed-README.md` drafts the full README for when the surface
settles.
