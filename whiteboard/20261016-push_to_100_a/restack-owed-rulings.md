# Rulings owed beside their questions, at the restack

For the orchestrator, at the restack (sprint skill §5.1): each line below goes directly under its
question, as a sub-bullet when the question is a bullet, in one `plan:` commit on that branch.
The PR descriptions already carry them (#126, #127, #128, #129, #130, edited 2026-10-16). The
full question and reply for each are in `20261016-push_to_100_a-resolutions.md`.

* **20261016-crypto_small**, `whiteboard/20261016-push_to_100_a/thread-6-crypto_small.md`
  * under `**G072**: please confirm the passkey-plus-several-passphrases rule`:
    `→ *Coach (2026-10-16):* Keep as built; too complex for users, so a TODO asks if several passphrases help anyone.`
  * `**G031**` (the KeyDeriver union): nothing yet; the Coach asked for an explanation only.
* **20261016-locks_and_expiry**, `thread-3-locks_and_expiry.md`
  * under `Is lockSoon() soft ... or as built` (about line 94):
    `→ *Coach (2026-10-16):* lockSoon() is a soft lock; thread 4 (#132) builds it so.`
* **20261016-names_and_keys**, `thread-1-names_and_keys.md`
  * under `Opened: G497 (Standard Schema) would now land only in Names.rulesOf` (about line 120):
    `→ *Coach (2026-10-16):* NOTYET: stays unbuilt, nothing in this sprint needs it.`
* **20261016-react_tidy**, `thread-7-react_tidy.md`
  * under `**Opened**: "do we offer a hint?"` (about line 44):
    `→ *Coach (2026-10-16):* Yes: host placeholder, no default hint; NOTYET: option for a user's passphrase hint.`
  * after the "Still open with the Coach ... an uncontrolled `WhisperField`" sentence (about lines 48-49):
    `→ *Coach (2026-10-16):* Proceed (thread 14): uncontrolled, eyeball kept, host-fed passphrase message beside it.`
    (Thread 14's worker may already add this on its branch, which carries thread 7's file.)
  * under `autocomplete="new-password" (your list) stops autofill...` (about line 94):
    `→ *Coach (2026-10-16):* Whisper field turns away autofill and generators; passphrase field welcomes password managers (thread 14).`
  * under `The provider no longer reopens on bad_option per the ruling...` (about line 96):
    `→ *Coach (2026-10-16):* Took it as it stands; no change, thread 7 stands as filed.`
  * under `Not done: a real screen reader, real shadow-DOM hosting, a real browser (G356 stays).` (about line 101):
    `→ *Coach (2026-10-16):* Add to NOTYET (done): React binding under real assistive technology and real hosts.`
* **20261016-ci_release**, `human/20261016-ci_release.md`, each a sub-bullet under its top-level bullet
  * `**Add node-compat (22) to the main ruleset's required checks.**`:
    `→ *Coach (2026-10-16):* Added to TODO.md (Sand in the sandals); the ruleset is the Coach's to change.`
  * `**Watch the first Dependabot runtime-dependency PR after merge.**` and `**The release workflow's retry**`:
    `→ *Coach (2026-10-16):* Noted; the Coach will watch the first failed release and first Dependabot PR.`
  * `**CLAUDE.md's *Commands* is a line stale**`:
    `→ *Coach (2026-10-16):* Fixed in the Coach's own branch; nothing for the sprint.`
* **20261016-pg_container**: none owed; thread 11's worker put its lines in before filing.
