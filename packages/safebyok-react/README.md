# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `VaultProvider` -- opens the vault for the signed-in user (`userId` prop from your auth) and
  keeps it matched to that identity; renders the passphrase dialog when an action run through
  `withUnlockedVault` finds the vault locked.
* `useVault()` -- the vault handle and `withUnlockedVault()`, which wraps any action that touches
  a whisper: on `vault_locked` it asks for the passphrase and retries, and resolves `null` if
  dismissed (unambiguous for reads: a whisper is never null).
* `useVaultSnapshot()` -- the live snapshot via `useSyncExternalStore`.
* `PassphraseModal` -- the default dialog: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress.

## Install

```sh
pnpm add safebyok safebyok-react react
```

`safebyok` and `react` are peer dependencies: the host app installs them itself, so the binding and
the app share one copy of each.

## When opening fails

If `openVault` rejects -- a bad label or option, or storage that cannot be reached -- the provider
throws that error while rendering. Wrap it in an error boundary, keyed on the user's identity, so
the boundary's fallback shows the failure and a different user (or a sign-out and back in) gets a
fresh attempt:

```tsx
<ErrorBoundary key={userId ?? 'signed-out'} fallback={<VaultTroubleNotice />}>
  <VaultProvider applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB} deviceDB={deviceDB} keyDeriver={keyDeriver}>
    <App />
  </VaultProvider>
</ErrorBoundary>
```

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The tests, typecheck and build resolve
`safebyok` through its built `dist/`, as a consumer's would; each script builds the core first by
itself (`pnpm build:deps`), so a fresh clone needs no prebuild step.
