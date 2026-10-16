# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | filed #97                  |
| 2 | release_age       | filed #96                  |
| 3 | passkey_button_ux | filing (second review clean) |
| 4 | small_sweep       | filed #99                  |
| 5 | vaultdb_battery   | waiting on the gripes line |
| 6 | race_helper       | waiting on thread 5        |
| 7 | indexeddb_fixes   | waiting on the gripes line |
| 8 | size_rule         | filed #99 (commits on it)  |
| 9 | damaged_bundle    | underway (stacked on #97)  |
| 10 | identity_revoked | underway                   |
| 11 | vaultdb_contract | underway                   |
| 12 | postgres_soft_cap | waiting on 11             |
| 13 | rotation_design  | pending                    |
| 14 | rotation_build   | waiting on 13 and the gripes line |

## What the threads have taught

* **Thread 8 (#99), size_rule.** Budgets by the written rule, now in PROCESS.md's *Size budgets*:
  measured + 3 kB at 5 kB and over, + 50% (at least 1 kB) under, rounded **up** to two significant
  figures (everything 30, openVault 23, stableJsonify 3.5, mask 8.8 kB). The sprint skill says the
  orchestrator guesses a sprint's target up front and a late thread lowers the budgets. *Review:*
  none, budgets and docs only. Left: three small budgets fell (stableJsonify 6 to 3.5 kB); a later
  thread that outgrows one widens it by the rule. The 5 kB line is a cliff (argon2idWebV1Deriver).
* **Thread 3 (#98), second review.** Clean over the review round. *Review:* left, minor: a late
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
