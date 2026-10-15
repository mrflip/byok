# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information, and keep several
  passphrases, any of which opens the vault
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, and ship as packages of their own -- `safebyok-indexeddb` for a vault kept in this
browser, `safebyok-convex` for Convex. The IndexedDB device store ships in `safebyok/idb`.
`safebyok/testing` is for tests only, star-imported as `TH`: a cheap key deriver, a vault's
options over stores in memory (`memoryVaultOpts`), shape-valid records with fake ciphertext, a
live device unlock, small timing and tampering aids, a way to hold or slip work into an
adapter's next call (`holdNextCall`, `beforeNextCall`) and to count its storage watches
(`tallyWatches`), a logger that keeps what it hears (`spyLogger`), checks that a call refuses
(`expectRefusal`) and that what it threw quotes nothing it should not (`thrownText`,
`leafTexts`), and `describeVaultDB` and `describeDeviceDB`, the vitest suites every storage
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
import { idbVaultDB } from 'safebyok-indexeddb'

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
* `safebyok/idb` -- the IndexedDB device store, `idbDeviceDB`, and `inspectIdbDeviceDB`, a raw
  window onto its rows for a debug panel. The IndexedDB vault store, `idbVaultDB`, is a package
  of its own, `safebyok-indexeddb`.

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
* **Another implementation of a spec**: `safebyok-argon2-wasm` runs any of them through
  WebAssembly, several times faster, deriving the same bytes. For one native to your platform,
  spread the spec into your deriver, `{ ...Argon2idWebV1, deriveKeyBytes }`, keeping its label,
  and test that it derives the same bytes as ours; `parseKeyDeriverSpec(spec)` checks a host's
  spec exactly as `argon2idDeriver` does. `openVault` refuses a deriver that wears a supplied spec's label
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

## Several passphrases

A vault may have up to `MaxUnlocks` (8) passphrases and passkeys together, each its own way in: a daily one, one
written down at home, one a partner holds. Each wraps the same vaultKey under its own salt, no
passphrase is ever stored, and adding or removing one rewrites no lockbox. The snapshot lists
them, locked or not, as `unlocks`: each a `method` (`passphrase`), an `unlock_id`, and the
`unlocklabel` the user chose.

```ts
vault.getSnapshot().unlocks       // [{ method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase' }]

const spareId = await vault.addPassphrase(passphrase, spare, { unlocklabel: 'written_down' })
await vault.changePassphrase(spare, renewedSpare)       // changes that one; the first still opens
await vault.removeUnlock(passphrase, spareId)           // never the last one: 'last_unlock'
await vault.unlock(passphrase, { unlockId })            // aimed at one: a single key derivation
```

* **Every change asks for a passphrase**, even on an unlocked vault: the vault keeps no copy of
  its vaultKey it could wrap anew, and a walked-away unlocked screen should not be able to add a
  way in. Any passphrase the vault opens with will do.
* **Every change locks the other devices.** It moves the bundle's `unlock_epoch`, so each
  other device falls back to `locked` and must unlock with a passphrase still standing. This
  device stays unlocked.
* **An unlock not aimed at one tries each in turn**, one key derivation apiece: about 0.6 s each
  with the browser's deriver, so a mistyped passphrase in a vault of eight takes about five
  seconds to refuse. A host that knows which one the user means (a picker over `unlocks`) passes
  its `unlockId`.
* **Removal is not revocation.** A removed passphrase stops opening the vault from here on, but
  whoever knew it and kept a copy of the bundle from before can still open that copy, and the
  vaultKey inside is the one the vault still uses. There is no key rotation yet.

## Fingerprint unlock (passkeys)

A vault's ways in may include passkeys: a fingerprint, a face, a phone or a security key, whose
authenticator answers for the vault through the WebAuthn PRF extension. The core never calls
WebAuthn: it takes the answer as a `PasskeyProof` (`{ credentialId, prfSaltB64, prfBytes }`),
which `safebyok-react`'s `createPasskey` and `askPasskey` make (they import no React, so any
framework's host can use them).

```ts
// The vault checks the passphrase first, then calls createPasskey: a wrong one makes no passkey.
const unlockId = await vault.addPasskey(passphrase, () => createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } }), { unlocklabel: 'laptop' })
// unlockId is null if the user dismissed the prompt

vault.getSnapshot().unlocks       // [..., { method: 'passkey', unlock_id, unlocklabel: 'laptop', credential_id, prf_salt_b64 }]

const answer = await askPasskey(vault.getSnapshot().unlocks)   // null if the user dismissed it
if (answer !== null) { await vault.unlock(answer) }             // no key derivation to wait for
```

* **A passkey is a way in like a passphrase.** Its envelope wraps the same vaultKey, under a key
  made from the passkey's answer by HKDF-SHA256; an unlock with it is remembered on the device
  for `forcePassphraseReentryHours`, and `askPassphraseAt` applies, as for a passphrase. It counts
  toward `MaxUnlocks`.
* **Adding one asks for proof**, a passphrase or another passkey's answer, as every change to the
  ways in does; `addPassphrase` and `removeUnlock` take a passkey's answer as proof too.
  `changePassphrase` changes a passphrase only.
* **A passkey can stand in for a forgotten passphrase**: `addPassphrase(answer, fresh, {
  unlocklabel })`, then `removeUnlock(answer, oldId)`. But **a vault always keeps a passphrase**:
  removing the last one refuses with kind `last_unlock`, since a passkey can be lost with its
  device. A vault is created with a passphrase, too: a passkey's `unlock()` on an `absent` vault
  refuses with `absent_vault`.
* **Where it works.** A passkey answers on the device that holds it: a platform passkey synced by
  iCloud Keychain or Google Password Manager on every device signed in to that account, a security
  key wherever it is plugged in. Browsers and authenticators without PRF refuse with kind
  `passkey_unavailable`; offer the passphrase then.
* **Removal is not revocation**, here as for a passphrase: a removed passkey still opens a copy of
  the bundle kept from before.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does. A passkey added beforehand is the one way back in: with it the
user sets a new passphrase.

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
| `bad_label`           | a label (or the `userId`) that fails the rules, or an `unlocklabel` the vault already has | Pass labels the app chose; check a user-typed one first with `Label`, and against the snapshot's `unlocks` |
| `bad_whisper`         | a whisper JSON cannot carry (`undefined`, a function, a class instance) | Store plain JSON; to empty a lockbox, `erase` it |
| `bad_option`          | an option or argument out of its range: an `openVault` option, an `argon2idDeriver` spec, a `store()` note, a passphrase or callback of the wrong type, a record handed to a `VaultDB` write; a passkey's answer of the wrong shape, or one already a way in | Fix the call; the message names what it takes |
| `vault_closed`        | the vault handle was closed                                      | Open the vault again; do not use a handle after `close()` |
| `unknown_key_deriver` | the vault names a key deriver this handle was not built with     | Update safebyok, or open the vault with the deriver that made it |

### Conditions: handle them at run time

Part of normal operation. Each can reach the user; the app decides how.

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `vault_locked`        | a whisper was asked for before the vault was unlocked            | Ask for the passphrase and `unlock()`, then retry (`safebyok-react`'s `withUnlockedVault` does) |
| `wrong_passphrase`    | the passphrase did not unlock the vault, or was empty            | Ask again                                               |
| `wrong_passkey`       | the passkey's answer did not unlock the vault, or answered for another salt | Ask the passkey again, or ask for a passphrase  |
| `passkey_unavailable` | this browser or authenticator cannot answer for a passkey unlock: no WebAuthn, or no PRF extension | Offer the passphrase instead; on `createPasskey`, tell the user this device cannot be a fingerprint unlock |
| `absent_box`          | no lockbox under that label                                      | Offer to create it, or refresh the list: it may have been erased elsewhere |
| `absent_vault`        | the vault has never been created, or was deleted elsewhere, and the call will not create it | Unlock with a new passphrase to create it |
| `absent_unlock`       | no way into the vault has that `unlock_id`, or is the passkey that answered: it may have been removed on another device | Look again at the snapshot's `unlocks`, and ask the user which they mean |
| `whisper_too_large`   | a whisper over the vault's `maxWhisperBytes`                     | Tell the user it is too large; a host that means to allow more passes a larger `maxWhisperBytes` |
| `vault_full`          | a new lockbox in a vault already holding its `maxLockboxes`, or a write the storage backend has no room for | Tell the user to erase a lockbox first; the host may raise `maxLockboxes` where the backend allows |
| `too_many_unlocks`    | a passphrase or passkey added to a vault already holding `MaxUnlocks` (8) ways in | Tell the user to remove one first             |
| `last_unlock`         | removing the vault's last passphrase: a vault always keeps one, since a passkey can be lost with its device | Add another passphrase first; to be rid of the vault, `destroy()` it |
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
