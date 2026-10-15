# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `VaultProvider` -- opens the vault for the signed-in user (`userId` prop from your auth) and
  keeps it matched to that identity; renders the passphrase dialog when an action run through
  `withUnlockedVault` finds the vault locked.
* `useVault()` -- the vault handle and `withUnlockedVault()`, which wraps any action that touches
  a whisper: on `vault_locked` it asks for the passphrase and retries, and resolves `null` if
  dismissed (unambiguous for reads: a whisper is never null). Beside them, `openError` and
  `retryOpen()` for an open that failed (below).
* `useVaultSnapshot()` -- the live snapshot via `useSyncExternalStore`.
* `PassphraseModal` -- the default dialog: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress. It says how long an unlock lasts on the device -- "Locks
  again on this device in 7 days", "in 15 minutes", "Stays unlocked ... until you lock it" -- read from the vault itself (its
  `reentryWindowMs`, the `forcePassphraseReentryHours` it was opened with). A wrong
  passphrase, or any other condition the unlock meets (storage out of reach), shows in the dialog
  in place; misuse is thrown while rendering, to your error boundary.

## Install

```sh
pnpm add safebyok safebyok-react react
```

`safebyok` and `react` are peer dependencies: the host app installs them itself, so the binding and
the app share one copy of each.

## Use

```tsx
import { browserOpts } from 'safebyok/browser'
import { VaultProvider } from 'safebyok-react'

<VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
  vaultDB={vaultDB}>
  <App />
</VaultProvider>
```

The provider takes every `openVault` option as a prop. `browserOpts()` supplies the two a browser
app answers like any other, `keyDeriver` and `deviceDB`; `vaultDB` is your backend's adapter. It
answers the same bag on every call, so it is safe in a render: the provider reopens the vault
whenever a prop changes identity. So define a `logger` or a `clock` once, outside the component (or
memoize it): an object literal written in the props is a new one at every render, and reopens
the vault each time. `validators` is the one exception: the provider watches each schema in the
bag rather than the bag, so `validators={{ boxlabel: BoxlabelCheck }}` is fine in the props, so
long as `BoxlabelCheck` itself is built once, at module level.

## When opening fails

What happens when `openVault` rejects depends on the error's family (safebyok's
`VaultErrorFamilyForKind`): who has to act. The `safebyok` README's *Errors* section lists every
kind, its family, and what it means.

**A condition stays in place.** Storage that cannot be reached (`storage_unavailable`), a user
storage will not serve (`not_permitted`, as when signed out of the backend) or a stored vault
bundle that fails verification (`corrupt_record`) arrives as `openError`, a `VaultError`, with
`vault` still null. (A damaged lockbox never stops the open: the snapshot lists it with
`damaged: true`, for your UI to offer `erase()` or a fresh `store()`; see the `safebyok`
README's *Damaged lockboxes*.) Show it where the vault's UI would be, and offer `retryOpen()`, which clears it and
opens again; a failed open leaves no storage watch behind, so retrying costs nothing:

```tsx
const VaultPanel = () => {
  const { vault, openError, retryOpen } = useVault()
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  if (vault === null) { return <p>Opening your vault…</p> }
  return <Lockboxes vault={vault} />
}
```

Branch on `openError.kind` for a better message: a `not_permitted` user should sign in again,
and a `corrupt_record` will not mend on retry. Its `message` is calm and safe to show.

**Misuse goes to your error boundary.** A bad label or option -- a bug in the app's code -- is
thrown while rendering, as is anything rejected that is not a `VaultError`. Wrap the provider in
an error boundary, keyed on the user's identity, so the dev overlay or the boundary's fallback
shows it and a different user (or a sign-out and back in) gets a fresh attempt:

```tsx
<ErrorBoundary key={userId ?? 'signed-out'} fallback={<VaultTroubleNotice />}>
  <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB}>
    <App />
  </VaultProvider>
</ErrorBoundary>
```

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
