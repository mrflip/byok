# Security: decisions to look at

Describe decisions here that, in your judgement, could merit closer security review, or could
interact with later decisions to create a security issue. Do not justify why they are, or are not,
concerning; do not predict what might heighten concerns. Instead, in a sentence or so, brief a
security expert who knows what questions to ask.

## Of Interest

* 2026-10-15: `mask` (`safebyok/utils`) takes a whisper and returns text meant for display: its
  first and last few characters (two and four by default, at the caller's choice) and, up to
  `maxLen` (15 by default), its length. Beyond `maxLen` the result is fixed-width
  (`head***...***tail`), or `maxLen` stars when even that does not fit, so the length stops
  showing; a `head` and `tail` large enough to cover a short whisper show it nearly whole, and
  `minStars: 0` shows a short one entirely. Every result, even the stars, goes through a final
  normalization that strips combining marks, control, format, surrogate, private-use and
  unassigned code points, spaces, ignorable code points, bidirectional controls and the two
  symbols drawn blank, U+2800 and U+1D159 (strong right-to-left letters stay), so it is one
  plain line that cannot reorder or overwrite what displays beside it. It throws `bad_option` or `bad_whisper` without quoting its input.
* 2026-10-14 (revised 2026-10-15 for the push-to-main workflow): the package is staged on npm by `.github/workflows/release.yml`, run on every push
  to main (when the Coach has merged the Version PR, and a version npm lacks is waiting),
  authenticating by npm's trusted publishing (OIDC, no stored token) from the `npm`
  environment, with provenance. The `pack` job runs `pnpm justify` (lint, typecheck, tests and
  the build) before `publish`, which runs no package's scripts. A maintainer's 2FA approval makes
  the staged version public; CI cannot give it.
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
  JS, audited, no WASM -- at about half a second per derivation in V8. AES-256-GCM encryption,
  key wrapping and randomness come from WebCrypto (`crypto.subtle`, `crypto.getRandomValues`).
* 2026-10-14: the key deriver is a seam (`OpenVaultOpts.keyDeriver`): the pinned Argon2id deriver
  was the default until 2026-10-15 (below), tests substitute a cheap SHA-256 deriver, and a stored vault records its
  deriver's label and refuses to unlock under any other.
* 2026-10-15: `openVault` has no default key deriver: `keyDeriver` is required, and
  `browserOpts()` (the `safebyok/browser` entry) supplies the pinned Argon2id one. An app that
  passes none is refused with `bad_option`, never quietly given one. `openVault` imports no
  Argon2id and the main entry nothing from `safebyok/browser`, but the main entry still
  re-exports `argon2idWebV1Deriver`: Argon2id stays out of an app only where a bundler
  tree-shakes it (the package is `sideEffects: false`), not under a plain `require('safebyok')`
  or an unbundled import. Substituting a deriver still commits every vault made under it to its
  label, as above.
* 2026-10-14: every encryption binds its context as AES-GCM additional data
  (`cipherAdditionalData`): format, applabel, user_id, vaultlabel, vaultId, plus passphraseEpoch
  for key wraps and boxlabel + revisionId for lockboxes, encoded as a JSON array. Ciphertext
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
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection.
* 2026-10-14: `zod` moved from a regular dependency to a peer dependency (`^4.0.0`): the host app
  supplies it, so safebyok validates with whatever zod instance that app ships.
* 2026-10-15: storage writes are versioned updates (`VaultDB.updateBundle`, `updateBox`). A
  bundle update carries the `vault_id` and `passphrase_epoch` it was proven against, and lands
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
  synchronous step; the Convex adapter is planned to check inside its mutation's transaction.
* 2026-10-15: `idbVaultDB` performs its versioned updates, its erases and `createBundle` as a
  read, then a separate write, in separate IndexedDB transactions: another tab writing in
  between can still be buried, two tabs can each create a bundle, and a vault another tab
  destroys and makes anew in between can still lose a lockbox (`eraseBox`) or be erased whole
  (`eraseVault`). Its `eraseVault` also lists the vault's rows in one transaction and deletes
  them in another: a lockbox another tab writes in between survives the erase, orphaned without
  a bundle. Doing these inside one IndexedDB transaction is a ruled TODO, not yet built.
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
  passphrase against it. A passphrase changed elsewhere does not stop a stale session's
  `store()` or `erase()` (their expectations carry no epoch); the session relocks on its next
  look at the bundle.
* 2026-10-14: the unlock window (`forcePassphraseReentryHours`, `rememberForMs` until 2026-10-15)
  is chosen by the app at each `openVault`, so two devices on one vault may hold different
  windows. It is client-side politeness, not a vault-wide synced policy: nothing stored enforces
  it across devices, and a modified client could choose any window it likes. The real bounds
  stay the passphrase and the device-bound localUnlockKey.
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
* 2026-10-15: the Convex component (`packages/safebyok-convex`) authenticates in the host app,
  not inside the component (where `ctx.auth` does not exist): `SafebyokComponent.api({ getUserId })`
  builds the nine public functions the host re-exports, and each refuses unless the host's
  `getUserId(ctx)` returns a non-empty id equal to the scope's or bundle's `user_id`. The
  component's own functions check no caller and trust their `user_id` argument; Convex lets only
  the host app call them, so a host that wraps them itself, without this check, exposes every
  user's rows.
* 2026-10-15: the Convex component validates records structurally only (fields, types,
  optionality, the `format` literal); the label grammar, non-empty ids, a positive whole
  `passphrase_epoch` and a note's length are checked by the client's Zod records, not on the
  server. A signed-in user can therefore store malformed rows in their own vaults, which their
  own clients then refuse as `corrupt_record`.
* 2026-10-15: the Convex component checks each update's and erase's expectation by reading the
  standing rows inside the same mutation that writes, relying on Convex's serializable
  transactions; a failed expectation resolves `false` rather than throwing. `createBundle` is a
  find-or-insert in one mutation; the indexes are not unique, and a second bundle row for one
  scope would make every later call on that vault fail (`.unique()` throws) rather than pick one.
* 2026-10-15: the Convex component's refusals carry `ConvexError` data of a fixed `kind`
  (`not_permitted`) and a fixed message; neither names the user or quotes a record. Its functions
  log nothing.
* 2026-10-15: Convex's own argument and return validation errors quote the value they refused.
  A malformed call to one of the Convex component's functions therefore writes its arguments --
  `user_id`, scope, notes, ciphertext, never plaintext or keys -- into the host's Convex logs,
  and on a dev deployment back to the calling client as well. safebyok's own refusals
  (`not_permitted`) quote nothing.
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
* 2026-10-15: a vault's lockbox count is capped on the client only (`maxLockboxes`, `store()`
  refusing `vault_full`), counted from the handle's last look at storage, so stores of new
  lockboxes running at once -- on several devices, or on one handle, since nothing serializes
  them -- can overshoot it. Neither in-tree backend enforces a count or a size per vault. On
  Convex, where `destroy()` erases the vault in one transaction under a 16 MiB read budget, a
  vault grown past what the cap admits (by a modified client, or many overshoots) may become
  impossible to erase whole: the vault half of deleting an account.
* 2026-10-15: records crossing into the core are checked where they cross, and trusted past it.
  A host's `store()` note is checked against the stored lockbox's own schema before anything is
  written (an unchecked over-long note once made every later `openVault` refuse the vault as
  `corrupt_record`). Whatever a `DeviceDB` hands back -- the host may supply its own -- is checked
  against `DeviceUnlock` by the vault, and one that does not pass is erased and reads as no
  remembered unlock. `VaultDB`'s write verbs check labels and scope only, not the records the
  vault builds. A remembered unlock's `expires_at` is not bound into its encryption, so whoever
  can write this device's IndexedDB can extend it (to any finite number of milliseconds).
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
* 2026-10-15: `store()` retries a write storage refused as stale, up to three attempts in all.
  Every attempt reads the box afresh and seals the whisper anew, under its own lockboxKey and
  `revision_id`: a refused attempt's ciphertext is never reused, so no two ciphertexts share a
  binding. The retry's first act is to require unlocked, so a refusal that caught the device up
  with a vault reborn elsewhere (or a changed passphrase) relocks it and ends the retry as
  `vault_locked` before any whisper is sealed for the new vault. A retry overwrites what the
  other device wrote (last writer wins), as a host's own retry did, except that a box erased
  elsewhere is not brought back (an erase wins: `stale_write` at once); `erase()` is never retried.
* 2026-10-15: the published package has a `safebyok/testing` entry point exporting
  `testDeriver`, a KeyDeriver that is one SHA-256 of passphrase and salt, labelled
  `test_digest_v0`. `openVault` accepts any KeyDeriver, so nothing stops a host passing it to a
  real vault; a bundle records the label of the deriver that sealed it. The entry imports vitest,
  an optional peer, and is not imported by `safebyok` or `safebyok/idb`.
* 2026-10-15: the public packages' `exports` carry a `@safebyok/source` condition pointing at
  `src/`, for the workspace's own tooling; `pnpm pack` ships `publishConfig.exports` (dist only)
  instead. `scripts/release.ts` refuses a tarball that still carries the condition, and each
  public package's `prepublishOnly` refuses a publish not run by pnpm.
