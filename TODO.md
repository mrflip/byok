# TODO

Four shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
**Not yet**: reasonable, deferred; do not anticipate them in your implementation.

The scattered small tasks have their own preplan, ready to start:
`whiteboard/20261014-low_hanging_fruit/20261014-low_hanging_fruit-preplan.md` (the vault-size
cap, explicit options with a `safebyok/browser` defaults export, the provider surfacing a failed
open, epoch milliseconds everywhere, `mask` in `safebyok/utils`, the boundary audit,
`stale_write` retry, a size budget in CI, the sand below, a docs sweep, the label-grammar
report).

## Open from second_harvest (the Coach, 2026-10-16)

Questions the second_harvest sprint left for the Coach
(`human/20261015-sprint_second_harvest_done.md`), each with the orchestrator's recommendation.

* **[#60](https://github.com/mrflip/safebyok/pull/60)'s four `lockSoon()` calls**:
  - the snapshot flips to locked at once, before the grace period ends (keep);
  - an unlock during the grace beats the pending timer (keep);
  - the grace is capped at 60 s (keep);
  - `close()` keeps the device record and throws `vault_closed` (keep).
* **[#55](https://github.com/mrflip/safebyok/pull/55)**: a lost `unlock()` (a lock won the race) rejects with
  `vault_locked`. Should it be `stale_write`? Recommend `vault_locked`: it says what the user must do next.
* **Release levels**: several changesets bump minor where patch might do. Recommend minor while pre-1.0: every one of
  them breaks a stored shape or an exported type.
* **Lint**: should `unicorn/prefer-iterator-to-array` be turned off while the lib target is ES2023? Recommend off
  until the target moves; its fixes need `Iterator.prototype.toArray`.
* **Minor findings the PRs left**:
  - [#64](https://github.com/mrflip/safebyok/pull/64): a clock that goes bad partway through `store`, `erase` or
    `changePassphrase` lets the write land, then throws from the closing refresh.
  - [#65](https://github.com/mrflip/safebyok/pull/65):
    - a storage watch that stays broken warns on every change event, with no rate limit;
    - a failed catch-up after a stale write is logged as "a background refresh";
    - `log` has no call site yet;
    - a logger written inline in JSX reopens the vault on every render (the README warns about it).
  - [#62](https://github.com/mrflip/safebyok/pull/62): `/* @__PURE__ */` on each schema would save `idbDeviceDB` about
    0.5 kB.
  - [#52](https://github.com/mrflip/safebyok/pull/52):
    - the build now lays modules out under `dist/src/`;
    - the published helpers in `tests/` get the test lint rules, not `src/`'s;
    - `makeGate`'s `prefer-promise-with-resolvers` disable now ships.
  - [#58](https://github.com/mrflip/safebyok/pull/58):
    - a backward clock step erases a fresh remembered unlock;
    - tabs opening with different settings erase each other's records.
* **Follow-ups**:
  - wrap deviceDB failures at open as `storage_unavailable`;
  - move `tallyWatches` into `safebyok/testing`, if #52 did not already take it.

**Ready to start, by the Coach's yes: a logger everywhere.** Every place a package swallows a failure reports it to
the vault's logger (`VaultLogger`, #65): first the Convex adapter's failing watch (`ignoreTrouble`), through a
`logger` option on `convexVaultDB`, so `VaultDB.subscribe` keeps its shape. Then sweep the other packages (the
IndexedDB device store, the React binding) for any other swallowed failure. The console stays the fallback when no
logger is given.

## Open from big_feats (2026-10-15)

What the big_feats sprint and its amendments leave open. Each item is its own later thread, so the
Coach can merge the stack and try it first. Already built in the amendments: the `unlock_epoch`
rename ([#84](https://github.com/mrflip/safebyok/pull/84)); a `maxLockboxes` each store declares,
which Postgres also enforces on the server ([#89](https://github.com/mrflip/safebyok/pull/89));
`addPasskey` checking its proof first, and the IndexedDB channel's `unref` and catch
([#88](https://github.com/mrflip/safebyok/pull/88)); `TH.perUser` in `safebyok/testing` and the
package names in CLAUDE.md ([#86](https://github.com/mrflip/safebyok/pull/86)).

* **Audit the VaultDB implementations and grow the standard battery.** `TH.describeVaultDB`
  (`safebyok/testing`) is already the shared suite. Convex, IndexedDB, Postgres and GraphQL each
  import it and run it on themselves, and the core runs it over `localVaultDB(memoryStore())`, the
  test-pony memory store it exports. The thread:
  * audits every adapter against the `VaultDB` contract;
  * moves into the battery whatever each package proves by hand that is really the contract;
  * then simplifies each package's bespoke tests to what is truly its own. Extra testing is fine,
    vacuous testing is not.
* **A race helper in the battery.** Concurrent writers are hard to prove, and every adapter must
  prove them. Give `safebyok/testing` a helper that opens two writers, each through its own store
  (the two-tab or two-connection case), interleaves them at the points that matter, and asserts
  the outcome: one lands, the other is `stale_write`. Today's race tests share one connection; a
  second writer through its own `createStore` would show the two-tab case directly.
* **Stores share a base class, and its error handling.** One theme runs through several open
  questions: common error classes, how failures are reported, no-op fallbacks where a verb is
  irrelevant to a store, and sugar methods. `VaultDB` is already an abstract class; this is the
  thread that decides how much more the base carries, so each adapter writes less. Swallowed
  failures belong here:
  * a rejected Postgres `listen`, a failed GraphQL client subscription and the Convex watch go
    silent today, and should reach the vault's logger;
  * a throwing listener is caught and dropped by IndexedDB's channel ([#88](https://github.com/mrflip/safebyok/pull/88)),
    while the core's in-memory store lets it escape the write that rang it. One catch in the
    shared `subscribe` fixes every adapter, and `reportError`, where the platform has it, is the
    option for not dropping it silently.
* **No null as an error's cause.** IndexedDB's `request.error` can be null on an abort, so a
  failed write's `cause` can be null. Report a calm "the write failed for an unknown reason"
  error instead, and never null.
* **IndexedDB reads only the scope's rows.** `listBoxes` and `eraseVault` read the whole store,
  every user's rows in that database, where a key range over the scope's prefix would do. The
  same thread revisits the bell's BroadcastChannel lifetime (it is `unref`'d since #88, but never
  closed).
* **The vault cap as a soft limit.** The Coach: the app's `maxLockboxes` is an alarm bell for the
  implementor (100 lockboxes may be unexpected) and, for some stores, a hard capacity limit. So
  the vault refuses additions past the app's number, and whether a store also *guarantees* it is
  that store's decision. #89's Postgres machinery is a lot of weight for that: a counter column, a
  trigger, a bundle-row lock on every lockbox insert and erase, and serialization failures at
  stricter isolation. Revisit whether Postgres should guarantee it at all, or simply declare a
  limit the vault enforces. No backward compatibility needed.
* **`listBoxRecords`** ([#73](https://github.com/mrflip/safebyok/pull/73), used by
  [#78](https://github.com/mrflip/safebyok/pull/78)): the recommendation is to move it into the
  `VaultDB` base class, so no store writes it (`human/20261015-sprint_big_feats_rulings.md`). It
  belongs with the base-class thread.
* **Try passkeys on a real authenticator** (Chrome platform passkey, Safari, a security key) once
  [#76](https://github.com/mrflip/safebyok/pull/76) merges: it is tested only against a fake
  `navigator.credentials`. Also check that `addPasskey`'s proof-first order still gets the prompt
  on a slow device or an older Safari, where the click's user activation may run out
  ([#88](https://github.com/mrflip/safebyok/pull/88)).
* **Still awaiting a ruling** (the rulings note explains each): adding `vault_id` and the scope to
  the passkey HKDF `info`; the epoch revocation note in `notes/security.md`; pnpm's
  `minimumReleaseAge` as a repo-wide age rule; `addPasskey`'s function-argument shape; Postgres's
  default limit of 1000.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

* The root scripts chain with `&&`, so a root-level failure hides package failures until it is
  fixed.
* Convex's `--no-error-on-unmatched-pattern` should go when it gets its own configs.
* The demo's coverage has no `include`.
* **The second flaky tamper test.** [#25](https://github.com/mrflip/safebyok/pull/25) fixed
  `packages/safebyok/tests/crypto.test.ts` with `tweakB64`; the same overwrite-with-`A` remains in
  `packages/safebyok/tests/vault.test.ts` ("a lockbox with altered ciphertext refuses to open")
  and fails one run in sixty-four. Use the helper. (Low-hanging-fruit thread 10 sweeps it in.)
* **Click through the demo's passphrase dialog.** No agent has a browser, so the dialog in
  `demos/safebyok-demo-react` has never been exercised by hand since `safebyok-react` became a
  built package. `pnpm --filter safebyok-demo-react dev`, then set, enter, mistype and dismiss a
  passphrase; anything odd becomes a TODO.
* The root eslint config does not ignore a root `dist/`, so a stale build from before the core
  moved (gitignored, so invisible to `git status`) fails the whole justify with thousands of
  warnings. Ignore `**/dist/` at the root; until then, `rm -rf dist` at the root clears it.

## Roadmapped

In order. A later item that depends on an earlier one says so.

### 1. Releases: version, bump, publish all work -- built, unproven

Sprint **pr_releases** landed ([#15](https://github.com/mrflip/safebyok/pull/15),
[#16](https://github.com/mrflip/safebyok/pull/16),
[#22](https://github.com/mrflip/safebyok/pull/22); its sprint doc is
[#23](https://github.com/mrflip/safebyok/pull/23)): PROCESS.md *Releases* is the contract now.
What remains is the first real release, which only the Coach can run, and which proves or
disproves the machinery:

* The npm staging questions: does a staged version keep the `--tag` it was staged with when
  approved? Is the provenance statement still attached after approval? Does a rejected stage use
  up its version number? The trusted publisher's dist-tag permission is on but unused (the
  workflow installs npm 12.2.0, which can). Details in `human/20261014-staged_publish.md`.
* The Coach's switches before the first release (the sprint's progress file lists them): allow
  Actions to create PRs, the first changeset, the tag ruleset, a token for the Version PR's CI.
* Deprecate `safebyok@0.0.0` once a real version is live.
* Before `safebyok-convex` joins the lockstep group: `safebyok` becomes its peer (today a
  dependency, so a host could hold two copies and `instanceof VaultError` would fail across
  them; low-hanging-fruit thread 10), and the package gets a publishable `dist/` (2).

### 2. Convex backend, documented well enough to test from another app -- built, unwalked

Sprint **convex_vaultdb** landed ([#17](https://github.com/mrflip/safebyok/pull/17) to
[#21](https://github.com/mrflip/safebyok/pull/21)): the storage verbs with versioned updates,
the component, `convexVaultDB(client, api.safebyok)`, and a README that already says what is
stored and how big a vault can be. CI covers the package (`pnpm -r`). What is left:

* **The Coach walks the README cold in the other app.** That walk is the acceptance test; what
  trips becomes a TODO. Before it, the vault-size cap (3), so the README's "about 150" becomes
  a number the library enforces.
* **A demo over Convex** (the React demo gains a Convex store beside IndexedDB), so a second
  device seeing a write is something a person can click through.
* **Component packaging**: a publishable `dist/` with `convex.config` and the generated types
  (design.md's open question, still open), and `safebyok` as a peer (1).
* **Rulings the sprint asked for** (`human/20261015-sprint_convex_vaultdb_done.md`): whether a
  vault locks itself on `not_permitted` (sign-out); `destroy()` on a handle that never saw a
  bundle resolving without erasing, and a retry after a refused `destroy()` taking the reborn
  vault; whether the label grammar is enforced server-side; the tests' `react` dev dependency
  (keep, recommended); the first-emit deviation of `watchVault` (accept; design.md records it).

### 3. Reservations before the first release: the stored format and the public surface

Nothing is published but `0.0.0`, and every vault that exists is a development one, so a change
to the stored shape costs nothing today and a passphrase-gated migration later (the `format` tag
is bound into every encryption, so a reshaped record cannot be upgraded in place: it is
re-wrapped at the next unlock). One thread, cut from `main` once storage_verbs lands, before the
first release; the Convex sprint's component thread puts the same columns in its tables now.

* **The bundle holds a list of unlock envelopes, not one.** *Built: [#71](https://github.com/mrflip/safebyok/pull/71) (sprint big_feats), with several passphrases; `passphrase_epoch` kept its name (see *Open from big_feats*).* Today: `key_deriver_label`,
  `passphrase_salt_b64`, `vault_key_passphrase_wrapped`. Reserved: `unlocks`, a list of
  `{ method: 'passphrase', key_deriver_label, salt_b64, vault_key_wrapped }`, where a passkey
  envelope later adds `credential_id` and a recovery envelope its own method. The binding's
  purpose string already names the method (`vault_key_passphrase_wrapped`), so each method gets
  its own purpose and nothing already bound changes. `unlock_epoch` stays bundle-wide (it is
  the `versionedUpdate` expectation) and bumps when any envelope changes (renamed from
  `passphrase_epoch`, built). This is what makes fingerprint unlock (8) and recovery
  keys (*Not yet*) additive.
* **The lockbox names its whisper codec and schema version.** `whisper_codec` (default
  `json_v1`, the stringifier label a pluggable stringifier will later vary) and
  `whisper_schema_version` (default 1, ruled). Both go into the lockbox's cipher binding now, so
  a swapped label is a tamper the AEAD refuses; adding them to the binding later would be a
  re-encryption of every lockbox. (This moves the schema-version half of low-hanging-fruit
  thread 5 here.)
* **Every field the library writes is in the binding** (ruled: if we provide it, it is our
  name on the delivery truck). Additional data is already the queryable-but-tamper-proof
  design: stored outside the ciphertext, rebuilt on read, refused by the tag if altered. Today
  it is a positional array (format, scope, vault id, boxlabel, revision id, purpose). The
  thread's first decision: bind **the whole public header** instead, every stored field but the
  ciphertexts, canonically serialized (`stableJsonify`) as written, before zod fills any default.
  Then every future field is authenticated the day it appears, stripping one is detected, and
  nothing below needs reserving for the binding's sake (the envelope list still does, for its
  shape). If the positional array stays, the fields below are added to it now. Either way a
  backend must store strings as-is, no unicode normalization: the adapter README says so. An adapter's own columns
  (Convex's creation time, a Postgres default, response times) are never in the record or the
  binding; the Convex design already strips them on read, and surfacing them to a host is a
  later additive field on the listing. What no tag gives is verification while locked: a signed
  listing would need a vault signing keypair, and it is additive later, so it is not reserved.
* **Every time is UTC epoch milliseconds, an integer** (ruled; now in STYLE.md; **built**,
  second_harvest thread 6, with the two bullets below it): stored
  records, the snapshot, the device record, the Convex columns, the demo's own records. The
  low-hanging-fruit `epoch_millis` thread does the code outside the stored records; the records
  switch here, with the rename below, since the old fields go anyway.
* **Timestamps named for the event, as epoch-millisecond integers, and only three** (built). Lockbox
  `registered_at` (first stored through the library; carried forward) and `changed_at` (ruled
  the stronger contract: it moves only when the serialized whisper differs; `store()` decrypts
  the previous whisper, which it already fetches, compares the serialized forms, and carries
  `changed_at` forward when they match while still writing a new revision; a previous record
  that will not decrypt is clobbered and counts as changed; `notes/security.md` records that a
  `changed_at` standing still across a write tells the backend two consecutive payloads were
  equal, one bit, only when a host re-stores identical content); bundle `registered_at`. Today's `created_at`/`updated_at` go: `updated_at` bumps on every
  store whether or not the contents changed, so it is a row fact under a content name, and the
  bundle's is redundant with the unlock epoch. The lockbox's ISO strings and the device
  record's epoch numbers become one convention (integers, which the clock seam already yields
  and any index sorts).
* **`note` goes; a bound `public` bag is reserved in its place** (recommended, awaiting the
  Coach's word: a library-named note is slop, since the boxlabel already names the box for the
  locked listing; the alternative is to carry nothing public but the label, and let hosts keep
  their own table keyed by boxlabel). The demand behind it (the demo wanted `service` and
  `hint`) becomes one bag the library never interprets: any JSON, stored stable-serialized
  (`stableJsonify`) and unpadded, default `{}`, in the binding, with the same "never secret
  material here" warning. No cap of its own (ruled): `maxWhisperBytes` measures the serialized
  whisper plus the serialized bag together, both unpadded, since both share the record; padding
  then applies to the whisper alone, inside the encryption. Reserved now because a bound field
  cannot be added later without re-encrypting every lockbox. The demo moves its note into the
  bag; the Convex table omits an empty bag as it did an absent note.
* **The device record's deadline is named for its consequence** (built): `expires_at` becomes
  `ask_passphrase_at` (see 4). Local-only, so this one is cheap at any time.
* **A vault has a size cap, mirrored on the adapter** (low-hanging-fruit thread 1 builds it;
  listed here because it is a surface to settle before the release). Today nothing caps how
  many lockboxes a vault holds, and on Convex listing, watching and erasing each read the whole
  vault in one 16 MiB transaction (erase reads it twice): past about 150 of the largest default
  lockboxes a vault cannot be erased, so "delete my account" fails, and every write re-lists a
  vault that only grows. The pattern already used for `maxWhisperBytes` against
  `maxRecordBytes`: `openVault` takes `maxLockboxes` (default 100, the host raises it freely),
  the adapter declares `maxVaultBytes` (Convex: 8 MiB, half its read budget; IndexedDB and
  local: Infinity), and `openVault` refuses as `bad_option` when `maxLockboxes` times
  `maxWhisperBytes` exceeds it, so raising either knob keeps the erase guarantee. `store()` of a
  new boxlabel at the cap refuses as `vault_full`, a condition the user can act on. A batched
  erase is not needed once the cap holds, and would leave list and watch unbounded anyway.
* **Surface names that are breaking after `0.1.0` and free before it**: `keyDeriver` required
  (low-hanging-fruit thread 2); `rememberForMs` -> `forcePassphraseReentryHours` and the
  snapshot's `expiresAt` -> `askPassphraseAt` (the field names ship now even if the shut timer
  comes with 4); and a decision on `safebyok/idb` (*settled: it moves before the release, [#77](https://github.com/mrflip/safebyok/pull/77)*): if `idbVaultDB` is to move to its own package
  (*Side quests*), either it moves before the release or `safebyok/idb` keeps re-exporting it
  forever. `store()` and `openVault` already take bags, and error kinds are additive, so those
  need nothing.

### 4. Coherent documentation

So the Coach can tell other people about this. One thread, after 1, 2 and 3 land, since all
three change what the documents say:

* **Promote the README**: `whiteboard/20261013-relic/proposed-README.md` becomes
  `packages/safebyok/README.md` (the npm page), corrected to the surface as built: the storage
  verbs, the error table with `whisper_too_large`, `bad_option`, `stale_write` and the adapter
  kinds, zod as a peer, `safebyok/browser` for the defaults, the screen-lock recipe, the
  no-recovery warning. The root README is the front page: what it is, the package table
  (core, react, convex), where to start.
* **An adapter author's guide** (in the core README or beside it): the `VaultDB` verbs, which
  two vary by store family (listing boxes: a prefix scan, an index, a WHERE; change
  notification: reactive query, LISTEN/NOTIFY, polling), the shared adapter test suite and how
  to run it against a new backend, `maxRecordBytes`, what an adapter must never log.
* **`notes/security.md` refresh**: entries that are mid-rename or pre-release (the release
  trigger, `rememberForMs`), plus the ones the sprints owe (versionedUpdate atomicity per
  adapter, the Convex tables).
* **VOCABULARY.md** checked line by line against the exports.

### 5. Expiry and the unlock window (ruled; `lockSoon` built, natural expiry's timer not)

Not on the Coach's lists, but ruled in `whiteboard/20261014-crypto/rulings.md` (*The unlock
window*, *Expiry*) and placed here because fingerprint unlock (8) reworks the same unlock path
and should build on the settled model. The rulings call the two timestamps `staleVaultTS` and
`shutVaultTS`; the Coach has since asked that each be named for its consequence, an action on a
noun at a time: **`askPassphraseAt`** (fixed at unlock as now plus `forcePassphraseReentryHours`;
after it no new operation starts until the user is asked again, and a remembered device unlock
past it re-asks too) and **`shutVaultAt`** (`askPassphraseAt` plus a 60-second library-constant
grace, or `lockSoon(graceSeconds = 5.0)`'s now plus grace; when it passes the key is nulled, the
device-remember record erased, the snapshot flips). In-flight work is never clawed back.
The names ship with 3; this thread builds the timer, `lockSoon`, and the shut-forgets-both rule.
Public surface change; a `notes/security.md` entry.

Built (second_harvest thread 5): `vault.lockSoon(graceSeconds = 5)`, at most 60 seconds, with
the core README's screen-lock recipe. It closes the entry gate and erases the device record at
once, and leaves a timer only the vaultKey; inside an operation already started, `store()` and
`erase()` look for the key in hand, not at `askPassphraseAt`. Every lock (`lock`, `lockSoon`,
`destroy`) erases the device record. Left: **natural expiry's timer**, `shutVaultAt` =
`askPassphraseAt` + 60 s. `shutAfter()` in `vault.ts` is the mechanism, armed from
`takeUpUnlock` and `rememberedUnlock`; two things to settle first: `setTimeout` holds at most
2^31-1 ms (24.8 days), so a longer window re-arms (or arms only once within reach), and
`ensureUnlocked()` drops an expired key itself today, which the timer would take over. Not yet
public: `shutVaultAt` in the snapshot.

### 6. hash-wasm as a pluggable KDF -- built, [#74](https://github.com/mrflip/safebyok/pull/74)

Depends on low-hanging-fruit thread 2 (`keyDeriver` required, so noble tree-shakes out when
another deriver is passed). A package (`safebyok-argon2-wasm` or so) exporting one KeyDeriver
over hash-wasm's Argon2id, with hash-wasm as its dependency and safebyok as a peer; the core
keeps noble as the default in `safebyok/browser`, since it runs everywhere with no setup.
Caveats:
- It carries the same label, `argon2id_web_v1`, and hardcodes the same parameters from
  `Argon2idWebV1`; the label is the whole contract and the parameters are never host-configurable,
  or vaults written on one device stop opening on another.
- A test derives one fixed passphrase and salt through both implementations and compares bytes.
  That test is what makes "same spec" a fact.
- Hermes has no WebAssembly, so this package does not serve React Native; that needs a native
  Argon2 binding behind the same label.

### 7. zod/mini and a tree-shaking audit -- built

Depends on low-hanging-fruit thread 8 (the size budget, [#42](https://github.com/mrflip/safebyok/pull/42), merged: it is the before-and-after). Measured
before: zod classic is about three quarters of every bundle (183 KB raw), and it does not
tree-shake because the schemas are built at module top level in a shared chunk; even a bare
`stableJsonify` import drags all schemas. The thread: move the core's schemas to `zod/mini`
(same runtime core, interoperable with classic; chained authoring becomes `Z.string().check(...)`
and error strings become per-check params), then audit: `sideEffects: false` is true, nothing
runs at module top level, each entry pulls only what it uses, and the budget limits drop to match.
Report what zod/mini cost in authoring clarity; if it is more than the bytes are worth, say so.

Built (second_harvest thread 1, `whiteboard/20261015-second_harvest/thread-1-zod_mini.md`):
every entry fell by about 14 kB brotlied, and a bare `stableJsonify` from 25 kB to 2.3 kB, no zod
in it. A host's label policy (*Pluggable label validator*, below) should be typed as
`Z.core.$ZodType`, so a classic or a mini schema both fit.

### 8. Fingerprint unlock (passkeys, hardware keys) -- built, [#76](https://github.com/mrflip/safebyok/pull/76)

The WebAuthn PRF extension yields 32 bytes per credential; `importWrappingKeyBytes` turns them
into a wrapping key. With the envelope list reserved in 3, this is additive: a second envelope
with method `passkey`, its `credential_id`, and its own binding purpose, plus a
`notes/security.md` entry on what a credential-held key does and does not protect against. The
WebAuthn call lives in the host or the React binding, never in the core: the core takes bytes.
Depends on 3 and 5 (the unlock path) and on 4 (the README has to explain it).

## Side quests

Straightforward, likely to be done, not needed yet. Each is a thread cut from `main`.

* *Built, [#77](https://github.com/mrflip/safebyok/pull/77):* **The IndexedDB vault store as its own package**, `safebyok-indexeddb`: the documented
  example of a KV-store backend, "duplicate this and type here, here and here", with its own
  tests, tsdown config and changeset, so it is the template for packaging as much as for the
  adapter. `idbDeviceDB` stays in the core (`safebyok/idb`): the device store is a fact about the
  device, not a backend choice. Duplicating the bell and BroadcastChannel plumbing (about forty
  lines) is fine: a template wants to be self-contained. After the core move and storage_verbs.
* *Built, [#73](https://github.com/mrflip/safebyok/pull/73):* **Postgres vault store**, `safebyok-postgres`: the example of a SQL backend; `versionedUpdate`
  is an `UPDATE ... WHERE revision_id = $1`, listing is a `WHERE`, subscribe is `LISTEN/NOTIFY`
  or polling. It earns Supabase nearly for free (Postgres plus row-level security as the
  `getUserId` equivalent, PostgREST as the wire, and Supabase realtime for subscribe), as a
  second thin package or a section of this one. The discipline question is only where the
  functions run: Convex hosts them (the component's queries and mutations are the whole backend,
  deployed with the app); a bare Postgres has nowhere to run them, so the host owns a route
  layer and the package is the SQL plus the route recipe. Supabase gives Postgres that function
  layer back, which is why it is nearly free.
* **A REST vault store** over `fetch`, and a Next.js demo on it with Postgres behind the route
  handlers. The vault runs client-only; the server holds ciphertext. Same route recipe as above.
* **A blob helper**: for secrets too large to be a whisper, a lockbox holds the key and
  safebyok's own context-bound encryption seals the blob into a separate pluggable blob store
  (its own small interface beside VaultDB: put, get, delete by id), so no host hand-rolls
  encryption with a key taken out of a vault. An S3 or Vercel Blob store is the first adapter.
  Easy once the storage verbs are settled; it was *Not yet* and moved here because the core of
  it is forty lines over primitives that exist.
* **`safebyok-vue`**: a `shallowRef` plus `onScopeDispose` binding, about ten lines, so Nuxt
  apps have what React apps have. After the react package is published (its shape is the model).
* **`lockWhenHidden`** opt-in prop on `safebyok-react` (ruled, not yet): the binding may touch
  the DOM; calls `lockSoon()` on `visibilitychange`. `lockSoon()` exists now, and the core
  README's *A screen-lock recipe* is the handful of lines the prop would wrap; the prop removes
  its listener when the provider closes the vault.
* *Built, [#77](https://github.com/mrflip/safebyok/pull/77):* **IndexedDB `versionedUpdate` truly atomic**, inside one IndexedDB transaction (idb-keyval's
  `update()`, throw-to-abort mapped to `stale_write`), closing the window `notes/security.md`
  records. After storage_verbs.
* **Dependabot runtime-dependency PRs get their changeset without the Coach.** Today
  ([#72](https://github.com/mrflip/safebyok/pull/72)'s gate) a Dependabot PR that changes a
  published package's runtime dependencies fails CI until someone pushes a changeset to it. A
  workflow on Dependabot PRs could write `.changeset/dependabot-<n>.md` (a patch bump naming the
  dependency and versions) and push it, so the PR goes green on its own and the release notes say
  what moved. Decide: does the bot's push need a token that re-triggers CI, and is patch always
  the right level for a runtime dependency bump before 1.0?
* *Built, [#78](https://github.com/mrflip/safebyok/pull/78):* **A GraphQL vault store** (urql): listed because the Coach asked; it is not actually easy.
  Subscribe and `versionedUpdate` depend on a schema we do not own, so it needs resolvers on
  the host's GraphQL server as well as a client, and no host's existing schema has our tables.
  Do the REST one first; GraphQL is the same recipe with more ceremony.

## Soonish

Wanted; each has a design question to settle first, named here.

### Pluggable stringifier, and padding

How a whisper becomes bytes and back (today `stableJsonify` and `JSON.parse`), pluggable so a
host can store values JSON cannot carry, offering `JSON.stringify`, stable stringify, an identity
stringifier (bytes in, bytes out, the S3 case), and padded versions of each. Settled: padding is
trailing whitespace on the serialized JSON, inside the encryption, by a published scheme (PADME
from the PURBs paper, or power-of-two buckets), 64-byte minimum; every existing reader already
ignores trailing whitespace, so it needs no stored-format change and no codec label. Still open:
does `maxWhisperBytes` measure the padded or the unpadded size (the recommendation: unpadded, so
the top bucket ends at the cap and padding never pushes a passing whisper over it)? Survey where
standard payloads land so no common kind sits alone in a size that names it: API keys, OAuth
tokens, service-account JSON, RSA keys (PKCS#8 PEM is 1704, 3272 and 6392 bytes at 2048, 4096
and 8192 bits); the cap and half of each adapter's `maxRecordBytes` are bucket watermarks.
**A non-JSON stringifier (identity) does need a stored stringifier label**, since a reader must
know not to `JSON.parse`: that is `whisper_codec`, reserved in roadmap 3, so this thread adds
no field. The security note on ciphertext length stays until this lands.

### Pluggable label validator

A host chooses its own label grammar. Waits on the low-hanging-fruit report of what depends on
the current strictness (storage ckeys, the cipher binding, the Convex tables, the React package);
the seam is likely an `openVault` option with the current `parseLabel` as the default. The report
([#35](https://github.com/mrflip/safebyok/pull/35)) found the colon is the one character the
storage ckeys cannot take: they join applabel, user id, vaultlabel and boxlabel with `:` as plain
concatenations, so a label holding a colon collides with another scope or hides a box. **The
Coach's ruling: a pluggable label validator must also provide a label-tuple stringifier that
handles the `:` issue** -- the validator and the stringifier come as one pair, so a host that
widens the grammar also says how the tuple becomes a ckey. The current `:`-join stays the default
pair's stringifier, so every stored ckey keeps its shape.

### Validating the user id

`VaultScope.user_id` comes from the host's auth and is free-form today: any non-empty string, no
grammar, deliberately not a Label. **The Coach's ruling: it gets some manner of validation, and
the validation is replaceable** -- a default check (a length cap, no control characters, and
whatever the ckey stringifier above needs) that a host can swap for its own auth provider's id
shape. Same seam family as the label validator; decide them together.

### A lockbox row that breaks the listing locks the vault out

Found by [#87](https://github.com/mrflip/safebyok/pull/87)'s review: a stored lockbox row that
fails the listing's check (not JSON, a malformed note or timestamp) makes `listBoxes`, so every
`refresh()` and every `openVault`, throw `corrupt_record`. With no handle, neither `erase()` nor
`destroy()` can reach it; the only way back is clearing storage by hand. Decide: should the
listing skip a bad row, or list it marked as damaged so `erase()` can remove it (and the snapshot
can show it)? Either way, `erase()` should not report `corrupt_record` after its own delete has
landed because a different box broke the refresh that follows.

### A conflict-handler hook

Ruled "with the retry work": a way for a host to hear about an erase-versus-update collision
after the retry limit, rather than only a `stale_write`. API design: is it an `openVault` option,
a snapshot field, or an error the provider surfaces? Decide after the retry (low-hanging-fruit
thread 7, [#44](https://github.com/mrflip/safebyok/pull/44)) has been used in anger.

### Others

* **i18n string helpers.** Every string a user reads (the React dialog's copy, the refusal
  messages a host may show) is English and fixed. A helper set would let a host supply its own
  strings and a locale, with ours as the default; the dialog's `Intl.RelativeTimeFormat` call
  takes the same locale. Decide: one messages bag on `VaultProvider`, or per-component props?
* **Identify minimum platform support.** "Runs everywhere" (PROCESS.md, *Dependencies*) names
  React Native, React, Next.js, Nuxt, Node and Bun, but no versions. Pin each: the oldest
  browsers (WebCrypto, IndexedDB, BroadcastChannel, `Intl.RelativeTimeFormat`), the oldest Node
  CI must test (22 today), Bun, and React Native's engine (Hermes' `Intl` coverage is partial).
  Then CI checks what we promise, and the README states it.

* **Provide built-as-a-whole recommended KDFs, and functions to roll your own.** Follows from
  [#68](https://github.com/mrflip/safebyok/pull/68)'s `argon2idDeriver(spec)`; replaces its open
  question of adding RFC 9106's second recommended option as a supplied spec.
* **CI questions left by [#72](https://github.com/mrflip/safebyok/pull/72)**, each its own
  conversation:
  - the Dependabot changeset gate recognizes a Dependabot PR by its author;
  - the release workflow skips by the `changeset-release/` branch name (predates #72);
  - the runtime-dependency comparison skips removed or made-private packages,
    `peerDependenciesMeta` and `bundledDependencies`;
  - `justify:root` is defined and never used;
  - in `justify`, a build failure skips every package's tests, not only its own;
  - `safebyok-convex`'s `./test` entry imports a devDependency.
* Style guide audit
  - A few comment lines exceed 100 columns.

## NOT YET

Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your
implementation.

* **A pluggable conflict handler for the weird cases**, beyond *A conflict-handler hook* above:
  for instance, "this lockbox is too damaged to know what epoch it is from, and I have a store
  request with a healthy lockbox: what do I do?" Today the vault decides (a damaged box is
  removable, and `store()` overwrites it); a host may one day want the say.
* **Recovery keys.** The same mechanism as fingerprint unlock (a second, high-entropy envelope in
  the envelope list), which roadmap 3 reserves a slot for. What makes it not-yet is not
  the crypto but the UX and microcontent the host must own: a screen that shows the code once,
  a warning the user reads, a flow for using it. The library's job is the envelope; the rest is
  the app's.
* **Refactor for React Native compatibility**: a WebCrypto shim (react-native-quick-crypto or
  similar) for `crypto.subtle` AES-GCM wrap/unwrap, `getRandomValues` and `randomUUID`; a
  DeviceDB over the secure store or keychain, holding the localUnlockKey as bytes and importing
  it non-extractable on load (a different security posture, for notes/security.md); a native
  Argon2 binding behind the `argon2id_web_v1` label (Hermes has no WebAssembly, so hash-wasm is
  not the answer); and a check that no core path needs IndexedDB, BroadcastChannel or
  TextDecoder where Hermes lacks them.
* **A sub-millisecond extension beside each timestamp**: a monotonic or random "nanosecond"
  field as a tiebreaker for ordering writes within one millisecond. No reservation needed: a
  tiebreaker an attacker strips gains nothing, so it may be bound only where present (and with
  whole-header binding, roadmap 3, it is bound automatically the day it appears).
* **`maskCarefully`.** A variant of `mask` for whispers in scripts that write vowels and syllable
  parts as combining marks (Devanagari, Thai, Tamil, Bengali, Khmer), which `mask` strips whole
  ([#37](https://github.com/mrflip/safebyok/pull/37)). It would keep marks, but at most one or
  two per base character, which keeps the vowels while still blocking stacked "Zalgo" marks. Its
  final scan would also have to drop a mark left orphaned at a cut edge. API keys are ASCII, so
  nothing asks for it yet.
* **A PBKDF2 key deriver.** Native in WebCrypto and fast, but not memory-hard; shipping it is not
  a favor. A host that needs it can write one against the `KeyDeriver` seam. If it is ever
  packaged, it is its own package with the iteration count in the label.

* **A finer unlock race analyser.** A `lock()` that lands while an `unlock()` is still under way
  wins, whatever the circumstances. A more sophisticated unlock race analyser might tell "goons
  are here, lock the vault" from "typed my passphrase at 6d23h59m": a lock the user meant from
  one that merely fell due (the seven-day deadline, say) while the user was typing the
  passphrase that would have renewed it.

## RAGEBAIT

* If the eslint configs cut from the core's (`packages/safebyok/eslint.config.mjs`) drift enough to
  cause an uncaught bug, write a generator script to keep them in sync.
* If our retry and backoff in `store()` (`retryStale`, `retryDelayMs` in `vault.ts`) ever grows --
  more callers, cancellation, a policy hook -- take `p-retry` (or `exponential-backoff`) rather
  than growing the hand-written one. For now three lines of `setTimeout` stay ([#45](https://github.com/mrflip/safebyok/pull/45)).
