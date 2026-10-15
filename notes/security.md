# Security: decisions to look at

Describe decisions here that, in your judgement, could merit closer security review, or could
interact with later decisions to create a security issue. Do not justify why they are, or are not,
concerning; do not predict what might heighten concerns. Instead, in a sentence or so, brief a
security expert who knows what questions to ask.

## Of Interest

* 2026-10-15: a lockbox row that fails the listing's check (not JSON, a malformed note or time, a
  record naming another boxlabel than the ckey it sits under, an unknown `format`) is listed as
  `{ boxlabel, damaged: true }` instead of making `listBoxes` -- so every `refresh()` and
  `openVault` -- refuse `corrupt_record`. The boxlabel comes from where the row is stored (a
  `VaultDB`'s `doListBoxes` now hands up `{ boxlabel, lockbox }` pairs; the in-tree adapters read
  it from the ckey, Convex from its column), never from the damaged record, and nothing else of
  the record reaches the snapshot. A row whose boxlabel or note the vault's `validators` refuse --
  stored under other checks, before a host narrowed them -- lists as damaged too, and `erase()`
  reaches it by its stored name: for a box that already stands, erase checks the boxlabel only as
  text (the ckey it rebuilds is still this scope's own). So the snapshot carries a damaged box's
  boxlabel as stored, text the host's check refuses: one who can write storage can put any text
  there, as a name a host renders. `store()` checks every boxlabel against
  the host's check, so it refuses a refused name (`bad_label`, writing nothing) even over a box
  standing under it; over a box whose note alone is refused, it writes afresh. `store()` over a
  lockbox whose record fails validation (any listed as damaged, and one whose ciphered fields are
  missing or malformed) now erases it (`eraseBox`, expecting only the `vault_id`) and then writes
  a fresh lockbox expecting no revision, carrying neither its note nor its `registered_at`; two
  steps, so a failure between them leaves the box erased. Since that erase names no revision, it
  also removes a sound lockbox another device stored under the boxlabel after this store read the
  damaged one (this store's write then stands in its place, as a retried store's would, but should
  the write fail, neither stands), and an erase of the damaged box elsewhere does not stop this
  store. What one who can write storage could already do -- erase or replace any row -- is
  unchanged; what is new is that planting junk under a boxlabel shows the user a damaged box where
  a refused open used to show, and that the user's next `store()` to that boxlabel clears the junk
  rather than refusing. `read()` and `use()` still refuse a damaged box.

* 2026-10-15: `erase(boxlabel)` removes a lockbox whose stored record fails validation or
  verification (`corrupt_record`), rather than refusing it: it reads the record only to tell an
  absent box (`absent_box`) from a present one, and a damaged record counts as present. It still
  needs the vault unlocked, still names the boxlabel the caller gave, and still lands only in the
  vault this device holds keys for (its `vault_id` expectation). `read()`, `use()` and the
  background refresh still leave a damaged record in place; only an explicit erase of that
  boxlabel deletes it.
* 2026-10-15: a scope's `user_id` is text of 1 to 100 characters (`UserId`), checked at
  `openVault`, by every `VaultDB` verb, and in every stored record that names a scope; a refusal
  names the bound and never quotes the id. The Convex component's validators and its `getUserId`
  check do not bound it themselves: the client's `VaultDB` refuses a longer one before a call is made.
* 2026-10-15: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (seven days, in minutes) and
  `minimumReleaseAgeStrict: true`: pnpm resolves and installs nothing, transitive dependencies
  included, younger than that, and fails rather than fall back; the frozen-lockfile install in CI
  verifies the lockfile against it too. Its exceptions are `minimumReleaseAgeExclude` entries,
  each by name and exact version, each listed here until removed (PROCESS.md, *Dependencies*).
  Adding the rule re-resolved the whole lockfile (the old one held 51 entries under seven days
  old) and lowered the floor of nine direct dependencies' ranges to releases that had aged (the two hand
  pins on `graphql-yoga` and `@graphql-tools/schema` became ranges again: the rule now does what
  they did). Dependabot's `cooldown` is 7 days to match.
* 2026-10-15, **exception, remove once past 2026-10-16T23:01Z**:
  `minimumReleaseAgeExclude: convex-test@0.0.61` (`safebyok-convex`'s test dependency, pinned
  exactly; published 2026-10-09T23:01Z, so it ages past seven days at 2026-10-16T23:01Z). Not a
  security fix: 0.0.61 is the first release with `defineTestApp`, which the Convex tests already
  use, and 0.0.60 fails them. Development-only, never shipped. Revisit: once it has aged, delete
  the exclusion and make the pin a `^` range again.
* 2026-10-15: `mask` (`safebyok/utils`) takes a whisper and returns text meant for display: its
  first and last few characters (two and four by default, at the caller's choice) and, up to
  `maxLen` (15 by default), its length. Beyond `maxLen` the result is fixed-width
  (`head***...***tail`), or `maxLen` stars when even that does not fit, so the length stops showing;
  a `head` and `tail` large enough to cover a short whisper show it nearly whole, and `minStars: 0`
  shows a short one entirely. It makes the whisper safe to butcher (normalize and strip the whole
  input), butchers it, and then checks the result is safe by passing it through the same stripping,
  so every result, even the stars, is free of combining marks, control, format, surrogate,
  private-use and unassigned code points, spaces, ignorable code points, bidirectional controls and
  direction marks, and the symbols drawn blank or as a box (U+2800, U+1D159, U+FFFC); it is one
  plain line that cannot hide or overwrite anything. Right-to-left letters and numbers are kept (the
  Coach's ruling: strip the direction markers, not the scripts), so a mask may reorder neighbouring
  neutral characters, such as stars and punctuation, in a display; with no controls in it, it cannot
  do worse. `mask` is meant for plain text, and arbitrary blobs may give unusual behavior. `head`,
  `tail` and `minStars` are capped at 1000, so no option makes it build an unbounded string. It
  throws `bad_option` or `bad_whisper` without quoting its input.
* 2026-10-14 (revised 2026-10-15 for the push-to-main workflow): the package is staged on npm by
  `.github/workflows/release.yml`, run on every push to main (when the Coach has merged the Version
  PR, and a version npm lacks is waiting), authenticating by npm's trusted publishing (OIDC, no
  stored token) from the `npm` environment, with provenance. The `pack` job runs `pnpm justify`
  (lint, typecheck, tests and the build) before `publish`, which runs no package's scripts. A
  maintainer's 2FA approval makes the staged version public; CI cannot give it.
* 2026-10-14: the npm trusted publisher allows `npm stage publish` and `npm dist-tag`, and not
  `npm publish`. A run of the release workflow can therefore repoint a dist-tag (`latest`,
  `next`) at any version already public, with no 2FA approval; the workflow does not run
  `npm dist-tag` today.
* 2026-10-14: `pnpm-workspace.yaml` allows one dependency's install script to run:
  `unrs-resolver` (a native module resolver, pulled in by `eslint-import-resolver-typescript`, a
  development dependency only).
* 2026-10-14: every action in `.github/workflows/` is pinned to a full commit SHA, with the
  release it was resolved from in a trailing comment (`@3d3c42e... # v7.0.1`). Dependabot's weekly
  `github-actions` group proposes new SHAs, and rewrites the comment with them.
* 2026-10-14: the cryptography landed, replacing the plaintext stub. The stub's stored formats
  (`byok-stub-vault-v0`, `byok-stub-unlock-v0`) are not read by the new code: they existed only
  in the demo and were never published.
* 2026-10-14: Argon2id (the pinned `argon2id_web_v1` spec) runs through `@noble/hashes` -- pure
  JS, no WASM; the library's one audit (Cure53, January 2022, at 1.0.0) left its `argon2` out of
  scope, as its README says, so the Argon2id itself is unaudited -- at about half a second per
  derivation in V8. AES-256-GCM encryption, key wrapping and randomness come from WebCrypto
  (`crypto.subtle`, `crypto.getRandomValues`).
* 2026-10-14: the key deriver is a seam (`OpenVaultOpts.keyDeriver`): the pinned Argon2id deriver
  was the default until 2026-10-15 (below), tests substitute a cheap SHA-256 deriver, and a
  stored vault records its deriver's label and refuses to unlock under any other.
* 2026-10-15: `openVault` has no default key deriver: `keyDeriver` is required, and
  `browserOpts()` (the `safebyok/browser` entry) supplies the pinned Argon2id one. An app that
  passes none is refused with `bad_option`, never quietly given one. `openVault` imports no
  Argon2id and the main entry nothing from `safebyok/browser`, but the main entry still
  re-exports `argon2idWebV1Deriver`: Argon2id stays out of an app only where a bundler
  tree-shakes it (the package is `sideEffects: false`), not under a plain `require('safebyok')`
  or an unbundled import. Substituting a deriver still commits every vault made under it to its
  label, as above.
* 2026-10-14: every encryption binds its context as AES-GCM additional data
  (`cipherAdditionalData`): format, applabel, user_id, vaultlabel, vaultId, plus unlockEpoch
  for key wraps (since 2026-10-15, the device record's only: an unlock envelope binds its own
  header instead, below) and boxlabel + revisionId for lockboxes, encoded as a JSON array. Ciphertext
  moved between users, vaults, boxes or revisions refuses to open.
* 2026-10-14: a wrong passphrase is learned from the vaultKey envelope's AEAD failure, never a
  comparison; there is no separate passphrase verifier field.
* 2026-10-14: the localUnlockKey is a non-extractable WebCrypto key persisted only by structured
  clone (IndexedDB, `safebyok/idb`); the vaultKey handle a vault holds between operations is also
  non-extractable. The operations that must wrap the vaultKey (device-remember at unlock, the
  re-wrap in changePassphrase) unwrap a separate extractable transient from the same envelope and
  drop it on return; the remembered-unlock path makes no extractable handle at all.
* 2026-10-14: a stored record that fails validation or AEAD verification is refused with kind
  `corrupt_record` and left in place -- remote data is never auto-deleted. A device-local
  remembered unlock that fails is the one exception: it is dropped, and the user asks again.
* 2026-10-14: the demo app calls Anthropic directly from the browser with the user's own key
  (`dangerouslyAllowBrowser: true` on the SDK client), by design: the key is decrypted on-device
  inside `vault.use(...)` and sent only to `api.anthropic.com`.
* 2026-10-14: `safe-stable-stringify` is a runtime dependency: `stableJsonify`
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection and the
  comparison that decides whether a lockbox's `changed_at` moves (below).
* 2026-10-14: `zod` moved from a regular dependency to a peer dependency (`^4.0.0`): the host app
  supplies it, so safebyok validates with whatever zod instance that app ships.
* 2026-10-15: storage writes are versioned updates (`VaultDB.updateBundle`, `updateBox`). A
  bundle update carries the `vault_id` and `unlock_epoch` it was proven against, and lands
  only while the standing bundle has both. A lockbox update carries the `vault_id` its whisper
  was sealed for and the `revision_id` it read (or null for none), and lands only while the
  scope's standing bundle has that `vault_id` and the standing lockbox that `revision_id` (or
  there is none); a scope with no bundle refuses. A failed expectation refuses with kind
  `stale_write`, writes nothing, and `store()` / `changePassphrase()` / `erase()` / `destroy()`
  surface it on the first failure, with no retry. Erases (`eraseBox`, `eraseVault`) carry a
  `vault_id`-only expectation (the Coach's ruling): they land only while the scope's standing
  bundle has that `vault_id`, refuse where no bundle stands, and expect no revision, so within
  its vault an erase wins over a concurrent update; erasing an absent lockbox is quiet. The
  atomicity of check-and-write is each adapter's: `localVaultDB` checks and saves in one
  synchronous step; the Convex component checks inside the transaction of the mutation that
  writes (below).
* 2026-10-15: `idbVaultDB` performs its versioned updates, its erases and `createBundle` as a
  read, then a separate write, in separate IndexedDB transactions: another tab writing in
  between can still be buried, two tabs can each create a bundle, and a vault another tab
  destroys and makes anew in between can still lose a lockbox (`eraseBox`) or be erased whole
  (`eraseVault`). Its `eraseVault` also lists the vault's rows in one transaction and deletes
  them in another: a lockbox another tab writes in between survives the erase, orphaned without
  a bundle. Doing these inside one IndexedDB transaction is a ruled TODO, not yet built. (Built
  when the store moved to `safebyok-indexeddb`: see the entry on it below.)
* 2026-10-14: a lockbox's ciphertext length reveals its whisper's length to the backend: there is
  no padding yet (TODO). `store()` refuses a whisper over `maxWhisperBytes` of JSON, an
  `openVault` option defaulting to `MaxWhisperBytes` (40444), checked on write only.
* 2026-10-14: `changePassphrase` re-wraps the vaultKey under the new passphrase but does not
  rotate it, so a superseded bundle plus its old passphrase still yields the current vaultKey,
  with no expiry. The Convex adapter (`packages/safebyok-convex`) keeps no bundle history, but
  Convex's own backups and snapshot exports retain superseded bundles for as long as they are
  kept.
* 2026-10-14: `pnpm-workspace.yaml` denies `esbuild`'s install script (`esbuild: false`); esbuild
  arrives with `convex` and vite, and runs from its platform binary package without it.
* 2026-10-15: a session holding keys for a vault since destroyed or recreated elsewhere cannot
  write a lockbox into the successor, erase one of its lockboxes, or destroy it: `store()`,
  `erase()` and `destroy()` no longer look at the bundle first, and rely on the `vault_id`
  expectation, checked by the backend, to refuse. A refused `destroy()` has already forgotten
  this device's remembered unlock; a second `destroy()`, now holding the successor's `vault_id`,
  erases the successor. On a vault the handle has never seen created, `destroy()` erases only
  the device-local record: lockboxes orphaned without a bundle are not reached.
  `changePassphrase()` and `unlock()` re-read the bundle first, as they must to prove the
  passphrase against it. An unlock changed elsewhere (a passphrase or passkey added, removed or changed) does not stop a stale session's
  `store()` or `erase()` (their expectations carry no epoch); the session relocks on its next
  look at the bundle.
* 2026-10-14 (the option was named `rememberForMs` until its rename on 2026-10-15): the unlock
  window (`forcePassphraseReentryHours`) is chosen by the app at each `openVault`, so two devices on
  one vault may hold different windows. It is client-side politeness, not a vault-wide synced
  policy: nothing stored enforces it across devices, and a modified client could choose any window
  it likes. The real bounds stay the passphrase and the device-bound localUnlockKey.
* 2026-10-15 (revised the same day by clean_times): a host may let a device stay unlocked
  indefinitely, by passing `forcePassphraseReentryHours: Infinity` (or any huge number); that is the
  host's choice, with no upper cap. `openVault` turns it, as it parses the option, into a finite
  window of `FarFuture - FarPast` ms, so the deadline it sets from any in-bounds clock reading is
  `FarFuture` (see the next entry), and the stored `ask_passphrase_at` is a finite number; no schema
  past that parse, and no stored field, accepts `Infinity`. What still ends such an unlock: `lock()`
  (memory and device record), a change to the unlocks on another device (the next look at the bundle
  sees a new epoch), and the vault being destroyed or made anew (a new `vault_id`). Nothing else
  does: no timer, and no idle detection. Two consequences: an open handle sees that new epoch only
  when it next reads the bundle (an unlock, a write, or a change the vaultDB pushes), so a handle
  that only reads whispers, on storage that pushes nothing, keeps its vaultKey in memory until then;
  and lowering the option later ends an unlock a device already remembers only at its next open (see
  the entry below).
* 2026-10-15 (revised the same day by clean_times): every time the package stores is an
  `EpochMillis`: epoch ms from `FarPast` (1981-01-01T00:00:00Z) to `FarFuture`, the microsecond
  epochalypse (`Math.floor(Number.MAX_SAFE_INTEGER / 1000)`, 2255-06-05T23:47:34.740Z) -- the
  device record's `ask_passphrase_at` (named `expires_at` until then), and the lockbox's and
  bundle's `registered_at` and the lockbox's `changed_at`: whole ms, so a stored record with a
  fraction of a millisecond fails its schema as one out of bounds does. A device record that
  fails the schema reads as "no remembered unlock", and is erased; it is not clamped on read. That
  includes records written by 0.1.0 and 0.2.0 under a window above about two million hours (some
  229 years), which capped the window only at `MAX_SAFE_INTEGER` ms and stored `now + window`
  unclamped. **The host's `Clock` is checked**: `openVault` reads it once and refuses a reading
  outside those bounds (seconds, microseconds, `NaN`, `Infinity`, a non-number), or a `now()` that
  throws (its error kept as the cause, unquoted), as `bad_option`, before touching storage. Every
  later reading is checked the same way and floored to whole ms (a fraction is fine in a
  reading), and one that fails **fails closed**: the vaultKey is dropped before the call throws
  `bad_option`, so a clock gone wrong never mints a deadline or a stored time, and leaves the vault
  locked in memory (the device record stays). A lock never waits on the clock: `lock()` reads
  none, and `lockSoon()`, unable to time its grace, locks at once and returns normally, with a
  warning to the vault's logger (below). A clock that goes wrong in the middle of a `store()`,
  `erase()` or `changePassphrase()` lets the write land, then throws `bad_option` from the refresh
  after it. A clock in bounds but wrong (set a year ahead, say) is not detected.
* 2026-10-15: `openVault` takes a host's `logger` (`log`, `warn`, `error`, each
  `(message?, story?, err?)`), checked at the door (`bad_option`) and wrapped so that whatever it
  throws or rejects with is dropped. The vault calls it in four places: `lockSoon()` locking
  without its grace on a bad clock; a remembered unlock that fails its schema or will not unwrap,
  erased; a background refresh that fails; and an adapter's unsubscribe throwing while a failed
  open cleans up. Messages are fixed text; a story is `{ call }` alone, naming the vault call, so
  no scope, label, `userId` or other option value goes to the logger; an `err` is the
  `VaultError` the vault would otherwise have thrown (its `cause` the host's own clock or adapter
  error, as `VaultError` already carries it) or the adapter's own error, never a record or a
  validator's issues. A host's own error goes as the host made it, unread and unscrubbed, and the
  default console logger prints it, though a storage client's error may quote the request it
  failed. A test sweeps every call for the fake passphrase, whisper, note, stored
  ciphertexts and salts, down through each error's causes.
* 2026-10-15: with no `logger`, the vault logs to the console: `src/console-logger.ts` is the one
  module in `src/` that touches it, under a file-wide `eslint-disable no-console` (the Coach's
  approval: "yes with no logger console is the fallback"); the lint rule itself is unchanged
  everywhere else. A host silences it by passing a logger whose calls do nothing.
* 2026-10-15: a lockbox keeps two times, `registered_at` (first stored, carried forward) and
  `changed_at`, which moves only when the whisper's serialized form (`stableJsonify`) differs from
  the one it replaces. To know, `store()` deciphers the previous record it already reads and
  compares the two serialized whispers with plain string equality, in memory on the client; the
  comparison is not constant-time. A previous record that will not open counts as changed and is
  written over, as before. The backend learns one bit it did not before: a `changed_at` that
  stands still across a new `revision_id` says the host stored the same whisper again. The bundle
  keeps `registered_at`; `created_at` and `updated_at` are gone from both records. None of the
  times is in the cipherAdditionalData (the binding is still the positional list), so a backend
  can alter them undetected; binding the whole header is TODO.md's roadmap 3, not yet built.
* 2026-10-15: until 1.0.0 a stored-shape change carries no migration (the Coach's ruling). A
  lockbox or bundle written with `created_at`/`updated_at`, or a device record with
  `expires_at`, fails its schema: the vault refuses it as `corrupt_record` and leaves it as it
  is (a device record is erased, and the user enters the passphrase again). A Convex deployment
  holding such rows refuses the new component schema at deploy until those rows are deleted.
* 2026-10-15: lowering `forcePassphraseReentryHours` reaches devices already remembered. At each
  open, a remembered unlock whose deadline lies past now plus that open's setting was remembered
  under a longer one, and is treated as a record that does not fit: erased, and the vault opens
  locked. Raising the option lengthens no remembered unlock; an unchanged setting never trips it
  (the deadline set at unlock is always within now plus the setting), so it fires only when the
  host lowered the setting, or the clock went backward. There is deliberately no write-back of a
  shortened deadline: a blind write of the record read at the start of the open would bring back
  a remembered unlock that another tab's `lock()` erased in between, and later opens would come
  up unlocked against the user's last act. Doing it safely would need an atomic "shorten if still
  present" on `DeviceDB`, an interface hosts implement. An erase cannot resurrect anything and
  cannot slide; racing another tab's fresh unlock, it only makes that device ask again. A stored
  deadline past `FarFuture` never reaches this check: it fails the record's `EpochMillis` bounds
  and is erased first (the entry above). A handle already open keeps the deadline it opened
  with: the option is read at `openVault`.
* 2026-10-14: the package was renamed `byok` → `safebyok` before any release, and its stored
  format tags with it (`safebyok-vault-v1`, `safebyok-lockbox-v1`, `safebyok-unlock-v1`). The
  tags are also the first element of every encryption's additional data, so a record written
  under a `byok-*-v1` tag would neither validate nor decrypt. No reader for the old tags is
  kept: they existed only in development and demo storage, never in a published version.
* 2026-10-15: `VaultDB`'s public verbs turn any failure from an adapter that is not already a
  `VaultError` into kind `storage_unavailable`, with the adapter's own error attached as the
  standard `cause`. Adapters see only ciphertext and public record fields, but that cause is
  whatever the backend's client threw, unfiltered.
* 2026-10-15: `localVaultDB` and `idbVaultDB` key rows by `applabel:user_id:vaultlabel`, and
  `user_id` may hold a colon, so one user's rows can share another scope's ckey prefix. Listing
  and erasing a vault now take only ckeys whose remainder after the prefix is a bare boxlabel
  (no colon); before, a prefix match alone listed a colon-holding user's lockboxes in another
  user's vault. Exact ckeys cannot collide.
* 2026-10-15: the string-keyed adapters (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`,
  `memoryDeviceDB`) file rows under the JSON text of a tuple -- the row's kind, the applabel,
  `user_id` and vaultlabel, and a lockbox's boxlabel -- from one module, `Ckeys`, now exported for
  adapter authors. This replaces the colon-joined ckeys of the entry above. `JSON.stringify`
  quotes and escapes every string, so two different tuples never share a ckey whatever their
  names hold, and a vault's box prefix (its tuple's JSON up to the comma before the boxlabel)
  begins no other vault's ckeys; tests cover every split of a string of separators into four names.
  A name is encoded as given, never normalized: two Unicode spellings of one name are two vaults,
  as they are two cipher bindings. Rows under the old ckeys are never read or moved: a vault
  stored before reads as absent, and its rows, ciphertext only, stay in storage. An old remembered
  unlock (a localUnlockKey and the vaultKey wrapped under it) would otherwise linger in IndexedDB
  beyond the reach of `lock()` and of any expiry, so `idbDeviceDB` sweeps it: `readUnlock` and
  `eraseUnlock` list the device shelf's ckeys and delete, unread, every one that is not an unlock
  tuple (`Ckeys.isUnlock`). An open that finds the vault does it, and so does every lock; under
  `idbVaultDB` or `localVaultDB`, whose first open after an upgrade finds no vault (so reads no
  unlock), the old row waits for the first lock or the next open after an unlock. A test proves
  no old value is fetched. `eraseAll()` clears the whole shelf. `memoryDeviceDB` keeps nothing past the
  page, so it needs no sweep.
* 2026-10-15: the Convex component (`packages/safebyok-convex`) authenticates in the host app,
  not inside the component (where `ctx.auth` does not exist): `SafebyokComponent.api({ getUserId })`
  builds the nine public functions the host re-exports, and each refuses unless the host's
  `getUserId(ctx)` returns a non-empty id equal to the scope's or bundle's `user_id`. The
  component's own functions check no caller and trust their `user_id` argument; Convex lets only
  the host app call them, so a host that wraps them itself, without this check, exposes every
  user's rows.
* 2026-10-15: the Convex component validates records structurally only (fields, types,
  optionality, the `format` literal); the label grammar, non-empty ids, a positive whole
  `unlock_epoch` and a note's length are checked by the client's Zod records, not on the
  server. A signed-in user can therefore store malformed rows in their own vaults, which their
  own clients then refuse as `corrupt_record`.
* 2026-10-15: the Convex component checks each update's and erase's expectation by reading the
  standing rows inside the same mutation that writes, relying on Convex's serializable
  transactions; a failed expectation resolves `false` rather than throwing. `createBundle` is a
  find-or-insert in one mutation; the indexes are not unique, and a second bundle row for one
  scope would make every later call on that vault fail (`.unique()` throws) rather than pick one.
* 2026-10-15: the Convex component's refusals carry `ConvexError` data of a fixed `kind`
  (`not_permitted`, `vault_full`) and a fixed message; neither names the user or quotes a record.
  Its functions log nothing.
* 2026-10-15: Convex's own argument and return validation errors quote the value they refused.
  A malformed call to one of the Convex component's functions therefore writes its arguments --
  `user_id`, scope, notes, ciphertext, never plaintext or keys -- into the host's Convex logs,
  and on a dev deployment back to the calling client as well. safebyok's own refusals
  (`not_permitted`, `vault_full`) quote nothing.
* 2026-10-15: `convexVaultDB`, the Convex client adapter, turns a `ConvexError` whose data has a
  safebyok `kind` and a string `message` into a `VaultError` of that kind carrying that message as
  sent by the server (the component's own are fixed text). Any other error becomes
  `storage_unavailable` with Convex's error as `cause`; on a dev deployment that error's message
  may quote the arguments Convex refused (scope, notes, ciphertext; never plaintext or keys).
* 2026-10-15: `convexVaultDB` sets no timeout. Offline, a Convex query or mutation waits for the
  socket, and Convex resends an unacknowledged mutation on reconnect, so a write can land after
  its caller stopped waiting; a vault call waits as long as the connection is down.
* 2026-10-15: signing out of Convex does not lock a vault opened over `convexVaultDB`: its calls
  are refused `not_permitted` from then on, and its failing `watchVault` subscription is ignored,
  but the unlocked vaultKey stays in memory until the vault locks, expires or is closed. The
  README tells apps to close the vault on sign-out; nothing enforces it.
* 2026-10-15: a vault's lockbox count is capped on the client (`maxLockboxes`, `store()`
  refusing `vault_full`), counted from the handle's last look at storage, so stores of new
  lockboxes running at once -- on several devices, or on one handle, since nothing serializes
  them -- can overshoot it. Neither local backend (`idbVaultDB`, `localVaultDB`) enforces a count
  or a size per vault; the Convex component does (next entry).
* 2026-10-15: the Convex component holds every vault to 8,000 lockboxes and 7 MiB less 1 KiB of
  lockbox rows (as `getDocumentSize` from `convex/values` weighs them), constants in
  `src/component/tallies.ts` derived from Convex's per-transaction limits so that `eraseVault`
  (reading every row twice, beside a bundle of up to one 1 MiB document) always fits; neither the
  client nor the host can change them. `updateBox` checks them against a per-vault tally row
  (`safebyok_vault_tallies`, keyed by the bundle's row `_id`) updated in the same transaction as
  each lockbox write and erase, and refuses, writing nothing, a write that leaves the vault over a
  limit and larger than before, with `ConvexError` kind `vault_full` and fixed text. Replacements
  no heavier and all erases are never refused. A vault with no tally (written before tallies) is
  counted at its next `updateBox`, reading its rows only until a limit is passed; an over-limit
  vault keeps no tally and refuses all growth until erases bring it back. The tally is trusted as
  kept: a rollback to a component version without tallies, followed by a roll forward, leaves
  tallies stale for vaults written meanwhile (deleting the table's rows makes every vault
  recount). Before this, a vault grown past the client's cap (by a modified client, or many
  overshoots) could become impossible to erase whole: the vault half of deleting an account.
* 2026-10-15: records crossing into the core are checked where they cross, and trusted past it.
  A host's `store()` note is checked against the stored lockbox's own schema before anything is
  written (an unchecked over-long note once made every later `openVault` refuse the vault as
  `corrupt_record`). Whatever a `DeviceDB` hands back -- the host may supply its own -- is checked
  against `DeviceUnlock` by the vault, and one that does not pass is erased and reads as no
  remembered unlock. `VaultDB`'s write verbs check labels and scope only, not the records the
  vault builds. A remembered unlock's `ask_passphrase_at` is not bound into its encryption, so
  whoever can write this device's IndexedDB can extend it (to any finite number of milliseconds).
* 2026-10-14: releases run from `.github/workflows/release.yml` on every push to main, in jobs
  that each hold only what they need. Only `publish` (in the `npm` environment) may mint an npm
  OIDC token, and it runs no package's scripts (`pnpm install --ignore-scripts`): it stages the
  tarballs the `pack` job built, linted and tested without that token. The trusted publisher
  allows `npm stage publish` only, so every version still waits for the Coach's 2FA approval.
  `scripts/release.ts` refuses a tarball whose `package.json` still holds a `workspace:` range,
  and quotes only npm's error code and summary, never the rest of what npm printed. No release
  job caches dependencies or persists git credentials.
* 2026-10-15: the release workflow's `version` job opens and updates the Version PR with an
  installation token from a GitHub App, minted by `actions/create-github-app-token` from a
  private key held as a secret of the `releasing` environment, which only `main` may deploy to.
  The token is narrowed to contents and pull requests (write) on this repository; the job's own
  GITHUB_TOKEN reads only. Its commits go through the GitHub API, signed by GitHub and attributed
  to the App.
* 2026-10-15: the GitHub App's private key (`RELEASE_APP_PRIVATE_KEY`, with `RELEASE_APP_ID` as a
  variable) is a secret of the `releasing` environment, which only `main` may use
  (#27, eed83f0). Whoever holds the key can mint installation tokens for the App with every
  permission the App was granted, however narrowly `release.yml` asks for its own; the key never
  expires, and revoking it means generating a new one in the App's settings. In the workflow only
  the `create-github-app-token` step receives the key. The token it mints (contents and pull
  requests write on this repository, short-lived) goes to the changesets action, which also runs
  `pnpm release:version`, repository code from main's tip, in the same job: so what merges to main
  can use that token when it next runs. The token can create branches and tags and open, edit and
  close pull requests; whether it can also push to or merge into `main` depends on the branch
  protection's allowances for the App, which this repository's files do not record.
* 2026-10-15: the `publish` job, the only one that can mint an npm token, installs npm 12.2.0
  from a tarball checked against the sha512 `dist.integrity` recorded in `release.yml`, offline
  (npm bundles its dependencies), so a changed tarball on the registry stops the job instead of
  running beside the token. Moving npm means recording the new version's integrity by hand.
* 2026-10-15: `store()` retries a write storage refused as stale, up to three attempts in all.
  Every attempt reads the box afresh and seals the whisper anew, under its own lockboxKey and
  `revision_id`: a refused attempt's ciphertext is never reused, so no two ciphertexts share a
  binding. The retry's first act is to require unlocked, so a refusal that caught the device up
  with a vault reborn elsewhere (or a changed passphrase) relocks it and ends the retry as
  `vault_locked` before any whisper is sealed for the new vault. A retry overwrites what the
  other device wrote (last writer wins), as a host's own retry did, except that a box erased
  elsewhere is not brought back (an erase wins: `stale_write` at once); `erase()` is never retried.
* 2026-10-15: the published package has a `safebyok/testing` entry point of test helpers
  (the `TH` namespace of its tests), among them `testDeriver`, a KeyDeriver that is one SHA-256
  of passphrase and salt, labelled `test_digest_v0`. `openVault` accepts any KeyDeriver, so
  nothing stops a host passing it to a real vault; a bundle records the label of the deriver that
  sealed it. The entry imports vitest, an optional peer, and is not imported by `safebyok`,
  `safebyok/browser`, `safebyok/idb` or `safebyok/utils`.
* 2026-10-15: the public packages' `exports` carry a `@safebyok/source` condition pointing at
  `src/`, for the workspace's own tooling; `pnpm pack` ships `publishConfig.exports` (dist only)
  instead. `scripts/release.ts` refuses a tarball that still carries the condition, and each
  public package's `prepublishOnly` refuses a publish not run by pnpm.
* 2026-10-15: a `lock()` (or `destroy()`) called while an `unlock()` or `changePassphrase()` is
  still under way wins. Each lock moves a per-handle counter; the unlock reads it at its start
  and again after each wait (the bundle read, the key derivation, the device record's write),
  and on finding it moved takes up no vaultKey, erases a device record it had already written,
  and throws `vault_locked`. A vault that unlock was creating stays created, locked. A passphrase
  change still lands in storage (its proof is the old passphrase, not the unlock), and only its
  unlock is dropped. The counter is per handle: a lock in one tab does not reach an unlock under
  way in another, beyond both writing the one device record. The undoing erase is
  unconditional, so it can also erase a record written by a second unlock begun after the lock
  on the same handle; that device then asks for the passphrase at its next open. An unlock (or
  the unlock after a passphrase change) also takes up nothing, and throws `vault_locked`, when the
  bundle standing at its end is not the one its passphrase was proven against, by `vault_id` and
  `unlock_epoch`: a vault destroyed, remade, or re-keyed elsewhere while the passphrase was
  being checked. Without that, the old vault's vaultKey was taken up against the new bundle, and a
  `store()` sealed boxes into the new vault that its owner could never open.
* 2026-10-15: `lockSoon(graceSeconds = 5)`, at most 60 seconds, closes the entry gate at once
  (`askPassphraseAt` cleared, so the snapshot reads `locked` and every operation started
  afterwards throws `vault_locked`; cleared rather than set to now, which a wall clock stepped
  back would reopen), erases the device record at once, and moves the shut counter
  (an unlock under way loses); a `setTimeout` drops the in-memory vaultKey after the grace. In the
  grace, `store()`'s retries and `erase()`'s second look check only that the key is still held,
  not `askPassphraseAt`, so an operation begun before the gate closed finishes; under natural
  expiry too, an operation begun before `askPassphraseAt` now finishes past it. An `unlock()`
  that lands in the grace cancels the timer, including one begun in the grace and still deriving
  when it would have fired: the timer does not move the counter. A second `lockSoon()` never
  lengthens a grace, only shortens it. `close()` now moves the counter and drops the key from
  memory (clearing the timer) but leaves the device record: an unlock under way on a closed
  handle writes no record (erasing one it already wrote) and throws `vault_closed`. The timer is
  per handle and per tab, like the counter.
* 2026-10-15: `VaultProvider` hands a stored record that fails verification at open
  (`corrupt_record`) to the app in place, as `openError`, rather than throwing it to the error
  boundary: it is a condition, as are `storage_unavailable` and `not_permitted`. A tampered or
  damaged bundle therefore reaches the app's own UI, beside a `retryOpen` that cannot mend it; the
  React README tells hosts to branch on `openError.kind`, and the error's message carries no
  secret material. Misuse still goes to the boundary.
* 2026-10-15: every validator in the core is `zod/mini` (`import * as Z from 'zod/mini'`; the
  core's lint refuses classic `zod` in `src/`). Same checks, limits and messages as before; mini
  shares classic's parsing core, and the test suite passes against zod 4.0.0, the peer range's
  floor, as against the current 4.6. Mini loads no locale, so a zod issue's default message is
  generic, but no zod message reaches a caller of the vault or its VaultDB: every refusal there
  is a VaultError of our own wording. A host calling an exported schema's `.safeParse` itself
  gets zod's issues, which name paths and limits but carry no input (zod's `reportInput` is
  off). The build keeps each module its own file in `dist/` (`unbundle`), so a host's bundle
  carries only the modules its imports reach.
* 2026-10-15: every `VaultDB` write verb validates its record and its expectation against the
  schemas its reads use, before the adapter's half sees them, so the core never writes a record
  its own read would refuse (an over-long note once did, and the vault could not be opened again);
  Zod strips a field it does not know, so none reaches storage. `updateBundle` refuses a bundle
  whose `vault_id` differs from the expected one. Listing still validates only what a listing
  shows: a lockbox whose ciphered fields are damaged lists, and is refused at `read()`, so one
  damaged box never makes the vault fail to open; such a box cannot be stored over or erased
  either (both read it first), only destroyed with its vault. A remembered unlock naming another
  scope is forgotten before any unwrap; its `vault_key_local_wrapped` binding would refuse it
  anyway. The vault-size check counts each lockbox at twice `maxWhisperBytes` plus 2 KiB for its
  other fields against the adapter's whole `maxVaultBytes`: the same outcomes as half the limit
  with 1 KiB, with the fields' allowance now covering them (a test builds the heaviest row) while
  `user_id`, which nothing bounds, is at most 512 bytes; a longer one, or a note a JSON-text
  backend escapes, eats into the room the doubled whisper leaves.
* 2026-10-15: a host may choose its key derivation. `argon2idDeriver(spec)` takes a whole
  Argon2id parameter set and a label of the host's own, and runs it through `@noble/hashes` as
  the supplied deriver does: parameters, not a new construction. `Argon2idWebV1` stays the one
  supplied spec and what `browserOpts()` uses; no other was added (RFC 9106's first recommended
  option needs 2 GiB, past what `@noble/hashes` allocates; its second differs from ours only in
  four lanes, which a single-threaded JavaScript deriver runs one after another; OWASP's figures
  are server minimums, below ours). **Refused** (`bad_option`), as what cannot run: a salt under
  8 bytes (`@noble/hashes` and Argon2's reference code refuse it, so a 1-byte salt is refused
  here) or over 65536 (`getRandomValues`' most), memory under 8 KiB a lane or over 1 GiB, no
  passes or lanes, a key other than 32 bytes. **Allowed**, as foolish but workable: anything
  weaker within those bounds -- 8 KiB of memory, one pass. Any `keyDeriver` openVault takes needs
  a `salt_bytes` from 1 to 65536 (a non-Argon2 deriver, such as `testDeriver`, may take a 1-byte
  salt), and the vault refuses a `deriveKeyBytes` that hands back anything but 32 bytes, before
  wrapping anything: WebCrypto would otherwise accept 16 or 24 as a weaker AES key. **Enforced**:
  a deriver now carries its spec's fields beside its function, and openVault and
  `argon2idDeriver` refuse one wearing a supplied spec's label (`argon2id_web_v1`) without
  carrying exactly that spec's parameters, so a WebAssembly or native stand-in cannot quietly
  derive under others and strand vaults across devices. This checks what a deriver declares, not
  the bytes it derives: a stand-in is the host's to test against `argon2idWebV1Deriver`. A host's
  own label is not checked against anything, since a vault stores only the label; the host must
  never change a label's parameters. The stored format is unchanged.
* 2026-10-15: a bundle holds its ways in as `unlocks`, a list of one to `MaxUnlocks` (8) unlock
  envelopes, each the one vaultKey wrapped under its own key. A passphrase envelope has its own
  random `salt_b64` (never shared between envelopes) and its own `unlock_id`, and its wrap's
  additional data is the format, scope, `vault_id`, a purpose per method
  (`vault_key_passphrase_wrapped`), and the envelope's whole public header (`method`,
  `unlock_id`, `unlocklabel`, `key_deriver_label`, `salt_b64`) as key-sorted JSON. The
  `unlock_epoch` is no longer in it, since a change to one envelope bumps the epoch and the
  others, whose passphrases the device does not hold, must still open: a backend can therefore
  splice an envelope from an older bundle of the same vault (a removed passphrase's, or one from
  before a change) into the current one, and that old passphrase opens the vault again, as it
  always opens the older bundle itself. The list's order and length, and the bundle's other
  fields, are not bound.
* 2026-10-15: removing an unlock envelope (`removeUnlock`) is not revocation. Whoever knew the
  removed passphrase and kept any earlier bundle holds the vaultKey, which never rotates; the
  removal bumps `unlock_epoch`, so devices unlocked under it lock at their next look, and the
  vault refuses to remove its last envelope (`last_unlock`). Every change to the envelopes
  (`addPassphrase`, `removeUnlock`, `changePassphrase`) asks for a passphrase that opens one,
  even on an unlocked vault: the session's vaultKey handle is non-extractable, so wrapping it
  anew needs the extractable transient that a proof unwraps.
* 2026-10-15: an `unlock()` or a proof not aimed at one envelope (`unlockId`) tries each
  passphrase envelope in the bundle's order, one key derivation apiece, and stops at the first
  that opens: a wrong passphrase costs as many derivations as there are envelopes, at most
  `MaxUnlocks` (8, about 4.8 s with the noble deriver in Node 24), a bound enforced on read, so a
  backend cannot make one unlock derive more. Which envelope opened shows in how long the unlock
  took, on the device only. Envelopes made by a key deriver the vault was not opened with are
  passed over, and refused as `unknown_key_deriver` only when no envelope is left to try.
* 2026-10-15: a way in may be a passkey (WebAuthn PRF extension; a security key's `hmac-secret`).
  Its envelope holds `credential_id` and `prf_salt_b64` (32 random bytes, minted by the React
  binding's `createPasskey` with `crypto.getRandomValues`, checked for length by the core). The
  passkeyKey is HKDF-SHA256 over the 32-byte PRF answer, with an empty salt and `info` =
  `["safebyok-vault-v1", "vault_key_passkey_wrapped", credential_id]` as JSON; the wrap's additional
  data is the format, scope, `vault_id`, purpose `vault_key_passkey_wrapped` and the envelope's
  public header, as for a passphrase envelope. A stored salt that is not base64url of 32 bytes
  refuses as `corrupt_record`, checked at unlock rather than in the schema (the size budget, as for
  passphrase salts). The core never calls WebAuthn and never stores the answer; the answer passes
  through host JavaScript as a `Uint8Array` the vault does not wipe.
* 2026-10-15: what a passkey way in rests on. The PRF answer is a long-term secret as strong as a
  passphrase for that vault, and needs no key derivation to try, so a captured answer opens the
  vault (and every copy of its bundle) for good. The authenticator gives it only after user
  verification (`userVerification: 'required'` on every call, which also keeps the answer stable:
  hmac-secret answers differently with and without UV). A platform passkey synced by iCloud
  Keychain or Google Password Manager answers on any device signed in to that account, so the vault
  then rests on that account's security too. Any script running on a page under the passkey's RP
  ID can ask the authenticator for the answer (with the user's touch), as it could read a typed
  passphrase. The credential's challenge is random and never verified, and no attestation is
  checked: the authenticator is the user's to trust.
* 2026-10-15: any way in proves any change. A passkey's answer is accepted as proof by
  `addPassphrase`, `addPasskey` and `removeUnlock`, so whoever holds one passkey can set a new
  passphrase and remove the user's others: the vault is as strong as its weakest way in. A vault
  always keeps one passphrase envelope (`last_unlock` refuses removing the last), and is created
  with one. `createPasskey` registers each passkey under a random user handle, so it cannot replace
  a sign-in passkey on the same RP; removing a passkey from the vault does not delete it from the
  authenticator, and (as for passphrases) is not revocation.
* 2026-10-15: `addPasskey` proves first and asks the authenticator after, so a refused proof
  leaves no orphaned passkey; the cost is that the proven vaultKey's extractable transient handle
  (`wrapKey` usage only) is held from the proof until the new envelope is sealed, across the
  WebAuthn prompt: human time, not one derivation. Acceptable because the handle lives only in a
  closure inside `reviseUnlocks`, never in the snapshot, a field or an error, so no host script
  can reach it, and a script able to hook SubtleCrypto already sees every unwrap; while unlocked
  the session's non-extractable handle opens every lockbox anyway, and extractability adds only
  the export of the raw bytes. It is bounded by the prompt: the WebAuthn `timeout`
  (`createPasskey`'s option, or the browser's default, minutes) ends it, a dismissal or a refusal
  drops the reference, and the change then writes nothing. A `lock()` during the prompt does not
  cut it short: the passkey still lands and the vault stays locked, as for any change to the ways
  in.
* 2026-10-15: `safebyok-postgres` authorizes on the server, per request: `postgresVaultDB` is
  made with the `userId` the host's auth verified, and refuses (`not_permitted`) any other user's
  scope, or any while signed out, before querying; that check is the whole of the authorization.
  Row-level security is on with no policy (the owner role bypasses it; every other role,
  Supabase's Data API roles among them, reaches no row). The NOTIFY payload is the scope, which
  any role able to connect may LISTEN for. The server holds a vault to a lockbox count of its own
  (see the `maxLockboxes` entry below), and to no size in bytes. Past
  scope and boxlabel, a route's bundles, lockboxes and expectations are validated only as the
  core's VaultDB validates them. A driver's error rides as `cause` and may quote key columns, or
  (a malformed record refused by a NOT NULL) the whole failing row, its ciphertext included; the
  README's route recipe sends the browser only a refusal's kind and message.
* 2026-10-15: `safebyok-graphql` carries the verbs over GraphQL and authorizes nothing itself:
  each resolver calls the VaultDB `vaultDBFor(context)` makes for the request, so the rule is
  `postgresVaultDB`'s (or the host's own ServedVaultDB's), fed the user the host's auth verified.
  A refusal crosses as a fresh GraphQLError holding only the VaultError's message and
  `extensions.kind`; the VaultError (and through it the driver's error) is kept as that error's
  unenumerable `cause`, set after construction, never as its `originalError`: Yoga masks an error
  whose original is not a GraphQLError, and in development mode sends the original's message,
  stack and `cause` to the browser. Anything a VaultDB throws that is not a VaultError crosses as
  `storage_unavailable`. Unlock envelopes cross as opaque JSON that GraphQL does not check; only
  the core's VaultDB validation does, so a user can write a malformed envelope into their own
  vault and no one else's. The browser's urql Client may keep vault records (ciphertext and public
  fields) in its document cache, though every vault query is `network-only` and never answered
  from it. A subscription's user is fixed when it starts (over a websocket, when the connection
  opened), so a session revoked meanwhile keeps hearing the vault's scope -- never a record --
  until the subscription ends.
* 2026-10-15: **a second implementation behind one label.** `safebyok-argon2-wasm` runs Argon2id
  through `hash-wasm` (4.12.0, MIT, no dependencies; its Argon2 is C written for it after Go's
  `x/crypto/argon2`, compiled to WebAssembly and embedded in its JavaScript; widely used, but
  with no published audit, as the core's `@noble/hashes` Argon2id has none: its README says its
  one audit left `argon2` out of scope), under the same specs and
  labels as the core's `@noble/hashes` deriver, `argon2id_web_v1` included. It checks a spec with
  the core's own `parseKeyDeriverSpec`, so its bounds are the core's by construction; hash-wasm's
  own limits (a salt of at least 8 bytes, memory of at least 8 KiB a lane, below 4 GiB) are no
  narrower. That the two derive the same bytes is a test, not a claim: both are held to Argon2id's
  reference test vector, and to each other byte for byte across the supplied spec and cheap specs
  that press on lane counts, memory not divisible into segments, the shortest and longest salts,
  and non-ASCII passphrases; a vault made under each opens under the other. A difference would
  strand vaults across devices rather than weaken them. Its derivation runs in one synchronous
  WebAssembly call (about 130 ms at `argon2id_web_v1` in Node, against the core's 580 ms), so it
  holds the thread rather than yielding as the core's does. It needs `'wasm-unsafe-eval'` in a
  page's Content-Security-Policy, and refuses (`bad_option`) where WebAssembly will not compile
  or is missing (Hermes): it never falls back to another deriver on its own. Unlike
  `@noble/hashes`, which zeroes its Argon2 blocks and H0 when a derivation ends, hash-wasm leaves
  its working memory (the spec's whole memory_kib, in a fresh WebAssembly instance, and in Node
  the passphrase's UTF-8 bytes in a pooled Buffer) as it is, for the garbage collector: material
  from which the passphraseKey follows stays in the heap until then.
* 2026-10-15: **Dependencies: hash-wasm has no published audit.** `safebyok-argon2-wasm`'s one
  runtime dependency, `hash-wasm`, derives the passphraseKey for every vault made or opened
  through it, and no audit of it, or of the C its WebAssembly is compiled from, has been
  published. Nor has one of the core's Argon2id: `@noble/hashes`'s one audit (Cure53, January
  2022, at 1.0.0) left its `argon2` out of scope. hash-wasm's working memory is never zeroed
  (the entry above).
* 2026-10-15: the IndexedDB vault store moved to a package of its own, `safebyok-indexeddb`, and
  each of its write verbs (`createBundle`, `updateBundle`, `updateBox`, `eraseBox`, `eraseVault`)
  is now one readwrite IndexedDB transaction, which reads the standing rows, compares them with
  the expectation, and writes; a failure anywhere in it aborts it, writing nothing. IndexedDB runs
  readwrite transactions over one store one after another, across the origin's tabs, so the
  windows the `idbVaultDB` entry above records are closed: no write lands over a row another tab
  changed meanwhile, two tabs creating a vault settle on one, and no lockbox outlives an erased
  vault. The guarantee rests on the work inside awaiting only IndexedDB's own requests (awaiting
  anything else lets the browser commit the transaction early, and the next request throws);
  `src/shelf.ts`'s `inOneTransaction` says so. Its rows, ckeys and database name are unchanged,
  and its change bell, a BroadcastChannel per database, still carries no scope and no record.
* 2026-10-15: every `VaultDB` declares a `maxLockboxes`, the most lockboxes its backend holds in
  one vault (`Infinity` for none), and `openVault` refuses (`bad_option`) a `maxLockboxes` above
  it, defaulting to the smaller of it and `MaxLockboxes`. The core offers no "unlimited" constant:
  each store sets its own. `localVaultDB` and `idbVaultDB` declare `Infinity` and enforce nothing;
  `convexVaultDB` declares the component's 8,000; `graphqlVaultDB` declares what its host says the
  server enforces (default 1000), which only moves `openVault`'s check: the server's own refusal
  is the limit. `postgresVaultDB` enforces its `maxLockboxes` (default 1000; a host wanting none
  passes a large safe integer) inside the one statement that inserts a new lockbox, against a
  `lockbox_count` column on the bundle row that an `AFTER INSERT OR DELETE` row trigger on
  `safebyok_lockboxes` keeps, so writes by any statement, the host's own SQL included, keep it
  true (a `TRUNCATE` of the lockboxes alone does not). The insert locks the bundle row
  (`FOR UPDATE`) and compares the count it locked: under READ COMMITTED, a statement that waited
  for the lock is handed the row as its forerunner left it (Postgres re-reads a row it waited to
  lock), so two inserts racing for the last place cannot both land; under REPEATABLE READ or
  SERIALIZABLE, the waiter fails with a serialization error, refused as `storage_unavailable`. A
  bare `count(*)` in the insert would not hold under READ COMMITTED, each statement counting from
  its own snapshot. This is reasoned from Postgres's documented semantics; the tests run on PGlite,
  one connection, and cannot race. `eraseBox` locks the bundle row before deleting, so an erase's
  count update and a waiting insert cannot deadlock. Holding the lock also keeps the bundle, so the
  insert no longer meets a foreign-key failure from a vault erased meanwhile. A replacement is never
  refused for the count, nor is a first write whose boxlabel is already taken (it refuses as
  `stale_write`): the insert re-reads only the locked bundle row, its view of the lockboxes being
  the statement's snapshot, so a full vault is told from a stale writer by one fresh read of the
  vault and that boxlabel before refusing. Under REPEATABLE READ or SERIALIZABLE, any two concurrent writes that
  add or remove a lockbox in one vault can fail with a serialization error (`storage_unavailable`),
  each moving the bundle row's count. A host's own SQL deleting lockboxes must lock the bundle row
  first, or it may deadlock with `eraseVault`; the DDL's comments and the README say so, and give
  the recount statement for a count gone astray. The refusal's message names the limit, never a
  boxlabel or a record.
* 2026-10-15: a host's own checks replace ours for every name and the note
  (`openVault({ validators })`, any Zod 4 schema), with no floor beneath them, since the ckeys
  (JSON tuples) and the cipher binding (a JSON array) take any text. What holds: **a check only
  checks** -- what the host passed is what is stored and bound, never the schema's output, so a
  trimming or lowercasing schema cannot move a user to another vault or strand ciphertext; **the
  refusal is ours**, `bad_label` or `bad_option`, naming the field and never quoting the name or
  the schema's issues; a schema that is async or throws is refused as misuse, never taken as a
  pass, and the refusal carries nothing of what it threw (no `cause`), as a refine that throws
  may quote the name or note, and any text, a pasted key among it, may now be one.
  **Every name is checked everywhere**: the vault and every `VaultDB` verb check with the same
  bag, records read back included, so a stored row whose name or note the vault's checks refuse
  is `corrupt_record`, not trusted; the bag never reaches storage or the Convex server, which take
  any text. The stored records (`Lockbox`, `VaultBundle`, `DeviceUnlock`, `VaultScope`) now check
  names only as text, as does an unlock envelope's `unlocklabel`: the `Label` grammar holds when a
  way in is added (`addPassphrase`, `addPasskey`), and a stored envelope under another label still
  opens, since the host's validators have no slot for it. A host's schema runs on names and the note only, never on a whisper or a
  passphrase. A host that admits any text (`AnyTextValidators`) shows its users labels that may
  carry bidirectional or invisible characters, a spoofing risk in its UI that is the host's to
  mind. **Sizes**: with names and notes unbounded, the static 2 KiB allowance no longer bounds a
  lockbox's other fields. It stays only as openVault's plan for `maxLockboxes` at the default
  checks; `updateBox` now weighs each lockbox with its scope as the UTF-8 bytes of its JSON and
  refuses one over the adapter's `maxRecordBytes` (`lockbox_too_large`), and each `store()`
  refuses a lockbox heavier than the one it replaces when the vault, each lockbox counted at twice
  `maxWhisperBytes`, 512 bytes for its fixed-size fields and its measured names and note, would
  pass `maxVaultBytes` (`vault_full`). The vault's total is reckoned from the snapshot's listing,
  so a vault another device filled meanwhile is caught by the backend's own limit, as before.
