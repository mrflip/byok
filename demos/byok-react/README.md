# byok-react-demo

A single-page React playground for designing the byok interface. It is a workspace package that
is never published and never grows into its own repository.

```sh
pnpm install     # from the repo root
pnpm dev         # from demos/byok-react; opens the playground
pnpm justify     # lint, typecheck, test (vitest, no browser automation)
```

## ⚠️ Nothing here is encrypted

The `src/byok/` stub stores whispers and passphrases in **plaintext** so the inspector can show
where every piece of data lives. It sketches the real package's interface -- the method names,
the error kinds, the locked/unlocked flow, the storage seams -- with none of its cryptography.
Nothing in this demo may graduate into the root `src/` without the crypto underneath.

## Vocabulary

* **whisper** -- the data kept secret: any JSON value.
* **lockbox** -- a whisper, the label that names it, and its public metadata (`note`, timestamps).
* **vault** -- a user's collection of lockboxes, scoped by app label, user id, and vault label.

## The page

The top half is "the app": sign in by typing a username (you are signed up on first sight), then
add, view, edit, delete, or *use* lockboxes. Whisper-touching actions summon the passphrase
dialog only when the vault is actually locked; an unlock is remembered on the device for seven
days. The bottom half is the inspector: the raw rows of the pretend-backend store and the
device-local store, rendered straight from storage by machinery that never talks to the vault.

## Three layers, deliberately separated

| Layer | Where | What it is |
|---|---|---|
| the library | `src/byok/` | The interface being designed: `openVault`, lock state, `store`/`read`/`use`/`erase`, storage adapters (`VaultDB`, `DeviceDB`), error kinds. Imported only via `src/byok/index.ts`, its pretend public surface. |
| scaffolding | `src/scaffold/` | What a host app adapts rather than copies: a fake auth whose Session is the shape auth must supply, the vault-follows-session provider, the `guard()` ask-on-demand flow, the passphrase dialog. |
| demo jank | `src/demo/` | What only this page needs: localStorage wiring, the lockbox table, the "Pssst" modal, the inspector. |

Tests live in `tests/`, mirroring `src/` path for path, and cover the machinery (stub vault,
stores, adapters, auth scaffold) -- not the React furniture.
