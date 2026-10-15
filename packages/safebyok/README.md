# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, IndexedDB adapters ship in `safebyok/idb`, and a Convex adapter is planned.
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
import { idbVaultDB } from 'safebyok/idb'

const vault = await openVault({
  applabel:   'acme',
  userId:     session.userId,                 // stable and opaque, from your auth, 1 to 100 characters; never an email
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
* `safebyok/validators` -- the checks for names and notes (`Label`, `UserId`, `LockboxNote`,
  `DefaultValidators`, `AnyTextValidators`), their bounds (`MaxLabelChars`, `LabelPattern`,
  `MaxUserIdChars`, `MaxNoteChars`) and the `Whisper` and `EpochMillis` schemas, for a form, a
  server or another library to check what the vault will. All are in the main entry too.

`openVault` takes its `keyDeriver` and `deviceDB` from you, with no default behind them. A
default would be imported by `openVault` itself, so every app would ship it, used or not: a
bundler drops only the code nothing imports. The key deriver is the choice an app most plausibly
makes differently -- another implementation of the same Argon2id spec, in WebAssembly or native
to its platform -- and such an app should not also ship this one (about 15 kB minified). So the
main entry names no default and imports nothing from `safebyok/browser`, and the package is
marked `sideEffects: false`: what you never import never ships.

## Names, notes, and your own checks

By default a label (`applabel`, `vaultlabel`, `boxlabel`) is lowercase words of letters and
digits joined by single underscores, 2 to 40 characters (`Label`); a `userId` is text of 1 to 100
characters (`UserId`); and a note is text of at most 256 characters (`LockboxNote`). That suits
API keys. A host that wants more -- labels in Hebrew, Arabic or Thai, a password manager's
long notes, its own auth's id shape -- passes its own Zod schemas as `validators`, and each
**replaces** ours outright:

```ts
import * as z from 'zod'
import { AnyTextValidators, UserId } from 'safebyok/validators'

// Built once, at module level.
const validators = {
  ...AnyTextValidators,                                 // labels and notes of any text
  boxlabel: z.string().min(1).max(200),                 // ...but box names of 1 to 200 characters
  userId:   z.string().regex(/^user_[A-Za-z0-9]{27}$/), // and Clerk's user ids
}
const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, validators, ...browserOpts() })
await vault.store('מפתח OpenAI: עבודה', 'sk-...', { note: 'the team account, billed monthly' })
```

* **A check only checks.** What passes is kept exactly as you passed it, never what the schema
  makes of it: a name is bound into the ciphertext and names its rows, so a schema that trims or
  lowercases would otherwise send the same user to another vault.
* **The refusal is the vault's own**: kind `bad_label` (`bad_option` for a note), naming the
  field, never quoting the name or your schema's issues. A schema must check synchronously; one
  that is async or throws is refused as `bad_option`, carrying nothing of what it threw.
* **Every name is checked everywhere**, records read back included. Narrow a check later and a
  lockbox stored under a name or note the new one refuses is listed as damaged (see *Damaged
  lockboxes*). `erase()` still reaches it by the name it was stored under; `store()` refuses a
  refused name, and stores afresh over a box whose note alone is refused.
* **Sizes follow the names.** Each `store()` weighs its lockbox -- whisper, names and note -- and
  refuses one heavier than the backend holds in a record (`lockbox_too_large`), or one that
  would take the vault past what the backend holds of a vault (`vault_full`).
* Labels of any text are shown to your users as written: mind what bidirectional and invisible
  characters can make one look like.

## Your own storage adapter

Extend `VaultDB` and implement its `do*` methods: its doc block says what each one owes, and
`describeVaultDB` from `safebyok/testing` checks it. A backend with columns (Convex, SQL) keeps
the applabel, user id, vaultlabel and boxlabel in columns of their own. A backend that holds rows
under one string -- a key-value store, localStorage -- files them under `Ckeys`, as
`localVaultDB` and `idbVaultDB` do:

```ts
import { Ckeys } from 'safebyok'

Ckeys.bundle(scope)            // '["vault","acme","u1","main"]'
Ckeys.box(scope, 'anthropic')  // '["box","acme","u1","main","anthropic"]'
Ckeys.boxPrefix(scope)         // '["box","acme","u1","main",' -- every lockbox of the vault, by prefix scan
store.ckeys().filter(Ckeys.isBoxIn(scope))  // every lockbox of the vault, from a list of every ckey
```

Each ckey is the JSON text of its kind and names, so a name may hold any text at all -- a colon, a
quote, a bracket -- and no two vaults ever share a ckey or list each other's lockboxes. The ckeys
are part of the stored format: use these, not a join of your own, and every version finds your
rows.

Your `do*` methods take any text as a name: the public verbs check every name and note, with the
vault's `validators`, which each takes as its last argument. An adapter that hands its calls on
to another VaultDB's public verbs passes them `AnyTextValidators`, as its own have checked.

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
against it. The vault reports the window it was opened with as `vault.reentryWindowMs`, in
milliseconds, the default and `Infinity` resolved: `Infinity` hours (or any as long) reads as the
exported `ForeverMs`, so a UI can say how long an unlock lasts without being told the option again.

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
| `bad_label`           | a label (or the `userId`) that fails the vault's check: `Label` (or `UserId`) by default, or the host's own in `validators` | Pass labels the app chose; check a user-typed one first with the same check |
| `bad_whisper`         | a whisper JSON cannot carry (`undefined`, a function, a class instance) | Store plain JSON; to empty a lockbox, `erase` it |
| `bad_option`          | an option or argument out of its range: an `openVault` option, an `argon2idDeriver` spec, a `store()` note, a passphrase or callback of the wrong type, a record handed to a `VaultDB` write | Fix the call; the message names what it takes |
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
| `lockbox_too_large`   | a lockbox -- its whisper, boxlabel and note together, as the UTF-8 bytes of its JSON -- over its storage's `maxRecordBytes`; only a host whose validators admit long names or notes, or a backend with small records, meets it | Tell the user to store a smaller whisper or a shorter note |
| `vault_full`          | a new lockbox in a vault already holding its `maxLockboxes`, a lockbox whose names and note would take the vault past its storage's `maxVaultBytes`, or a write the storage backend has no room for | Tell the user to erase a lockbox first; the host may raise `maxLockboxes` where the backend allows |
| `corrupt_record`      | a stored record failed validation or decryption verification     | Nothing was changed. Do not retry; tell the user, and see a developer: the record is damaged, was moved, or came from a newer safebyok. A damaged lockbox can be removed with `erase()` or written afresh with `store()` (see *Damaged lockboxes*); a damaged vault bundle stops `openVault` |
| `stale_write`         | storage changed since this device read it, so the write was refused | The vault has caught up: read again and, if it still applies, repeat. A `store()` retries by itself first |
| `not_permitted`       | the storage backend refused this user: signed out, or not theirs to reach | Have the user sign in again                             |
| `storage_unavailable` | the storage backend could not be reached, or failed              | Try again shortly; the adapter's own error is the `cause` |

`openVault` itself can refuse with `bad_option`, `bad_label`, and, as it reads the vault from
storage, `storage_unavailable`, `not_permitted` or `corrupt_record` (for the vault's bundle: a
damaged lockbox never stops an open): the last three are conditions, though they surface at
open. A refused open leaves nothing running behind it, so the host simply opens again.

### Damaged lockboxes

A lockbox whose stored record does not read back -- not JSON, a malformed note or time, a
record naming another boxlabel than the one it is stored under, one from a newer safebyok, or
one stored under a boxlabel or with a note the vault's `validators` now refuse -- is listed in the snapshot as damaged, `{ boxlabel, damaged: true }`, sorted among the sound
ones, which carry `damaged: false`. The rest of the vault opens and works as ever. `read()` and
`use()` refuse a damaged lockbox (`bad_label` for one under a name the checks refuse,
`corrupt_record` otherwise); `erase()` removes it by the name it is listed under, whatever the
boxlabel check now says, and `store()` writes a fresh lockbox over it -- except under a name the
check refuses, which `store()` refuses with `bad_label`, writing nothing, since the lockbox it
made would list as damaged still. Show it as removable:

```ts
for (const box of vault.getSnapshot().boxes) {
  if (box.damaged) { showDamaged(box.boxlabel) }   // offer erase(box.boxlabel), or a fresh store()
  else { showSummary(box.boxlabel, box.note, box.changed_at) }
}
```

Damage the listing cannot see -- altered ciphertext, a missing or malformed ciphered field --
shows only when the lockbox is read: it lists as sound, `read()` refuses it with
`corrupt_record`, and `erase()` removes it. `store()` starts afresh over any record it cannot
read as a lockbox -- every one the snapshot lists as damaged, and one missing or mangling a
ciphered field -- carrying nothing from it, neither its note nor when it was first stored. A
record that reads but will not decipher, its ciphertext altered, is replaced as any other, its
note and first-stored time kept. A storage adapter's `doListBoxes` hands up each lockbox as a
`StoredLockbox`, the boxlabel it is stored under beside its record exactly as stored, so a record
too damaged to name itself is still listed under the boxlabel that reaches it.

In code, `VaultErrorFamilyForKind` gives each kind's family (`VaultErrorFamilyVals`: `misuse`,
`condition`), and `isVaultCondition(err)` is true for a `VaultError` of the condition family:
show or retry those, and let anything else reach an error boundary.
