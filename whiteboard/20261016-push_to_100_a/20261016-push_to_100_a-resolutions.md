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

## First batch, 2026-10-16 (doc revs 126 to 1998)

Ruled before this file existed, and recovered from the session's record of the tab, oldest first.
Where the Coach typed in front of the agent's text in a *Coach notes* row, the Coach's words are
the reply and the agent's text is the question. The Store base design's highlighted comments are
in the plan's thread 5 entry, not repeated here.

### `user_id` characters (thread 1)

* **Raised by**: thread 1
* **Question**: **`user_id` characters (thread 1).** The default `user_id` check becomes letters, digits and `-_.:@+|`, 1 to 100 characters, with no `^` or `/`. **Rec:** keep this set; it covers provider ids (Clerk, Auth0, Convex) and emails.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 1 (#128): letters, digits and `-_.:@+|`, 1 to 100.

### Standard Schema (G497)

* **Raised by**: G497
* **Question**: **Standard Schema (G497).** Once thread 1 binds validators once at `openVault`, accepting any Standard Schema validator (Valibot, ArkType) instead of Zod's becomes a small change. **Rec:** leave it NOT YET; nothing in this sprint needs it.
* **Coach's reply**: "NOTYET" -- `proceed`.
* **Where it went**: stays NOT YET.

### Relative-time polyfill (thread 7)

* **Raised by**: thread 7
* **Question**: **Relative-time polyfill (thread 7).** The dialog's "locks in 3 hours" uses `Intl.RelativeTimeFormat`, which some runtimes (React Native's Hermes) lack. **Rec:** document only: the React README names `@formatjs/intl-relativetimeformat` for a host to import, and we add no dependency.
* **Coach's reply**: "yes. If i understand right, we implement nothing but `Intl.RelativeTimeFormat` code, assume it's there, and tell people how to make sure it's 100% always there" -- `proceed`.
* **Where it went**: thread 7 (#129): no presence check and no fallback; the React README says how a host makes sure it is there (`@formatjs/intl-relativetimeformat`); no dependency.

### The adapters' logger option (thread 5)

* **Raised by**: thread 5
* **Question**: **The adapters' logger option (thread 5).** Every storage adapter will take a logger when it is built, with the console as the fallback. **Rec:** call it `logger` everywhere, the same name `openVault` uses.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 5b: `logger` in every adapter, in one options bag.

### A hint on the whisper field (thread 7)

* **Raised by**: thread 7
* **Question**: **A hint on the whisper field (thread 7).** Your push_to_100 note asks "do we offer a hint?" for the field where a user pastes an API key. **Rec:** a `placeholder` the host passes (`sk-…`), none by default, and never anything taken from a stored whisper.
* **Coach's reply**: "yes
Add a NOTYET "Option to let user add a hint on their passphrase"" -- `proceed`.
* **Where it went**: thread 7 (#129): a host `placeholder`, none by default; NOTYET: "Option to let the user add a hint on their passphrase".

### Password strength meter (thread 10)

* **Raised by**: thread 10
* **Question**: **Password strength meter (thread 10).** Thread 10 requires 12 characters at least (NIST's rule: length, no composition rules). A real strength meter (`@zxcvbn-ts/core` and its dictionaries, hundreds of kB) would be a dependency. **Rec:** no: the host adds one if it wants.
* **Coach's reply**: "The "don't let customers shoot themselves in the foot" rule says we should not offer a bullshit password meter. Add a pluggable callback passphraseStrengthTest() to the entry point. Have safebyok/browser export `@zxcvbn-ts/core` as a tree-shakeable default. 
Add a NOTYET "Break out dependencies including the -fastkey into a  -utils or -bestpractices package"" -- `proceed`.
* **Where it went**: thread 10: `passphraseStrengthTest()` on the entry point, `@zxcvbn-ts/core` from `safebyok/browser` as a tree-shakeable default (the Coach's yes to the dependency); NOTYET: break dependencies out into a -utils or -bestpractices package.

### Where the password-manager attributes live (thread 7)

* **Raised by**: thread 7
* **Question**: **Where the password-manager attributes live (thread 7).** Your note asks to export the field's ignore attributes, and whether we need a /utils package. **Rec:** no new package: export them from `safebyok/utils`, beside `mask`, since they are framework-neutral.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 7 (#129): exported from `safebyok/utils` beside `mask`.

### PostgresVaultDB type (thread 5)

* **Raised by**: thread 5
* **Question**: **PostgresVaultDB type (thread 5).** Once every VaultDB can list whole records for a server, the exported PostgresVaultDB type means nothing more than VaultDB. **Rec:** drop it (before 1.0, no alias).
* **Coach's reply**: "if the question is "we used to export a certain type, but we found out we don't need to, can we stop exporting it possibly breaking two people in the entire world's code" the answer is yes drop it; else explain" -- `proceed`.
* **Where it went**: thread 5b: the type is dropped.

### Store base design (thread 5)

* **Raised by**: thread 5
* **Question**: **Store base design (thread 5).** Thread 5 builds a shared base class for every storage adapter; the preplan says you read its design before it is built. The design is written: the Store base design tab, about ten minutes' read. **Rec:** read it, then `proceed`; until then thread 5's build waits and the rest of the sprint carries on.
* **Coach's reply**: "yes, see comments (highlighted)" -- `proceed`.
* **Where it went**: thread 5b proceeds with the comments highlighted in the Store base design tab: one options bag per adapter factory; openVault hands its logger to the adapter; `reportError` checked at call time, with a TODO; no bindValidators; no ShelfVaultDB.

### One-character key joiner (thread 1)

* **Raised by**: thread 1
* **Question**: **One-character key joiner (thread 1).** The preplan let a host swap the key-value adapters' key join and split functions. Thread 1 offers only a different delimiter character (^ by default): prefix scans and IndexedDB key ranges need a prefix that is exact, which a free-form join cannot promise. A host whose names allow any text can pick NUL, which no name may hold. **Rec:** accept, as built.
* **Coach's reply**: "don't let a host set the key join and split., or specify a different character" -- `proceed`.
* **Where it went**: thread 1 (#128), rebuilt: `^` fixed, no host delimiter, and `^` refused by the name floor everywhere (YOLO 7).

### No bindValidators (thread 1)

* **Raised by**: thread 1
* **Question**: **No bindValidators (thread 1).** The preplan had openVault bind its validators onto the storage adapter once. Thread 1 (#128) found that, with host validators run only where the vault takes input, storage never needs them: every verb lost its validators argument and no binding was added. A binding would also forbid two vaults with different rules on one adapter; it can be added later without breaking anyone. **Rec:** accept, as built.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 1 (#128), as built.

### Is lockSoon() a soft lock? (thread 3)

* **Raised by**: thread 3
* **Question**: **Is lockSoon() a soft lock? (thread 3)** As built (#127), lockSoon() wins against an unlock already under way in another tab, like lock(), and forgets the remembered unlock at once. Fable's strawman made it soft: an unlock under way would finish. Flipping it is two lines and two tests. **Rec:** keep it hard as built: a user who asked to lock soon expects nothing new to open meanwhile.
* **Coach's reply**: "lockSoon is a a soft lock" -- `proceed`.
* **Where it went**: thread 4 (#132): `lockSoon()` is soft.

### Refuse an all-zero derived key (thread 6, G032)

* **Raised by**: thread 6, G032
* **Question**: **Refuse an all-zero derived key (thread 6, G032).** We now wipe the deriver's output bytes after use. A host deriver that caches its output would hand back zeros next time, and the vault would seal under a key anyone can rebuild; today only the docs forbid that. **Rec:** yes, refuse an all-zero result as bad_option: one check, added on top of #126.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 10: refused as `bad_option`.

### Passkey changing a passphrase (thread 6, G072)

* **Raised by**: thread 6, G072
* **Question**: **Passkey changing a passphrase (thread 6, G072).** changePassphrase now takes any proof, a passkey's included. When a vault has several passphrases and the proof is a passkey, the caller must name which passphrase to replace (unlockId), or the call is refused rather than guessing. **Rec:** keep as built (#126).
* **Coach's reply**: "keep as built, but this is too complicated for a user to tolerate or a customer to implement UX for. add this under a todo item (or create that todo item) "Are we doing anyone a favore by accepting multiple passphrases"" -- `proceed`.
* **Where it went**: kept as built (#126); TODO.md *Soonish*: "Are we doing anyone a favor by accepting multiple passphrases?"

### ShelfVaultDB (thread 5)

* **Raised by**: thread 5
* **Question**: **ShelfVaultDB (thread 5).** The design offers a further base for key-value stores: a connector writes one atomic step, and the base writes every verb on top of it, folding localVaultDB and idbVaultDB into it. It needs a three-line promise chain we would hand-roll. **Rec:** not this sprint; the shared expectation checks are built now, and this waits for a later design.
* **Coach's reply**: "agree, add as a TODO" -- `proceed`.
* **Where it went**: TODO.md *Side quests*: "`ShelfVaultDB`, a base for key-value stores".

### A todo on identity and the backing database

* **Raised by**: the Coach, in *Coach notes*
* **Question**: (the Coach's own note)
* **Coach's reply**: "Add a todo: "Identity should not be tied to the backing database"" -- `proceed`.
* **Where it went**: TODO.md *Soonish*: "Identity should not be tied to the backing database".

### A read overtaken by a hard lock (G119, part two)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G119, part two: a `read()` in flight when a hard lock lands. Today `read()` checks the lock at its door, then awaits storage, then decrypts and returns. If `lock()` lands during the await, the whisper still comes back, because G022 settled that work already started finishes. That is right for the soft lock, which has a grace. For a hard lock it means the goons can get one more whisper. The proposal: each handle already keeps a counter that every lock bumps. `read()` notes the counter at its door and, after its last await, compares once. If it moved, it refuses `vault_locked` instead of decrypting. Your worry was that this sounds like its own race. It is not, for one reason: the counter only ever goes up, so the compare can only turn a would-be success into a refusal, never the reverse, and there is no window in which two outcomes become possible that were not possible before. A whisper that was already returned before the lock cannot be clawed back, and that is correct, the lock came after. A soft lock does not bump the counter until its timer drops the key, so a read inside the grace still finishes. One integer compare per read, no new state, no timer.
* **Coach's reply**: "agree, no more reading if the goons are at the door" -- `proceed`.
* **Where it went**: thread 4 (#132): a hard lock landing during a read refuses it and drops the whisper.

### A refresh that meets rolled_back (G516)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G516, first bullet: a refresh that meets `rolled_back`. Since #120 each device remembers the highest epochs it has seen, and refuses a copy of the vault older than that as `rolled_back`, so storage cannot quietly bring back a removed way in. At open and at unlock that refusal stops you. But when a background refresh, a push from storage, meets it on an already unlocked vault, #120 chose in YOLO to log a line and leave the vault unlocked. The proposal is that this joins the sign-out case in `refusal-policy.ts`: an untrustworthy copy of the vault drops the key, now. I should be honest about what it buys. The exposure is small, because every write already carries epoch expectations that an older storage would refuse, so a device staying unlocked over rolled-back storage can read its own lockboxes and cannot write anything harmful. What locking adds is that the user hears about it at once, through the snapshot and the dialog, rather than through a log line nobody reads, and that "storage I cannot trust" becomes one rule for both signals instead of two behaviours.
* **Coach's reply**: "Agree, one rule" -- `proceed`.
* **Where it went**: thread 4 (#132): `rolled_back` on a refresh locks the vault, by the same rule as `identity_revoked`.

### Remove 'stay' (G119, part one)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G119, part one: drop `whenIdentityRevoked: 'stay'`. Since #106, when storage answers that the signed-in user is gone or someone else signed in, the vault locks itself, as `lock()` would. The option `'stay'` turns that off: the refusal is thrown, and the key stays in memory. It was kept for a host whose auth blips, a token refresh that briefly looks like a sign-out, so users are not locked out every few minutes. My objection is that a blip is not a sign-out. Contract line 5.5 says an adapter raises `identity_revoked` only when the user really is not the scope's user, so a backend that raises it on a blip is breaking the contract, and `'stay'` papers over that bug by keeping keys past a sign-out. The strawman's P8 says a sign-out is one of the few things that hard-locks. Dropping `'stay'` is one enum value and a README paragraph. The cost is that a host with a blipping backend has to fix the adapter, which is where the fault is.
* **Coach's reply**: "Remove 'stay' please" -- `proceed`.
* **Where it went**: thread 4 (#132): `whenIdentityRevoked` is removed, from the core and from `VaultProvider`.

### One rule, no knob, for sign-out and rolled_back

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: The strawman says `rolled_back` gets "the same host knob" as the sign-out case, and G119 says to drop that knob. My recommendation is one rule and no knob for either: both hard-lock, and the host's way out after a deliberate restore is the README's `eraseMark` recipe, which G513 keeps. If you want a knob anywhere, keep it for `rolled_back` alone, since restoring from a backup is something a host does on purpose while a sign-out blip is a backend bug.
* **Coach's reply**: "agree, one rule, simple to reason about" -- `proceed`.
* **Where it went**: thread 4 (#132): one rule in `RefusalPolicy.decide`, no knob; a host's way out after a deliberate restore is the README's `eraseMark` recipe.
