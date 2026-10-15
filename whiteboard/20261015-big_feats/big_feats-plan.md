# Sprint big_feats -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach)
* **Status**: paused 10:18 UTC for an hour at the Coach's word (human/20261015-sprint_big_feats_paused.md)

## Read first

Beyond CLAUDE.md, and STYLE.md and VOCABULARY.md before naming anything or writing a test:

* `TODO.md` on your base: your thread's entry (roadmap 3's first bullet for threads 2 and 3,
  roadmap 6 and 8, the *Side quests* for 4 to 6). It is the Coach's design intent; this plan
  glosses it.
* `human/20261015-sprint_second_harvest_done.md` and
  `whiteboard/20261015-second_harvest/second_harvest-plan.md` (on your base): what the stack below
  you just built -- zod/mini, epoch-ms times, the clock checks, the pluggable logger, `TH` test
  helpers published as `safebyok/testing` (whose `describeVaultDB` is the shared adapter suite).
* `notes/security.md`, and for threads 2 and 3 `whiteboard/20261014-crypto/decisions.md`.
* For threads 4 to 6, `packages/safebyok-convex/` as the packaging template (package.json,
  tsdown, eslint cut from the core's, vitest, README), and `packages/safebyok/src/vault-db.ts`.
* **The concurrent sprint.** Another sprint, **gripe_fixes**, is running beside this one on the
  same base, in different worktrees. Its plan is
  `/workspace/byok-gripe_fixes/whiteboard/20261015-gripe_fixes/gripe_fixes-plan.md` (read-only to
  you). Its thread 1 (`kdf_configs`) reshapes `KeyDeriver`; its thread 2 (`vaultdb_validation`)
  tightens `vault-db.ts`, `idb.ts` and `vault.ts`; its threads 4 (`ci_tooling`), 7
  (`test_helpers`) and 8 (`comment_width`) touch package scripts, tests and comments everywhere.

## Ground rules

* **The base is [#63](https://github.com/mrflip/safebyok/pull/63)'s tip**, `ea4b93d`
  (`origin/20261015-draft_version_pr`), the top of the second_harvest merge stack: merging #63
  with a merge commit lands the whole stack unchanged, so a branch cut from it needs no rebase
  afterwards. A thread cut there says **"Stacked on #63"** first thing in its PR body; one cut
  from another thread says "Stacked on #N" for that thread instead.
* **Push only with an explicit refspec**:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
* **Small, additive hunks in shared files.** `notes/security.md`, `VOCABULARY.md`, `vault.ts`,
  `vault-db.ts`, `.changeset/config.json`, `pnpm-workspace.yaml`: the gripe_fixes threads edit
  them too. Add; don't reorganize.
* **New packages** (threads 1, 4, 5, 6) copy `safebyok-convex`'s packaging as it stands on your
  base: `safebyok` as a peer dependency (so `instanceof VaultError` holds across them), their own
  `eslint.config.mjs` cut from the core's, a README, a changeset, and a place in the `fixed`
  group of `.changeset/config.json` (a test refuses a public package left out).
* **Runtime dependencies the Coach has named, and so has said yes to**: `hash-wasm` (thread 1),
  urql's `@urql/core` as a peer (thread 6). Anything else at runtime is proposed in your report,
  not added. Development dependencies that are plainly the boring answer (PGlite, `graphql`,
  `fake-indexeddb`) may simply be installed: say so.
* **Storage adapters store records field by field, as the Convex component does** (the Coach,
  correcting the orchestrator's first rule). Every public field is its own typed column (the
  scope, ids, `passphrase_epoch`, `boxlabel`, `revision_id`, the times); each ciphered value
  (`Ciphered`) and any structured public payload (the envelope list `unlocks`, after thread 2) is
  its own opaque column (`jsonb`, or the backend's equivalent). Never one blob per record. The
  cipher binding is rebuilt from field values, not from stored bytes, so `jsonb`'s key reordering
  is harmless; strings are stored as-is, no unicode normalization. An adapter compares only the
  scope, `boxlabel`, `vault_id`, `passphrase_epoch` and `revision_id`. Because the columns follow
  the bundle's shape, **thread 5 rebases onto thread 2 before filing** (see *Order*).
* **`passphrase_epoch` keeps its name in this sprint** (YOLO decision 2). Do not rename it.

## Threads

### 1. argon2_wasm

> hash-wasm as a pluggable KDF

*Gloss.* TODO roadmap 6: a package, `safebyok-argon2-wasm`, exporting a `KeyDeriver` over
hash-wasm's Argon2id, `hash-wasm` its dependency and `safebyok` a peer. The core keeps noble as
the default in `safebyok/browser`. It wears the same label, `argon2id_web_v1`, with the same
parameters; a test derives one fixed passphrase and salt through both implementations and
compares the bytes -- that test is what makes "same spec" a fact. README: Hermes has no
WebAssembly, so not for React Native. Measure both derivers' time in Node and report it.

*Base*: **gripe_fixes thread 1, `kdf_configs`**, once it has filed (cut from its tip; "Stacked on
#<its PR>"). It adds `KeyDeriverSpec`, an `argon2idDeriver(spec)` factory, and the rule that a
deriver wearing a supplied label must carry that spec's parameters. So this package exports the
wasm twin of that seam: `argon2idWasmDeriver(spec)` (or as STYLE.md names it) and a ready
`argon2idWasmWebV1Deriver`, both spreading the spec, so a host may run its own spec through
WebAssembly too. *Fallback*: if every other thread of this sprint has started and `kdf_configs`
still has not filed, the orchestrator cuts this from #63 instead, and the deriver is
`{ ...Argon2idWebV1, deriveKeyBytes }`, which fits both shapes.
*Touches*: a new `packages/safebyok-argon2-wasm/`, `.changeset/config.json`, the lockfile,
`notes/security.md` (a second implementation behind one label). *Depends on*: kdf_configs.
*Look-ahead*: nothing later builds on it.

### 2. unlock_envelopes

> multiple unlock phrases (envelopes)

*Gloss.* TODO roadmap 3's first bullet, built now: the bundle's `key_deriver_label`,
`passphrase_salt_b64` and `vault_key_passphrase_wrapped` become `unlocks`, a list of envelopes
`{ method: 'passphrase', key_deriver_label, salt_b64, vault_key_wrapped, ... }`, each wrapping the
one vaultKey, each method with its own binding purpose. And the user may hold several
passphrases: add one, remove one, change one. A stored-format change, allowed before 1.0 with
no migration: an old bundle fails validation and reads as corrupt, and the changeset says so.

Calls this thread makes and records (recommendations, not orders):

* **An envelope has an id** (`unlock_id`, random) so it can be named for removal and change, and
  likely a host-chosen `unlocklabel` (a Label, "work laptop phrase") so a user can tell them apart.
  The envelope's own fields are in its binding.
* **What a locked vault shows.** The snapshot (or a method) lists the envelopes' public parts --
  id, method, label -- while locked. Thread 3 adds a passkey's `credential_id` and PRF salt to
  that listing, which a host needs *before* unlocking to ask the authenticator: design it to
  grow.
* **Unlock with several passphrases.** Keep a fresh salt per envelope (the standard; never share
  salts to save time). Then a passphrase is tried against each passphrase envelope, one Argon2id
  per envelope, or aimed at one by id. Pick, bound the worst case (a cap on envelopes is a fine
  answer), record the call and its unlock-time cost.
* **Never lock the user out**: removing the last envelope refuses. **Removal is not
  revocation**: whoever knew a removed passphrase and kept a copy of the old bundle still holds
  the vaultKey; rotation is out of scope. A `notes/security.md` entry says so.
* `passphrase_epoch` bumps on any envelope change and keeps its name (YOLO decision 2).
* The remembered device unlock (`vault_key_local_wrapped`) stays as it is: it is not an envelope.

*Touches*: `types.ts`, `vault.ts`, `crypto.ts` (purposes), the `TH` fixtures (`bundleOf`), the
Convex component's schema and validators, the React binding if it names bundle fields,
`notes/security.md`, VOCABULARY.md (envelope, unlock), README. *Depends on*: nothing; cut from
#63. *Look-ahead*: thread 3 stacks on this and adds the second method; leave the method a
discriminated union with one member, and the listing ready to carry method-specific public
fields.

### 3. passkey_unlock

> Fingerprint unlock (passkeys, hardware keys)

*Gloss.* TODO roadmap 8: the WebAuthn PRF extension yields 32 bytes per credential (passkeys and
hardware keys alike: a security key's `hmac-secret` is what PRF runs on). An envelope of method
`passkey` holds its `credential_id`, the PRF salt it was evaluated with, and the vaultKey wrapped
under a key made from those bytes (`importWrappingKeyBytes`, or HKDF first if the binding wants
it: follow a published construction, never invent one). Its own binding purpose. **The core takes
bytes; the WebAuthn call lives in the host or the React binding**, never the core: a small
framework-agnostic helper beside the React binding, or in it, is this thread's call. Adding a
passkey requires an unlocked vault; unlocking with one is an unlock like any other
(`askPassphraseAt` and the remembered device unlock apply as to a passphrase). A
`notes/security.md` entry on what a credential-held key does and does not protect against
(device theft with biometrics, a synced passkey's cloud account, removal not being revocation).
Tests mock `navigator.credentials`; no real authenticator is needed. The demo gains an "add
fingerprint" button if it is cheap.

*Touches*: `types.ts`, `vault.ts`, crypto helpers, `safebyok-react` (a helper and maybe dialog
copy), the demo, `notes/security.md`, VOCABULARY.md, READMEs. *Depends on*: thread 2 (cut from
its tip once filed). *Look-ahead*: none.

### 4. indexeddb_package

> The IndexedDB vault store as its own package

*Gloss.* TODO's side quest: `safebyok-indexeddb`, the documented example of a KV-store backend,
"duplicate this and type here, here and here", with its own tests, tsdown config and changeset,
so it is the template for packaging as much as for the adapter. `idbVaultDB` moves there;
`idbDeviceDB` stays in the core's `safebyok/idb` (the device store is a fact about the device,
not a backend choice). Duplicating the bell and BroadcastChannel plumbing is fine: a template
wants to be self-contained. Before 1.0 nothing binds backward, so `safebyok/idb` stops exporting
`idbVaultDB` outright: no re-export shim; the changeset says what a host changes (one import).
`browserOpts()` and the demo follow. Run `TH.describeVaultDB` over it. If the move makes the
truly atomic `versionedUpdate` side quest (one IndexedDB transaction) natural, it may come
along, declared.

*Base*: **gripe_fixes thread 2, `vaultdb_validation`**, once it has filed (cut from its tip;
"Stacked on #<its PR>"): it validates `idbVaultDB`'s `dbName` and VaultDB's inputs, and moving the
code before that lands would leave it a modify/delete conflict. *Fallback*: as for thread 1, cut
from #63 once nothing else can start. *Touches*: a new `packages/safebyok-indexeddb/`, the core's
`idb.ts`, `browser.ts`, `package.json`, `index.ts` docs, the demo, the README.
*Depends on*: vaultdb_validation. *Look-ahead*: threads 5 and 6 are SQL and wire backends; this
README is where "how to write an adapter" starts, so write it for an adapter author.

### 5. postgres_vaultdb

> Postgres Vault DB

*Gloss.* TODO's side quest: `safebyok-postgres`, the example of a SQL backend. Recommended shape
(the thread's call, recorded):

* **No driver dependency.** The host passes a query function, `(text, params) => Promise<{ rows }>`,
  which `pg`'s `Pool.query` and PGlite's `query` already are (postgres.js needs a one-line
  wrapper; the README shows it). Tests run against a real Postgres in-process with PGlite
  (`@electric-sql/pglite`, a development dependency).
* **The SQL ships with the package**: the table DDL as an exported string (and/or a `.sql` file),
  a column per public field and a `jsonb` column per ciphered value (*Ground rules*), with a
  trigger that `NOTIFY`s on change.
* **Every verb is one statement**, so each is atomic without a transaction API: `versionedUpdate`
  is an `UPDATE ... WHERE vault_id = $ AND passphrase_epoch = $`, a lockbox write a single
  statement checking the standing bundle, an erase a `DELETE` guarded the same way.
* **Where it runs.** Postgres has nowhere to run the vault's verbs, and the vault runs in the
  browser: this VaultDB runs on the host's server, made per request for the signed-in user, and
  refuses (`not_permitted`) a scope naming anyone else -- the `getUserId` equivalent. The README
  gives the route recipe, and a short Supabase section (row-level security, realtime) if it is
  cheap.
* **Subscribe**: an optional `listen` hook the host wires to `LISTEN` (pg's notifications,
  PGlite's `listen`); without it, the VaultDB does not push.

*Touches*: a new `packages/safebyok-postgres/`, `.changeset/config.json`, the lockfile,
`notes/security.md` (the server-side authorization rule). *Depends on*: thread 2, for the
bundle's columns. Built from #63; **before filing, it waits for thread 2 to file, rebases onto
thread 2's tip** (allowed: this branch is unpushed), moves its bundle columns to thread 2's shape,
and files "Stacked on #<thread 2>". *Look-ahead*: **thread 6 runs this VaultDB behind GraphQL resolvers**, per request, and pushes
its change notifications out as GraphQL subscriptions: export the per-request factory and the
change hook in a shape a resolver can call, and keep its errors VaultErrors with kinds a wire can
carry.

### 6. graphql_vaultdb

> Graphql vault db (using the postgres vault db)

*Gloss.* TODO's side quest (urql), warned there as "not actually easy": subscribe and
`versionedUpdate` need resolvers on the host's server as well as a client. `safebyok-graphql`, in
two halves:

* **Server**: the schema as SDL (an exported string) and a resolver map over a VaultDB made per
  request -- in the README and the tests, thread 5's Postgres VaultDB -- so it drops into any
  GraphQL server (Yoga, Apollo, Mercurius) with no server dependency of ours. Records cross as
  JSON text, exactly as stored. A refusal crosses as a GraphQL error carrying its `kind` in
  `extensions`, never a record. Change notification is a subscription fed by the Postgres change
  hook.
* **Client**: `graphqlVaultDB(client)` over an urql `Client` (`@urql/core` a peer), mapping each
  verb to an operation and each error's kind back to a VaultError, and `subscribe` to the
  subscription.
* Tests run the whole round trip in-process: urql's execute exchange (or an equivalent) against
  `graphql-js`, PGlite behind, `TH.describeVaultDB` over the client.

*Touches*: a new `packages/safebyok-graphql/`, `.changeset/config.json`, the lockfile.
*Depends on*: thread 5 (cut from its tip once filed). *Look-ahead*: none.

## Order

* **Now**: threads 2 and 5, from #63.
* **When gripe_fixes files `kdf_configs`**: thread 1, from it. **When it files
  `vaultdb_validation`**: thread 4, from it. (Fallback: from #63, once nothing else can start.)
* **When thread 2 files**: thread 3 starts, and thread 5 (if ready) rebases onto it and files.
  **When thread 5 files**: thread 6.

## Decisions taken in YOLO

1. **The base is #63's tip, the top of the second_harvest merge stack**, not `origin/main`.
   *Orchestrator:* the sprint skill says a thread standing on two unmerged threads waits. I read
   the stack as one: it is linear, and the Coach merges it whole by merging its top, after which
   every branch cut from it sits on main with no rebase. Cutting from main instead would rebuild
   each thread on code the stack rewrites (zod/mini, the times, the logger, `TH`). The gripe_fixes
   sprint made the same call. If this reading is wrong, the threads wait for the stack to merge.
2. **`passphrase_epoch` is not renamed `unlock_epoch` in this sprint.** TODO leaves the rename to
   the envelopes thread, and once passkeys arrive the old name no longer fits. But the rename
   touches the `VaultDB` expectation that every adapter reads, and three new adapters are built
   in parallel with thread 2. One mechanical sweep across the core and all five adapters, once
   these PRs land, is cheaper than every thread chasing it. Recorded as a follow-up.
3. **Threads 1 and 4 wait on the gripe_fixes sprint's `kdf_configs` and `vaultdb_validation`**,
   which rework exactly what they build on. Each falls back to #63 rather than stalling the
   sprint.
4. **Thread 5 builds beside thread 2 and rebases onto it before filing**, rather than waiting to
   start. Its columns follow the bundle's shape (the Coach's field-by-field rule), so it cannot
   file on #63 alone; building in parallel and rebasing an unpushed branch costs one column
   change.

## For the Coach

* Two sprints are rewriting the core at once (big_feats and gripe_fixes), both on the
  second_harvest stack. Thread 2 (envelopes) and gripe_fixes' `kdf_configs` and
  `vaultdb_validation` all edit `vault.ts`; whichever merges second rebases. The workers are told
  to keep shared hunks small.
* `safebyok-indexeddb` makes `safebyok/idb` stop exporting `idbVaultDB`: a one-import change for
  hosts, made with no shim because nothing binds backward before 1.0.
