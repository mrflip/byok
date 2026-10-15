# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, IndexedDB adapters ship in `safebyok/idb`, and a Convex adapter is planned.
`whiteboard/20261013-relic/proposed-README.md` drafts the full README for when the surface
settles.

## Quickstart

```ts
import { openVault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { idbVaultDB } from 'safebyok/idb'

const vault = await openVault({
  applabel:   'acme',
  userId:     session.userId,                 // stable and opaque, from your auth; never an email
  vaultlabel: 'main',
  vaultDB:    idbVaultDB({ dbName: 'acme' }), // or your backend's adapter
  ...browserOpts({ dbName: 'acme' }),         // the key deriver and device store a browser wants
})

vault.getSnapshot().state         // 'absent' | 'locked' | 'unlocked'
await vault.unlock(passphrase)    // on an absent vault, this first unlock creates it
await vault.store('anthropic_api_key', 'sk-ant-...')

const answer = await vault.use('anthropic_api_key', (whisper) => callAnthropic(whisper))
```

The vault store is never among the defaults: where the vault lives is the one choice every app
makes for itself. Any option you pass after the spread replaces the default it names.

## Entry points, and why the main one asks for everything

* `safebyok` -- `openVault` and the types, errors and stores around it.
* `safebyok/browser` -- `browserOpts({ dbName }?)`: the pinned Argon2id key deriver
  (`argon2idWebV1Deriver`) and the IndexedDB device store (`idbDeviceDB`), as a bag of options.
* `safebyok/idb` -- the IndexedDB adapters, `idbVaultDB` and `idbDeviceDB`.

`openVault` takes its `keyDeriver` and `deviceDB` from you, with no default behind them. A
default would be imported by `openVault` itself, so every app would ship it, used or not: a
bundler drops only the code nothing imports. The key deriver is the choice an app most plausibly
makes differently -- another implementation of the same Argon2id spec, in WebAssembly or native
to its platform -- and such an app should not also ship this one (about 15 kB minified). So the
main entry names no default and imports nothing from `safebyok/browser`, and the package is
marked `sideEffects: false`: what you never import never ships.
