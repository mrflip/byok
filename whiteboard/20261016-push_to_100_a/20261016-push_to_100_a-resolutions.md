# Sprint push_to_100_a: resolutions

Every open matter the Coach has resolved in this sprint, with the question in full as it was put
and the Coach's reply in full, word for word. The orchestrator keeps this file; the newest batch
comes first. A brief restatement of each ruling also sits beside the question wherever it was
raised (the PR body, the thread file, the `human/` entry), and the plan's *Coach rulings during the
sprint* holds the one-line version. "(empty: took the Rec)" means the Coach flipped the row to
`proceed` without writing, which accepts the recommendation.

## Second batch, 2026-10-16 (doc rev 3282)

### Uncontrolled whisper and passphrase fields (thread 14)

* **Raised by**: the orchestrator, from thread 7's review ([#129](https://github.com/mrflip/safebyok/pull/129)).
* **Question**: **WhisperField writes the secret into the page.** React 19 copies a controlled
  input's value into its `value` attribute, so the whisper (and the passphrase) sit in the DOM
  where an extension or a DOM dump can read them. Rec: proceed with thread 14, making both fields
  uncontrolled.
* **Coach's reply**: "does this still let me have an eyeball to see the password? Pleasant
  validations next to it? ("passphrase must contain a capital letter"?)" -- `proceed`.
* **Where it went**: thread 14, with the eyeball kept, and a message beside the passphrase field fed by a
  host callback (thread 10's `passphraseStrengthTest()` at the restack); no composition rules of
  our own; the capital-letter question returns as a matter.

### Should a second unsubscribe warn? (thread 5b)

* **Raised by**: the orchestrator, from the store base design (thread 5a).
* **Question**: **Should a second unsubscribe warn?** Calling an unsubscribe twice is harmless.
  Rec: no warning; React's `useSyncExternalStore` calls it once per subscribe, StrictMode
  included, and `removeEventListener`, Redux and RxJS are all silent no-ops.
* **Coach's reply**: "agree, no warning, thanks for the explanation" -- `proceed`.
* **Where it went**: thread 5b builds it silent, as designed.

### `autocomplete="new-password"` on the whisper field (thread 7, thread 14)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: `autocomplete="new-password"` (your list) stops autofill of saved passwords, but
  Chrome may offer its password generator on such a field. Keep it, or drop that one attribute?
* **Coach's reply**: "we need to offer two different things: 1) a field for entering a secret to
  store; this is best NOT offered to a password generator to complete or for a generator to
  manufacture; 2) a field for entering a passphrase tied to this URL -- that should be in every
  way the bestest most bestpractices compliant and password manager friendly field there is" --
  `proceed`.
* **Where it went**: thread 14: the whisper field turns autofill and generators away; the passphrase field
  invites password managers (a real form, `new-password` / `current-password`, a username).

### The provider and a `bad_option` refusal (thread 7)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: The provider no longer reopens on `bad_option` per the ruling, though from the
  provider a "reads sound now" refusal is a race, not misuse; `retryOpen()` mends it.
* **Coach's reply**: (empty: took it as it stands) -- `proceed`.
* **Where it went**: no change; thread 7 stands as filed.

### Not done: real screen reader, shadow DOM, real browser (thread 7)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: Not done: a real screen reader, real shadow-DOM hosting, a real browser (G356
  stays).
* **Coach's reply**: "add NOTYET --" -- `proceed`.
* **Where it went**: `NOTYET.md`, "The React binding under real assistive technology and real hosts".

### `postgres` as a required check (thread 11)

* **Raised by**: thread 11 ([#131](https://github.com/mrflip/safebyok/pull/131)), its open questions.
* **Question**: Is `postgres` to become a required check, once it has run a while?
* **Coach's reply**: "add TODO --" -- `proceed`.
* **Where it went**: `TODO.md`, *Sand in the sandals*: "`postgres` a required check, once it has run a
  while". The ruleset is the Coach's to change.

### `node-compat (22)` as a required check (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its hands-only items.
* **Question**: Add `node-compat (22)` to the main ruleset's required checks. CI's node-compat job
  now gates on Node 22 (the platform floor) and only reports on the newest Node
  (`continue-on-error` for the rest of the matrix). A workflow cannot make a check required; the
  ruleset is yours.
* **Coach's reply**: "add TODO --" -- `proceed`.
* **Where it went**: `TODO.md`, *Sand in the sandals*: "`node-compat (22)` a required check".

### Answers to the Coach's side questions (thread 11)

* **Raised by**: thread 11 ([#131](https://github.com/mrflip/safebyok/pull/131)).
* **Question**: Answers to the Coach's side questions: the other backends go on the same compose
  file, one service each; Playwright gets its own job, written in `e2e/README.md`.
* **Coach's reply**: "thanks, noted —" -- `proceed`.
* **Where it went**: no change.

### Two release paths unproven until they run (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its open questions.
* **Question**: The release workflow's retry (`publish` re-reports a tag whose GitHub release is
  missing) reads the release with `gh` using the token the changesets action gives the script.
  Unproven until a release fails between tag and release; the logic is tested with a fake `gh`.
  If `gh` cannot authenticate there, the run fails calmly (`could not tell what is left to do`)
  rather than guess. Also: watch the first Dependabot runtime-dependency PR after merge.
  `dependabot-changeset.yml` was written and its script tested here (against a scratch
  repository, and the CI gate's shell block run by hand), but it cannot run until it is on main.
  Unproven: that the `releasing` environment's `RELEASE_APP_PRIVATE_KEY` reaches a
  `pull_request_target` run Dependabot started (if the `app-token` step fails for want of a key,
  add the same key as a Dependabot secret in the repository's settings); that the App's push of
  `.changeset/dependabot-<n>.md` re-runs CI on the branch; and that Dependabot's later behaviour
  on a branch with a bot commit is as expected (it stops rebasing, as it did for your
  hand-written ones).
* **Coach's reply**: "Noted, will watch for these both —" -- `proceed`.
* **Where it went**: no change; the Coach watches the first failed release and the first Dependabot
  runtime-dependency PR.

### CLAUDE.md's stale *Commands* lines (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its hands-only items.
* **Question**: CLAUDE.md's *Commands* is a line stale (I did not edit it): `pnpm justify` now
  also runs the size budgets, and `pnpm size` now builds once; `pnpm size:check` measures what is
  already built.
* **Coach's reply**: "fixed in my branch" -- `proceed`.
* **Where it went**: the Coach's own branch; nothing for the sprint.

### Resolutions beside their questions, and every worker matter in the doc (the process)

* **Raised by**: the Coach, in *Coach notes* and in chat.
* **Question**: (the Coach's own note)
* **Coach's reply**: "update the turbochat and sprint (and/or worker) skill -- when I give a
  resolution to an open matter raised in the pr and/or whiteboard or human file, deposit the same
  brief restatement next to it; also maintain a
  whiteboard/YYYMMDD-sprintname/YYYMMDD-sprintname-resolutions.md file that has the full question
  and the full reply. * make sure that every new open matter from the workers is cycled back -- by
  orchestrator or by them -- to the doc" -- `proceed`.
* **Where it went**: this file; the `turbochat` and `sprint` skills and the `thread-worker` and
  `thread-reviewer` agents (on the sprint PR); every worker and reviewer now ends its report with
  an *Open matters* list, which the orchestrator puts in the tab.

### The CI failures (thread 14)

* **Raised by**: the Coach, in *Coach notes*.
* **Question**: (the Coach's own note)
* **Coach's reply**: "There is a test failure currently on CI, as well as an over-budget size
  test" with the log of `packages/safebyok-react` `tests/vault-provider.test.tsx` > VaultProvider >
  when openVault rejects > eraseDamagedVault > "opens again, and still rejects, when the erase
  finds storage changed: it reads sound now" (`AssertionError: promise resolved "undefined"
  instead of rejecting`, at `tests/vault-provider.test.tsx:774:55`) -- `proceed`.
* **Where it went**: the `vault-provider` flake is on main (it fails on the documents-only sprint PR
  too) and the demo's `App.test.tsx` fails on #129. Both went to thread 14, first. The size
  overrun is thread 4's `openVault` budget, 1.7 kB over on its draft, and thread 4 raises that
  line (YOLO 10, 11).

### Why is the `KeyDeriver` interface not uniform? (thread 6) -- explained, not yet resolved

* **Raised by**: thread 6 ([#126](https://github.com/mrflip/safebyok/pull/126)), and the Coach's note on it.
* **Question**: `class X implements KeyDeriver` no longer compiles (a class cannot implement a
  union): a host writes `implements CustomKeyDeriver` or `Argon2idKeyDeriver`. One test of ours
  did exactly that.
* **Coach's reply**: "Why is the KeyDeriver interface not uniform? I'd likely prefer a thin shim
  over Argon2 that speaks our language. Explain, but don't take further action yet" -- `explain`.
* **Where it went**: explained in a new *Open Matters* row, set back to `drafting` for the Coach.

## First batch, 2026-10-16

Ruled before this file existed. The plan's *Coach rulings during the sprint* has each ruling and
the Coach's words where they were short; the full questions and replies are being recovered from
the session's record and will follow here.
