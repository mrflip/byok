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
`safebyok/utils` holds small helpers for the app around the vault, such as `mask`, which shows
which API key a lockbox holds (`sk***...***wxyz`) without showing the key. `mask` is intended
for plain text; calling it with arbitrary blobs may give unusual behavior.
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

## Locking

An unlocked vault stays unlocked until its remembered unlock expires
(`forcePassphraseReentryHours`, seven days by default) or `vault.lock()` is called. `lock()` forgets the unlock in memory and on this device
alike, so the user types their passphrase again afterwards. The core cannot watch for a locked
screen or a hidden tab (it runs where there is no `document`), so locking on those signals is a
few lines in the host app:

```ts
const lockWhenHidden = (vault: Vault) => {
  const onChange = () => { if (document.hidden) { vault.lock().catch(() => {}) } }
  document.addEventListener('visibilitychange', onChange)
  return () => { document.removeEventListener('visibilitychange', onChange) }
}
```

Call the function it returns when you close the vault (for instance on sign-out); the `catch`
covers a `lock()` that races a `close()`.

`visibilitychange` fires when the user switches tabs or the screen locks, which is as close to a
screen-lock signal as every browser offers; Chromium's permission-gated Idle Detection API is the
only true one. The line trades the remembered unlock away: each time the user comes back to the
tab, the vault asks for the passphrase again. When `lockSoon()` lands, it is the gentler callee
for this line (and for sign-out): it lets work already in hand finish before the key dies.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does.
