# safebyok-demo-react

A single-page React playground for the safebyok interface: a workspace package that is never
published and never grows into its own repository.

```sh
pnpm demo:react              # from the repo root: builds safebyok, then opens the playground
pnpm justify                 # from demos/safebyok-demo-react: lint, typecheck, test (vitest only)
```

## Encrypted for real

Whispers are encrypted on this device before anything reaches storage: the inspection panels show
the ciphertext rows a backend would hold, and the remembered unlock around a key handle the
browser will not export. The vault's records live in IndexedDB (through `safebyok/idb`); only the
fake auth's scaffolding rows sit in localStorage.

## The page

* **The Knock-Knock Machine** ([src/components/KnockKnock.tsx](src/components/KnockKnock.tsx)) --
  the "app". Save your Anthropic API key once (it goes into the vault as the lockbox
  `anthropic_api_key`), type who's there, and hit *(( … Who? ))*: the key is decrypted on-device
  inside `vault.use(...)` and sent browser-to-Anthropic (Claude Haiku, the cheapest model) for a
  punchline. No server of ours ever sees the key.
* **Vault dashboard** ([src/components/VaultDashboard.tsx](src/components/VaultDashboard.tsx)) --
  direct manipulation of the vault: add, view, edit, delete and *use* lockboxes. Whisper-touching
  actions summon the passphrase dialog only when the vault is actually locked; an unlock is
  remembered on the device for seven days. Signing out locks the vault.
* **Inspection panels** ([src/components/inspection/](src/components/inspection/)) -- the raw
  rows of the pretend-backend store and the device-local store, rendered straight from storage by
  machinery that never talks to the vault. **To delete them:** remove the two tagged lines (and
  imports) in [src/App.tsx](src/App.tsx), then delete `src/components/inspection/`. What remains
  is the app as a host would actually build it.

## Where the layers live

| Layer | Where |
|---|---|
| the library | the `safebyok` workspace package (`packages/safebyok/src/`) |
| React plumbing | the `safebyok-react` workspace package (provider, hooks, passphrase dialog) |
| app scaffolding a host replaces | [src/lib/auth.ts](src/lib/auth.ts) (fake sign-in; a real app brings its own auth and passes `userId` to the provider), [src/lib/stores.ts](src/lib/stores.ts) (this browser's IndexedDB standing in for a backend) |
| the app itself | [src/components/](src/components/), [src/lib/anthropic.ts](src/lib/anthropic.ts) |

Tests live in `tests/`, mirroring `src/`, and cover the demo's machinery (auth scaffold, whisper
text handling, the Anthropic request shape via an injected fetch) -- not the React furniture. The
vault and provider are tested in their own packages.
