# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | filed #97                  |
| 2 | release_age       | filed #96                  |
| 3 | passkey_button_ux | resumed: review's fixes    |
| 4 | small_sweep       | filed #99                  |
| 5 | vaultdb_battery   | waiting on the gripes line |
| 6 | race_helper       | waiting on thread 5        |
| 7 | indexeddb_fixes   | waiting on the gripes line |

## What the threads have taught

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
