# safebyok

Store user data encrypted at rest, only accessible on the user's device. Bring Your Own Key (BYOK)
Browser Vault uses E2EE (End-to-end Encryption) and pluggable remote storage to ensure secrets are
decrypted where the app runs, using keys that never leave the device. The backend only ever holds
ciphertext: unrecoverable even with a copy of the database, the application, and its environments.

This repository is a pnpm workspace. Its packages:

* [`safebyok`](packages/safebyok) -- the vault itself, with IndexedDB adapters in `safebyok/idb` and display helpers (`mask`) in `safebyok/utils`.
* [`safebyok-react`](packages/safebyok-react) -- the React binding: a provider, snapshot hooks,
  and a guard that asks for the passphrase on demand.
* [`safebyok-convex`](packages/safebyok-convex) -- Convex storage: a Convex component, and the
  `VaultDB` adapter that speaks to it.
* [`safebyok-argon2-wasm`](packages/safebyok-argon2-wasm) -- Argon2id through WebAssembly: a
  key deriver several times faster than the core's, deriving the same bytes under the same specs.
* [`safebyok-demo-react`](demos/safebyok-demo-react) -- a playground app; never published.

`pnpm install`, then `pnpm justify` lints, typechecks, tests and builds every package.
[CONTRIBUTING.md](CONTRIBUTING.md) has the rest.
