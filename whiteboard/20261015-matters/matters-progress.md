# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | filed #97                  |
| 2 | release_age       | filed #96                  |
| 3 | passkey_button_ux | filed #98                  |
| 4 | small_sweep       | filed #99                  |
| 5 | vaultdb_battery   | waits on 11                |
| 6 | race_helper       | waiting on thread 5        |
| 7 | indexeddb_fixes   | review fixed; files after 9 |
| 8 | size_rule         | filed #99 (commits on it)  |
| 9 | damaged_bundle    | review fixed; files after 11 |
| 10 | identity_revoked | filed #106 (on #105)        |
| 11 | vaultdb_contract | review fixed; filing onto #106 |
| 12 | postgres_soft_cap | waiting on 11             |
| 13 | rotation_design  | filed #105 (on #97)        |
| 14 | rotation_shape   | waits on 11, #97 landing   |
| 18 | rotation_adapters | waits on 14               |
| 19 | rotation_verb    | waits on 18 and the Coach (ways in kept) |
| 20 | rotation_docs    | waits on 19                |
| 15 | e2e_home         | in review (#111)           |
| 16 | late_unlock      | in review (#110)           |
| 17 | validation_note  | waits on #101 merging      |
| 21 | damaged_erase    | waits on #108 filing       |
| -- | restack #96-#99  | done: main → #96 → #99 → #98 → #97 |

## What the threads have taught

*Orchestrator (~02:10Z):* the Coach merged #99 (taking #96 with it); #98, #97, #105 and #106 sit
above it, so they stay open until the Coach merges the line's top. **Filing is serialized**: each
filer rebases onto the top the one before it left, so the line stays one line. Order: 11, 9, then
7, 16, 15 as their reviews return. *Review* of 11: fixed one (4.2 now compares the whole vault
after a `vault_full`); the Postgres verdict holds as reasoning (at REPEATABLE READ racers don't
`40001`; only SERIALIZABLE). 4.4 retitled "Under the limit, a new lockbox lands". 11 writes #106's
five lines in, being second. *Review* of 9: fixed two (a mixed-deriver message no longer says every
passphrase is damaged; `askPasskey` skips a passkey whose salt isn't 32 bytes); no bypass or
downgrade found. *Review* of 7: fixed one (`settle` kept a failed request's real error, which
bubbles to the transaction while `transaction.error` is still null); the key range holds exactly
the vault's lockboxes (JSON strings self-delimit). Noted: a worker used `git stash`, which every
worktree shares -- now a ground rule against it.

* **Thread 7 (#109), indexeddb_fixes.** `listBoxes`/`eraseVault` read `boxRange(scope)` (an
  `IDBKeyRange` over the tuple-JSON lockbox prefix) instead of the whole shelf; every request goes
  through `settle()`, so a null `request.error` becomes an Error and no `cause` is ever null; the
  bell closes its channel when the last listener leaves. Stored keys unchanged -- the Coach's
  "anything deeper?": no. *For threads 5 and 6:* vitest's `rejects.toThrow(/re/)` passes on a
  `null` rejection; a null-cause test needs an explicit `instanceOf(Error)`.

* **Thread 11 (#107), vaultdb_contract.** The contract is `packages/safebyok/VAULTDB.md`, 26
  numbered lines; `describeVaultDB` runs a group per line, titled `..., 3.3: <line>`, and
  `TH.VaultDBContract` is held to the doc by a drift test. Owners: the adapter does the atomic
  compare-and-write, the base class turns `false` into `stale_write`, the vault reads before and
  retries after. Limit lines (4.2-4.5) run given `{ makeCappedVaultDB }` (Postgres, GraphQL,
  `MapVaultDB`; **Convex not yet -- thread 5**). Lines 5.5+ are reserved for #106's five
  `identity_revoked` lines: whichever lands second writes them in. Race lines check outcomes only;
  **thread 6 proves the race**. Departs from the Coach: a write returns no count (a matter row).
  **For thread 12** (`thread-11-postgres_verdict.md`): the one-statement insert meets the contract
  at READ COMMITTED if it reports why it missed in the same statement (CTEs over one snapshot),
  maps FK `23503` to `stale_write`, and the README names the isolation level (`40001` above it);
  racing writers may overshoot by N-1. Rotation (thread 14) will need a statement-scoped
  `FOR SHARE` on the bundle row. *Orchestrator:* the NOTIFY trigger becomes opt-in in thread 12,
  by the Coach's own baseline (nothing beyond tables and indexes unless the host opts in).

* **Thread 13 (#105), rotation_design.** Design in `whiteboard/20261016-rotation/rotation-design.md`.
  "Re-wrap the remaining envelopes" is impossible (an envelope's key is a passphrase or a passkey
  touch the vault never keeps), so rotation keeps only the ways in proven during it and removes the
  rest; a key pair per way in (HPKE) would be new cryptography -- **the Coach's call, an Open
  Matters row, gating thread 19**. One atomic bundle write commits the new vaultKey (with the old
  one wrapped under it), then a resumable walk re-encrypts lockboxes by conditional writes; needs
  one new contract line, `LockboxExpectation.vault_key_epoch`, compared atomically by every adapter
  (thread 11 should carry it). Today a restored older bundle brings a removed way in back: the
  design adds a device mark and a `rolled_back` refusal. NOTYET data: a per-vault random
  `device_id` on each envelope. The build: 14 rotation_shape (opus), 18 rotation_adapters
  (sonnet), 19 rotation_verb (opus), 20 rotation_docs (sonnet). The `openVault` leak was never in
  TODO; first-emit struck. *Review:* none, documents only.
* **Thread 10 (#106), identity_revoked.** `identity_revoked` (the opened-for user is gone) beside
  a narrower `not_permitted`; `src/refusal-policy.ts` decides (lock by default; nothing stored is
  erased); `openVault({ whenIdentityRevoked: 'lock' | 'stay' })`; Convex and Postgres refuse a
  signed-out or other user as `identity_revoked`; Convex's failed watch now calls `onChange`. Its
  thread file holds five lines the VaultDB contract should carry (threads 11 and 5). Size: 245 B
  over main's budget, inside the line's (#99). *Review:* fixed two -- `rememberedUnlock` now
  yields to a shut since it began (a refresh meeting `identity_revoked` mid-open left the open
  `unlocked` holding the dropped key), and `heed`'s pass-through is tested for all eight verbs.
  Left, minor: a read past `ensureUnlocked()` still returns its whisper if a lock lands mid-read
  (always so; to the Coach); a never-settling device erase hangs the refused call; a closed
  handle's late refusal erases the remembered unlock; every ConvexClient watch error refreshes.
* **Thread 9 (#108), damaged_bundle.** `damaged_bundle`, `damaged_unlock`, `damaged_lockbox`: the
  vault translates storage's `corrupt_record` (kept as `cause`), so no adapter or contract
  changes. A damaged way in is passed over, not a lock-out. A tampered bundle still reads as
  `wrong_passphrase` (AES-GCM can't tell), with "the stored vault may be damaged" in the message;
  the plan's "remembered unlock" example was refused as a home-made construction. Argon2 sentence
  in security.md. Open: a damaged bundle can't be destroyed (no handle opens); VOCABULARY's
  *damaged* row could widen; #106 meets it in `errors.ts` at restack.

* **The restack (#96 to #99 onto `b60e516`).** One line, bottom to top: #96 `34171fd`, #99
  `88b7b05`, #98 `4eb2d74`, #97 `8d665aa` (#97 on top: it rewrote `vault.ts` logic main also
  rewrote). Justify green at the top (core 1144 tests). Repairs: tests moved to main's tuple ckeys
  (`isU1Box`, `u1BundleCkey`); #98's dialog kept around main's version, which dropped the
  `reentryHours` prop for `vault.reentryWindowMs`, so #98's three bad-`reentryHours` tests went with
  the prop. `.size-limit.json`: main's two new entries (validators 8.5 kB, DefaultValidators 4 kB)
  predate the rule; validators measures 8.15 kB, so a thread that grows it widens it by the rule
  (about 12 kB). **New threads stack on the line's top: now #106** (main → #96 → #99 → #98 → #97 →
  #105 → #106). Local tags `<branch>-prerestack3` hold the old tips.

*Orchestrator (2026-10-16 ~01:35Z):* the previous orchestrator session ended mid-sprint; threads
9, 10, 11 and 13 stopped with nothing committed (9 and 10 left work in progress in their
worktrees). The gripes line merged meanwhile (main `b60e516`). 10, 11 and 13 resumed on it; 9
resumes once #97 is restacked.

* **Thread 8 (#99), size_rule.** Budgets by the written rule, now in PROCESS.md's *Size budgets*:
  measured + 3 kB at 5 kB and over, + 50% (at least 1 kB) under, rounded **up** to two significant
  figures (everything 30, openVault 23, stableJsonify 3.5, mask 8.8 kB). The sprint skill says the
  orchestrator guesses a sprint's target up front and a late thread lowers the budgets. *Review:*
  none, budgets and docs only. Left: three small budgets fell (stableJsonify 6 to 3.5 kB); a later
  thread that outgrows one widens it by the rule. The 5 kB line is a cliff (argon2idWebV1Deriver).
* **Thread 3 (#98), filed.** The Coach's rulings (swap kept; hand-written boundary kept) are in its
  body and thread file. Second review clean over the review round. *Review:* left, minor: a late
  unlock leaves a newer dialog asking over an unlocked vault (a design call, for the Coach); narrow
  races (a lock between unlock and retries; `vault_locked` while `vault` is null); `role="alert"`
  mounted with its text (with #90's markup); Escape not stopping propagation; shadow-root focus.

*Orchestrator (part 2, 2026-10-16):* a new orchestrator session took over in YOLO; see the plan's
*Part 2*. Thread 3's worker finished its review round (`60bc87e8`, pushed to #98) before the old
session ended; it never filed, so a second reviewer and a fresh worker finish it. The
`convex-test@0.0.61` exclusion (thread 2) ages at 2026-10-16T23:01Z: the first thread to file after
that removes it.

* **Thread 2 (#96), release_age.** Seven days, strict; the lockfile re-resolved, ten floors lowered
  to aged releases, the big_feats hand pins retired. One exclusion, `convex-test@0.0.61`, ages at
  **2026-10-16T23:01Z**: whoever touches the line after that removes it (the PR says how). Every
  later thread: a dependency floor must name a release at least seven days old, or the frozen
  install fails. *Review:* fixed one (the exclusion's expiry was a date, not a time); left as minor
  the caret-on-0.0.x cosmetic, Dependabot security updates bypassing the cooldown (by design,
  PROCESS.md), the days-vs-minutes skew, and dist byte-identity after tsdown 0.23.1 -> 0.23.0
  (unchecked).
* **Thread 4 (#99), small_sweep.** Budgets now measured + 3 kB (openVault 23, everything 30):
  wave 2 inherits the room. Most of TODO's sand was already fixed on main. *Review:* clean; left
  the empty changeset for a README-only change as the Coach's call, and noted that +3 kB loosens
  the small budgets (stableJsonify 2.3 of 6 kB).
* **Thread 3 (#98).** The plan's gloss was wrong: on main the passkey button already threw misuse
  to the host's boundary, like the dialog. Its hand-written 10-line boundary class is a matter for
  the Coach (library-first), as is the dialog swapping its form for a notice.
* **Thread 1 (#97).** Bound every written field it could find: the passkey's HKDF info is its
  wrap's whole binding; envelopes bind `registered_at`; lockboxes their whole public header; a
  remembered unlock its deadline. Pulled roadmap 3's "every field in the binding" forward for
  lockboxes (thread 4 noted it in TODO). *Review:* fixed two overclaims in docs (security.md
  missed `method`; "every field" wasn't, since `unlock_epoch` and the unlock list stay unbound);
  confirmed the encoding is injective, info = AAD is sound, and nothing that changes without
  re-encryption is bound. Left: a tampered bundle reads as `wrong_passphrase` (now a matter); an
  `undefined` binding part drops silently; the lockbox format is bound twice. The Argon2
  derivation stays unbound (a matter).
* **Thread 3 (#98), flagged.** A bug on main, not the thread's: `withUnlockedVault` hangs on an
  unmount or an overlapping ask, and on a user switch the dialog returns over the next user's
  vault holding the old user's settle. Resumed (normal mode, but the Coach's "productionized"
  answer covers it) with the fix and the passkey button's focus and live region.

*Orchestrator:* for `/turbochat`, learned while running it: a new table row goes in as blocks
(`insert`, `"as":"blocks"`, a `row` of `cell`s, at `side: "end"` of the table), with placeholder
text in each cell; then each placeholder paragraph is replaced with markdown that carries its chip.
A markdown row inserted after a row is refused (`shape_mismatch`). The doc mirror of this sprint is
a status tab linking to these files, not a full copy: the doc takes only inline text, and
re-sending the plan whole costs more than the Coach's token budget wants. After inserting rows,
their cells' ids follow the row id in order (row r: cells r+1, r+3, r+6; their paragraphs one
after each), so the fill needs no read.

*Orchestrator:* **housekeeping, for the Coach.** The Coach approved a first pass, but this
session's permission check refused the deletion, so a read-only survey (2026-10-16 00:46Z) found
what is certainly safe. Run from the Mac's or container's shell:

```sh
git -C /workspace/byok worktree remove /workspace/byok-convex
git -C /workspace/byok worktree remove /workspace/byok-staged-publish
git -C /workspace/byok worktree remove /workspace/byok-whisper-cap
rm -rf /workspace/byok-comment_width /workspace/byok-convex_component /workspace/byok-unlock_envelopes /workspace/byok-react_publishable
git -C /workspace/byok worktree prune
```

Not certain, so kept: `byok-strict_configs` (on `20261015-testing_entry`, PR #38 closed; four
local commits not on origin, two differing in patch-id from their rebased copies);
`byok-passkey_unlock` (work reachable only from local `*-prerestack2` tags); `byok-rebase` (matches
no branch); `byok-test_helpers` and `byok-storage_verbs` (older committed versions only, probably
safe); `byok-kdf_configs`, `byok-gripe_rulings`, `byok-replaceable_validators`, `byok-hkdf_info`,
`byok-vault_amendments` (touched within six hours, or the gripes session's). Never
`byok-restack`, `byok-docs_housekeeping` (yours, from the Mac) or `triquet`.
