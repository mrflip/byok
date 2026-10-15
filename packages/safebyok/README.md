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
(`forcePassphraseReentryHours`, seven days by default) or the host locks it. `Infinity` hours
means never on this device, until a lock: `askPassphraseAt` then equals the exported `FarFuture`,
the latest instant a `Date` can hold, so a host can show "until locked" by comparing against it,
and `new Date(askPassphraseAt)` still works.

Two calls lock, and each forgets the unlock in memory and on this device alike, so the user types
their passphrase again afterwards:

* **`vault.lock()`** locks at once. Use it for a real lock signal: a Lock button, or a locked
  screen.
* **`vault.lockSoon(graceSeconds = 5)`** locks gently. Use it when the user steps away: a hidden
  tab, a sign-out. From the instant it is called the snapshot reads `locked`, every read, use,
  store or erase called afterwards throws kind `vault_locked`, and this device forgets its
  remembered unlock; but work already under way (a `store()` retrying after another device's
  write, say) keeps the key to finish, until it is dropped `graceSeconds` later. An `unlock()`
  (or a `changePassphrase()`, which proves the passphrase too) within the grace ends it. The
  grace is at most 60 seconds; `lockSoon(0)` is `lock()`.

Either one wins over an unlock still under way: that `unlock()` throws kind `vault_locked` and
remembers nothing, so a vault locked while the passphrase was being checked stays locked.
`close()` is not a lock -- the remembered unlock stays, for the next open -- but it ends a
`lockSoon()` grace at once, and an unlock under way on the closed handle takes nothing up.

**Locking ends the remembered unlock.** A host that wants "stay unlocked on this device for a
week" should not lock on tab-away: each time the user comes back to the tab, the vault would ask
for the passphrase again. Lock on the signals your users mean as "lock it".

### A screen-lock recipe

The core cannot watch for a locked screen or a hidden tab (it runs where there is no
`document`), so locking on those signals is a few lines in the host app. `visibilitychange`
fires when the user switches tabs or the screen locks, which is as close to a screen-lock signal
as every browser offers; it also fires for a tab merely switched away from, so it calls the
gentle one:

```ts
const lockWhenHidden = (vault: Vault) => {
  const onChange = () => { if (document.hidden) { vault.lockSoon().catch(() => {}) } }
  document.addEventListener('visibilitychange', onChange)
  return () => { document.removeEventListener('visibilitychange', onChange) }
}
```

Call the function it returns when you close the vault; the `catch` covers a `lockSoon()` that
races a `close()`. Chromium's Idle Detection API, behind a permission the user grants, is the
only true screen-lock signal, and a locked screen is the user meaning it, so it calls `lock()`:

```ts
if (await IdleDetector.requestPermission() === 'granted') {   // from a click: it needs a user gesture
  const idle = new IdleDetector()
  idle.addEventListener('change', () => { if (idle.screenState === 'locked') { vault.lock().catch(() => {}) } })
  await idle.start({ threshold: 60_000, signal: aborter.signal })   // aborter.abort() when you close the vault
}
```

For a sign-out, call `lockSoon()` first, then close the handle (in React, unmount the provider)
once what was under way has settled: closing ends the grace at once.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does.
