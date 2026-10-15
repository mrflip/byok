# Thread 3: provider_open_rejection (2026-10-15)

Branch `20261015-provider_open_rejection`, PR not yet filed, cut from `origin/main`. Justify: green
(core 242, convex 210, react 10, demo 24 tests; root 67).

* **Built**: `VaultProvider` (`packages/safebyok-react/src/vault-provider.tsx`) holds an
  `openVault` rejection in state (`openFailure`, the error wrapped in `{ err }` so a rejection of
  any value, even `null`, still reads as failed) and throws it during render, after every hook
  has run. A rejection arriving after the effect was cleaned up (user signed out, props changed)
  is ignored, and cleanup clears a held failure, so a new identity gets a fresh attempt. Three
  tests in `tests/vault-provider.test.tsx`: a bad label throws to a boundary as the very
  `bad_label` `VaultError`; a storage failure (`storage_unavailable` from `readBundle`) does too;
  a null user opens nothing and throws nothing even with a bad label. The doc block says so.
  Changeset `.changeset/provider_open_rejection.md`: `safebyok-react` patch.
* **Decisions taken**: the error is thrown as-is, not wrapped: it is already a `VaultError` with
  a `kind` and no secret in it, and a boundary can branch on it. `then(ok, onRejected)` rather
  than `.catch`, so only `openVault`'s rejection is caught, not a failure inside the success path.
  The edit is confined to the open effect, the error state and the render throw, so threads 1
  and 2 (props on the same provider) rebase mechanically.
* **Discoveries**: `open_vault_unsubscribe` (uncommitted in `/workspace/byok-open_vault_unsubscribe`)
  changes `openVault` itself to `close()` and rethrow when its first `refresh()` or
  `rememberedUnlock()` fails, so the storage watch is not leaked. That is the core half; this
  thread needs nothing from it, and the two meet only on the same failure path: with both, a
  rejected open leaves no watch and the provider shows the error. Its diff still uses pre-move
  paths (`src/vault.ts`, `tests/vault.test.ts`), so it needs repathing to `packages/safebyok/`
  before it can land. Nothing was carried over.
* **For the Coach**: the demo (`demos/safebyok-demo-react`) has no error boundary, so a bad
  option there now reaches React's default (the dev overlay in dev, a blank tree in production).
  A host that wants a friendlier page wraps `VaultProvider` in a boundary; the README does not
  yet say so (a candidate for the docs sweep).
