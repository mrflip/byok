# Sprint matters -- plan

* **Date**: 2026-10-15
* **Mode**: normal. A question a worker can't settle becomes a row in the Coach's Open Matters tab,
  and the thread waits for it; minor calls are recorded and ride along.
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach), through the Open Matters tab of the big_feats sprint doc
  (`/turbochat`): each thread below is a row they set to `proceed`, with their answer verbatim.
* **Status**: wave 1 (threads 1 to 4) underway; wave 2 (threads 5 to 7) waits on the gripes line.

## Read first

Beyond CLAUDE.md, and STYLE.md and VOCABULARY.md before naming anything or writing a test:

* `TODO.md`'s *Open from big_feats*, and `human/20261015-sprint_big_feats_rulings.md`: where each
  of these matters came from.
* `notes/security.md`, and for thread 1 `whiteboard/20261014-crypto/decisions.md`.
* `whiteboard/20261015-big_feats/big_feats-progress.md`: what the big_feats sprint learned,
  including the size budgets and the reviews' leftovers.

## Ground rules

* **The base is main** at `c4c070f` (big_feats and `/turbochat` merged). Push only with an
  explicit refspec:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
* **No backward compatibility** (CLAUDE.md, and the Coach again here): a stored shape that
  changes reads old records as corrupt, and the changeset says so.
* **The gripes line is open beside us**, and is not yet on this base. Built on main from before
  big_feats, it runs main → #87 → #85 → #83 → #92 → #95 → #93 → #91 → #90: validation
  overrides, rows keyed by the JSON of their names (#92), damaged lockboxes (#93), dialog wording.
  It touches the core, `safebyok-react`, the demo, `TODO.md`, `notes/security.md`,
  `VOCABULARY.md` and `.size-limit.json`. Keep hunks in those shared files small and additive, so
  whichever line lands second restacks cheaply.
* **`TODO.md` is thread 4's alone** in this sprint. Another thread with something for it says so
  in its report.
* **Size budgets**: thread 4 raises them, and wave 2 is cut after it, so inherits the room. Wave
  1's other threads add little to the core's bundles; none of them edits `.size-limit.json`, and
  one that overshoots main's budget says so in its report.

## Threads

### Wave 1: cut from main now

#### 1. hkdf_info

> **The passkey's HKDF info.** *Rec: add vault_id and the scope.* The Coach: "Make everything
> verifiable unless there's a good reason not to. We do not need to maintain backwards
> compatability"

*Gloss.* The passkey wrapping key's HKDF `info` (`packages/safebyok/src/crypto.ts`, around line
104, and its callers in `vault.ts`) gains `vault_id` and the scope (applabel, user_id,
vaultlabel), beside format, purpose and credential_id. "Make everything verifiable" reaches
further, so sweep every derivation and every cipher binding (HKDF info, AES-GCM AAD) for a
field we write that is left out, and bind it unless there's a good reason; each reason kept goes
in `notes/security.md`. Old passkey envelopes read as corrupt (no compat). `crypto:` prefix.
Look-ahead: none.

#### 2. release_age (sonnet)

> **pnpm's `minimumReleaseAge`.** The Coach: "yes seven days. Same policy as for similar things:
> report it when it's added, and always add each exception to security.md for later audit and
> re-pinning. Should hot releases be pinned more, or less, specifically than normal? I'd rather
> 100 bugs than one vuln"

*Gloss.* `minimumReleaseAge: 10080` (minutes) in `pnpm-workspace.yaml`. Every exception
(`minimumReleaseAgeExclude`) gets an entry in `notes/security.md` naming the package, the exact
version, why, and when to revisit. The orchestrator's answer to the Coach's question, for the
thread to write into PROCESS.md *Dependencies*: a hot release (a fix we must take before it is
seven days old) is pinned *more* specifically -- the exact version, never a range -- excluded by
name and version only, recorded the same day, and the exclusion is removed once the version ages
past seven days. Never an exclusion for convenience. Also retire the hand pins of big_feats' YOLO
decision 5 if the rule now covers them. Check that a frozen-lockfile install and CI still pass,
and report what the rule refused, if anything. `deps:` prefix for the setting, `docs:` for
PROCESS.md.

#### 3. passkey_button_ux

> **`PasskeyUnlockButton`'s misuse errors.** *Rec: match the passphrase dialog.* The Coach: "make
> the behavior follow best ux practices first -- design for a productionized professional app
> (does that give the guidance necessary? I will need more background on what the precise
> experience is for developer and user to help make a decision)"

*Gloss.* `packages/safebyok-react/src/passkey-unlock-button.tsx`, beside `passphrase-modal.tsx`.
Today a programming mistake (a bad prop, a vault opened wrong) shows calmly in the button, where
`PassphraseModal` throws it to the error boundary. Design both components' failure behaviour to
the practice of a professional production app: the end user sees a calm, actionable state for
what they can fix or retry; the developer meets a misuse loudly and early, in development,
without the user's screen going blank in production. Build what that practice settles. Then
write, in the thread file and the PR, the experience before and after for both audiences, so the
Coach can rule on anything left. A choice that remains goes back as a matter. `client:` prefix.

#### 4. small_sweep (sonnet)

> **The flaky demo test.** The Coach: "go"
>
> **For you: Supabase.** The Coach: "yes untested in the readme, not yet in the todo"
>
> **For you: real authenticators.** The Coach: "I will run acceptance tests. Add a line to the
> TODO soonish: \"What level of e2e testing is appropriate?\""
>
> **Size headroom.** The Coach: "loosen things. Add guidance that a sprint orchestrator can and
> should monitor the size tests and have workers advance them so there are not trivial merge
> conflicts or resolutions when we stack the sprint's PRs -- if we're at 25 out of 28, and workers
> will be adding 1, 3, and 6 to it, advance the cap to 38 so their edits agree."
>
> **Sand in the sandals.** The Coach: "the root scripts chain with `&&` ... that's bad, fix that /
> Convex's `--no-error-on-unmatched-pattern`: make this its own row with a good explanation / the
> demo's coverage has no `include`: this sounds like a request to solve an obvious problem the
> obvious way; if so, do so; if not, explain in a new row. / the root eslint config doesn't ignore
> a stale root `dist/`: same: if it's an obvious problem, solve that"

*Gloss.* One commit each:
* `demos/safebyok-demo-react/tests/test-helpers.test.tsx:62`: wait for the dialog to go
  (`waitFor`), as the other assertions there do. `demo:`
* The Postgres README's Supabase section says plainly that it has not been run against Supabase.
  Not a TODO entry. `docs:`
* `TODO.md`: "What level of e2e testing is appropriate?" under *Open from big_feats*; the
  rulings line updated (HKDF info and `minimumReleaseAge` ruled, threads 1 and 2; `addPasskey`'s
  shape kept, as built); the epoch line pointing at the revocation matter instead; *Sand in the
  sandals* cleared of what main already fixed (the root scripts run every package since the
  gripes sprint, the root eslint ignores `**/dist/**`, the demo's coverage has an `include`, and
  Convex's flag is gone -- check each before striking it). `plan:`
* `justify:root` still chains with `&&`: make it run all three and fail if any failed, as
  `justify` does. `tools:`
* `.size-limit.json`: every budget raised to what it measures now plus at least 3 kB, rounded up
  to a whole kB, so the sprint's threads and the gripes line's restack don't fight over it.
  `tools:`
* `.claude/skills/sprint/SKILL.md`: the Coach's size guidance, in §1 (plan) and §2 (cut): the
  orchestrator reads `pnpm size` when planning, estimates what each thread adds, and has the
  first thread raise each budget to cover the sum, so stacked PRs agree; workers don't edit the
  budgets afterwards, and report an overshoot. `docs:`

### Wave 2: waits on the gripes line

Cut from the gripes line's top once it is restacked onto main (or from main once it lands): #92
rekeys every row and #93 changes what `listBoxes` returns, which is the ground these threads
audit and rewrite.

#### 5. vaultdb_battery

> **Audit the VaultDBs and grow the standard battery.** The Coach: "yes do this as a sprint"

*Gloss.* TODO's entry: audit every adapter against the `VaultDB` contract, move into
`TH.describeVaultDB` whatever a package proves by hand that is really the contract, and trim each
package's bespoke tests to what is its own (extra testing is fine; vacuous testing is not). Each
package runs the battery itself; the core runs it over `localVaultDB(memoryStore())`. "As a
sprint": large enough to split by package if the audit shows it -- the orchestrator decides when
the audit reports.

#### 6. race_helper (opus)

> **A race helper.** The Coach: "yes, proceed. I would like this work done by opus, with thought
> put in to making sure it's an honest test, and assessing what parts of this should be a generic
> method implementing the test vs helpers offered to the individual db implementer."

*Gloss.* Stacked on thread 5. Two writers through separate stores, interleaved at the points
that matter; one lands, the other is `stale_write`. "Honest": the test must fail against an
adapter that doesn't actually guard (prove it with a deliberately broken adapter), and must not
pass because the two writers secretly share a connection or a lock. Decide, and say why, what the
battery runs for every adapter and what is a helper an adapter calls with its own interleaving
points.

#### 7. indexeddb_fixes

> **No null as an error's cause.** The Coach: "go"
>
> **IndexedDB reads only the scope's rows.** The Coach: "this seems like a straightforward and
> useful fix -- am I just approving a follow-on commit or is there something deeper here (in which
> case, explain more)"

*Gloss.* `packages/safebyok-indexeddb`. A failed write whose `request.error` is null reports "the
write failed for an unknown reason", never a null cause. `listBoxes` and `eraseVault` read a key
range over the scope's prefix, not the whole store, and the bell's BroadcastChannel is closed
when its vault closes. The orchestrator's answer to the Coach: a follow-on, nothing deeper -- but
the key range is built on how rows are keyed, which #92 changes, so it waits for that.

## Not in this sprint

* **Elevated**, for the Coach to take to another session: the Postgres vault cap, revocation and
  server signing, and the store base class (tabs under Open Matters).
* **Still drafting** in Open Matters: lock on sign-out, `destroy()`'s edge cases, label grammar on
  the server, the first-emit deviation, the `openVault` subscription leak, `safebyok` as a peer,
  Convex's `react` dev dependency, housekeeping, the gripes session's open PRs.
* `addPasskey`'s shape: kept as built (the Coach: "LGTM"); thread 4 records it.

## For the Coach

* **The two lines collide.** The gripes line was built on main from before big_feats, so its
  restack onto main meets the IndexedDB package move, the unlock envelopes and the passkeys. Wave
  2 waits for it. (A matter row asks how you'd like it ordered.)
