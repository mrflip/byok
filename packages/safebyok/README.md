# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, IndexedDB adapters ship in `safebyok/idb`, and a Convex adapter is planned.
`safebyok/testing` is for tests only, star-imported as `TH`: a cheap key deriver, shape-valid
records with fake ciphertext, a live device unlock, small timing and tampering aids, a logger
that keeps what it hears (`spyLogger`), and `describeVaultDB`, the vitest suite every storage
adapter owes.
`safebyok/utils` holds small helpers for the app around the vault, such as `mask`, which shows
which API key a lockbox holds (`sk***...***wxyz`) without showing the key. `mask` is intended
for plain text; calling it with arbitrary blobs may give unusual behavior. It strips every
combining mark, so a script that writes its vowels as marks loses them (Hindi `नमस्ते` comes out as
`नमसत`); an API key is ASCII, and is untouched.
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

## Key derivation

The passphraseKey is made by Argon2id at a keyDeriverSpec: its parameters under a
`key_deriver_label`, which every vault stores. A label must always mean the same parameters, or
vaults made on one device stop opening on another. There are three ways to choose:

* **The supplied spec**, `Argon2idWebV1`: 64 MiB, 3 passes, 1 lane, a 16-byte salt and a 32-byte
  key. Its deriver, `argon2idWebV1Deriver`, is what `browserOpts()` hands over. Use it unless you
  have a reason not to.
* **A spec of your own**, through `argon2idDeriver`:

  ```ts
  const keyDeriver = argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
  ```

  Give it a label of your own, and never change its parameters once a vault is made under it.
  It refuses (`bad_option`) what Argon2id cannot run -- a salt under 8 bytes or over 65536,
  memory under 8 KiB a lane or over 1 GiB, no passes or lanes, a key other than 32 bytes -- and
  allows weak parameters that run: those are yours to judge.
* **Another implementation of a spec** (WebAssembly, or native to your platform): spread the spec
  into your deriver, `{ ...Argon2idWebV1, deriveKeyBytes }`, keeping its label, and test that it
  derives the same bytes as ours. `openVault` refuses a deriver that wears a supplied spec's label
  without carrying exactly its parameters; it cannot check the bytes, so that test is yours.

Any `keyDeriver` needs a `salt_bytes` from 1 to 65536 (the most `crypto.getRandomValues` hands out
at once), and must hand back 32 bytes from `deriveKeyBytes`; `openVault` and `unlock()` refuse one
that does not, with `bad_option`.

## Locking

An unlocked vault stays unlocked until its remembered unlock expires
(`forcePassphraseReentryHours`, seven days by default) or the host locks it. `Infinity` hours
means never on this device, until a lock: `askPassphraseAt` then equals the exported `FarFuture`,
the latest instant the package accepts (in 2255), so a host can show "until locked" by comparing
against it.

Lowering the option later takes hold on each device at its next open: an unlock remembered under
the longer setting, whose deadline lies past the new number of hours from then, is forgotten, and
the user types their passphrase again. Raising it lengthens no unlock already remembered.

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
const aborter = new AbortController()   // aborter.abort() when you close the vault
if (await IdleDetector.requestPermission() === 'granted') {   // from a click: it needs a user gesture
  const idle = new IdleDetector()
  idle.addEventListener('change', () => { if (idle.screenState === 'locked') { vault.lock().catch(() => {}) } })
  await idle.start({ threshold: 60_000, signal: aborter.signal })
}
```

TypeScript's DOM types do not carry `IdleDetector` yet; declare it, or take it from a types
package, before this compiles.

For a sign-out, call `lockSoon()` first, then close the handle (in React, unmount the provider)
once what was under way has settled: closing ends the grace at once.

## Logging

Some things a vault cannot throw to anyone: they happen in the background, or in a call that
must not fail. It says them to its logger, which `openVault` takes as `logger`, an object with
three functions, each `(message?, story?, err?) => void`:

```ts
const vault = await openVault({
  ...opts,
  logger: {
    log:   (message, story) => { telemetry.info(message, story) },
    warn:  (message, story, err) => { telemetry.warn(message, story, err) },
    error: (message, story, err) => { telemetry.error(message, story, err) },
  },
})
```

With no logger, the vault writes to the console, each message tagged `safebyok:`. Pass functions
that do nothing for quiet, or `console` itself to drop the tag (it then prints a missing story or
error as `undefined` or `null`). A logger that throws, or returns
a promise that rejects, is ignored: logging never breaks a lock, an open or a store. Anything
else is refused as `bad_option`.

Each call is a plain-language `message`; a `story` naming the vault call it happened in
(`{ call: 'lockSoon' }`); and, when there is one, the error behind it, a `VaultError` or your own
(your clock's, your storage adapter's). The vault puts no whisper, passphrase, key, ciphertext or
option's value in any of the three, not even the `userId` or the labels: a host with several
vaults gives each its own logger, bound to whatever context it wants in its logs. An error of your
own goes as your code made it, as itself or as a `VaultError`'s `cause`, so what it quotes (a
storage client's error may quote the request it failed) is yours to keep clean. Today a vault
says four things:

* `warn`: `lockSoon()` could not read the clock, so it locked at once, without a grace.
* `warn`: this device's remembered unlock could not be read or would not open, so it was
  forgotten, and the vault opened locked. An unlock that simply ran out, or that a new
  passphrase outdated, is routine, and says nothing.
* `warn`: a background refresh failed -- one rung by a change in storage, or the catch-up after a
  write storage refused -- so the snapshot may lag behind storage until the next call, which
  meets the same trouble and throws it.
* `error`: a failed `openVault`, closing its storage watch, found the adapter's unsubscribe
  throwing. `openVault` still rejects with what stopped the open.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does.

## Errors

Every vault call that refuses throws a `VaultError` (`isVaultError(err, kind?)` tests for one),
with a calm message and a `kind` to branch on. The kinds are `VaultErrorKindVals`, and the
whole list: the storage adapters (`safebyok-convex`, your own) throw these same kinds, and no
package has others. An error never carries a whisper, a passphrase or any other secret, in its
message or as a property.

The kinds fall into two families, told apart by who must act.

### Misuse: fix the code

A programming error. Do not show it to the user and do not retry; let it reach an error boundary
or the dev overlay (in React, `VaultProvider` rethrows an `openVault` that fails on misuse during
render for that, and hands a condition down as `openError`).

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `bad_label`           | a label (or the `userId`) that fails the rules                   | Pass labels the app chose; check a user-typed one first with `Label` |
| `bad_whisper`         | a whisper JSON cannot carry (`undefined`, a function, a class instance) | Store plain JSON; to empty a lockbox, `erase` it |
| `bad_option`          | an `openVault` option, an `argon2idDeriver` spec, or a `store()` note, out of its range | Fix the option; the message names it                    |
| `vault_closed`        | the vault handle was closed                                      | Open the vault again; do not use a handle after `close()` |
| `unknown_key_deriver` | the vault names a key deriver this handle was not built with     | Update safebyok, or open the vault with the deriver that made it |

### Conditions: handle them at run time

Part of normal operation. Each can reach the user; the app decides how.

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `vault_locked`        | a whisper was asked for before the vault was unlocked            | Ask for the passphrase and `unlock()`, then retry (`safebyok-react`'s `withUnlockedVault` does) |
| `wrong_passphrase`    | the passphrase did not unlock the vault, or was empty            | Ask again                                               |
| `absent_box`          | no lockbox under that label                                      | Offer to create it, or refresh the list: it may have been erased elsewhere |
| `absent_vault`        | the vault has never been created, or was deleted elsewhere, and the call will not create it | Unlock with a new passphrase to create it |
| `whisper_too_large`   | a whisper over the vault's `maxWhisperBytes`                     | Tell the user it is too large; a host that means to allow more passes a larger `maxWhisperBytes` |
| `vault_full`          | a new lockbox in a vault already holding its `maxLockboxes`, or a write the storage backend has no room for | Tell the user to erase a lockbox first; the host may raise `maxLockboxes` where the backend allows |
| `corrupt_record`      | a stored record failed validation or decryption verification     | Nothing was changed. Do not retry; tell the user, and see a developer: the record is damaged, was moved, or came from a newer safebyok |
| `stale_write`         | storage changed since this device read it, so the write was refused | The vault has caught up: read again and, if it still applies, repeat. A `store()` retries by itself first |
| `not_permitted`       | the storage backend refused this user: signed out, or not theirs to reach | Have the user sign in again                             |
| `storage_unavailable` | the storage backend could not be reached, or failed              | Try again shortly; the adapter's own error is the `cause` |

`openVault` itself can refuse with `bad_option`, `bad_label`, and, as it reads the vault from
storage, `storage_unavailable`, `not_permitted` or `corrupt_record`: the last three are
conditions, though they surface at open. A refused open leaves nothing running behind it, so the
host simply opens again.

In code, `VaultErrorFamilyForKind` gives each kind's family (`VaultErrorFamilyVals`: `misuse`,
`condition`), and `isVaultCondition(err)` is true for a `VaultError` of the condition family:
show or retry those, and let anything else reach an error boundary.
