# byok-react

The thin React binding for byok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `VaultProvider` -- opens the vault for the signed-in user (`userId` prop from your auth) and
  keeps it matched to that identity; renders the passphrase dialog when a guarded action finds
  the vault locked.
* `useVault()` -- the vault handle and `guard()`, which wraps any action that touches a whisper:
  on `vault_locked` it asks for the passphrase and retries, and resolves `null` if dismissed.
* `useVaultSnapshot()` -- the live snapshot via `useSyncExternalStore`.
* `PassphraseModal` -- the default dialog: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress.

A workspace package, source-exported (`exports` points at `src/index.ts`) while the interface
settles; not yet built or published. `pnpm justify` here runs its lint, typecheck and tests
(vitest + testing-library under jsdom).
