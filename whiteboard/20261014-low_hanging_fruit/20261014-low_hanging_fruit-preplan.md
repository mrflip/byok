# 2026-10-14: Low-hanging fruit -- preplan

The small tasks that are either needed and attached to nothing, or so simple we will do them
anyway. Each is one thread, one PR, a sitting or less; none needs a plan of its own beyond this
page. They are listed in the order to run them, with the one constraint each has.

Two sprints are in flight and touch the files these would touch: **pr_releases** (open
[#15](https://github.com/mrflip/safebyok/pull/15), [#16](https://github.com/mrflip/safebyok/pull/16),
and `20261014-changeset_releases`, which moves the core to `packages/safebyok/`) and
**convex_vaultdb** (`20261014-storage_verbs` rewrites `src/vault-db.ts`, `src/vault.ts`,
`src/errors.ts` and their tests; the Convex threads stack on it). So: **cut every thread here
from `main` after both sprints land**, unless its row says it can go now. Each thread follows
PROCESS.md (own worktree, `pnpm justify` green, one PR, a `human/` entry) and adds a changeset
when it changes a published package.

Rulings these rest on (the Coach, in chat, 2026-10-14): `keyDeriver` and `deviceDB` are explicit
in the main code path, with one subpath export supplying the "don't make me think" defaults;
the IndexedDB device store stays in the core; `whisper_schema_version` is an integer in public
metadata, defaulted to 1 (`whiteboard/20261014-crypto/rulings.md`); `mask` lives in
`safebyok/utils` (VOCABULARY.md); a hand-rolled utility needs a library search first (CLAUDE.md).

## Threads

| # | Label | Size | Can start | Why it is here |
| - | ----- | ---- | --------- | -------------- |
| 1 | `flaky_tamper_tests` | tiny | now | Needed: CI fails about one run in sixty-four for no reason |
| 2 | `explicit_options` | small | after both sprints | Needed by the hash-wasm roadmap item; the Coach's "basic options" export |
| 3 | `provider_open_rejection` | small | after #15 | Needed: a failed `openVault` in React is silent today |
| 4 | `mask_utils` | small | after #16 | Promised by VOCABULARY.md; nothing depends on it |
| 5 | `boundary_audit` | small | after roadmap 3 | The late-optionals audit the rulings ask for; `whisper_schema_version` itself moved to roadmap 3 |
| 6 | `stale_write_retry` | small | after storage_verbs | Ruled TODO(soonish); a few lines once `stale_write` exists |
| 7 | `size_budget` | small | after #16 | The baseline the zod-mini thread will lower; keeps tree-shaking true |
| 8 | `docs_sweep` | small | after both sprints | Stale lines the canvass found; not the README promotion |
| 9 | `label_grammar_report` | tiny | now | Investigation only, no code change: what depends on Label's strictness |

### 1. `flaky_tamper_tests`

`tests/vault.test.ts` ("a lockbox with altered ciphertext refuses to open") and the matching
case in `tests/crypto.test.ts` tamper by replacing the first base64url character with `A`. When
that character already is `A` (one time in sixty-four) nothing is altered and the test fails.
Replace it with a character that is guaranteed to differ (`A` unless it is `A`, then `B`), in a
tiny named helper in `tests/helpers.ts` so both tests share it. Acceptance: the two tests pass
across a loop of two hundred runs. Model: Sonnet.

### 2. `explicit_options`

The main code path asks for every tree-shakeable choice; one subpath export supplies the defaults.

* `OpenVaultOpts.keyDeriver` becomes required. `openVault` no longer falls back to
  `argon2idWebV1Deriver` (`src/vault.ts`, the `??` at the deriver), which is what keeps noble in
  every bundle today. `argon2idWebV1Deriver` stays exported from the core.
* A new entry, `safebyok/browser` (named for what it assumes, not for whom it is for), exporting
  `browserOpts({ dbName }?)`: a bag `{ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }) }`
  the host spreads into `openVault`. A bag, not a wrapper function, so there is one `openVault`
  to document and a host can override one field. The vault store is never in the bag: the
  backend is the one choice every host makes. The main entry must not import this one.
* `safebyok-react`'s `VaultProvider` prop `keyDeriver` becomes required too (it is optional
  today, so the typecheck fails the moment the core's option does, which is the point), and the
  demo passes `browserOpts()`.
* While the surface is open: the snapshot's `expiresAt` is renamed `askPassphraseAt` and
  `rememberForMs` becomes `forcePassphraseReentryHours` (TODO.md, roadmap 3 and 5), since both
  are one-line renames today and breaking changes after `0.1.0`.
* README (core and proposed): the quickstart imports from `safebyok/browser`; the tree-shaking
  paragraph says why the main path is explicit.
* Tests: `openVault` without `keyDeriver` refuses as `bad_option`; a bundle built from a bare
  `openVault` import contains no `argon2` (thread 7 makes this a budget; here, one vitest that
  greps the built chunk is enough).

Public surface change: the changeset says a host must now pass `keyDeriver`, and shows the
one-line fix. Model: Opus.

### 3. `provider_open_rejection`

`packages/safebyok-react/src/vault-provider.tsx` calls `openVault` with `void` and drops a
rejection. Hold the error in state and throw it during render, so an error boundary and the dev
overlay show it: every rejection `openVault` can produce before the vault exists is misuse
(`bad_option`, `bad_label`, `unknown_key_deriver`) or storage trouble that no user action fixes.
The full misuse-versus-condition split (TODO.md, *Error families*) is not this thread; this is
the one case that is silent today. Test: a provider given a bad label throws to a boundary.
Model: Sonnet.

### 4. `mask_utils`

A `safebyok/utils` entry (its own line in `tsdown.config.ts` and `exports`) with
`mask(whisper, { head = 2, tail = 4, minStars = 6, maxLen = 15 })` as TODO.md specifies: strip
control characters first; keep `head` and `tail` characters and star the rest; when the whisper
is shorter than `head + tail + minStars`, give up head characters first, then tail; above
`maxLen`, put `***...***` between head and tail. Recommendation on the open choice: keep
`maxLen`, since the caller is sizing a table cell and thinks in characters shown, not stars.
Library search first (CLAUDE.md): a masking package that strips control characters and honours
a minimum star count is unlikely to exist, but the search is the rule, and the PR says what was
found. Tests per `@example`, including an empty whisper and one that is all control characters.
VOCABULARY.md mentions a stars-only variant: export `maskAll(whisper)` beside it, or strike the
sentence; the PR says which. Model: Sonnet.

### 5. `boundary_audit`

The audit the rulings ask for (`whiteboard/20261014-crypto/rulings.md`, *The boundary pattern*):
every "late" optional on a record (the `public` bag, `whisper_schema_version` and `whisper_codec`
once roadmap 3 has added them, `DeviceUnlock`'s shape) is nulled, defaulted and validated where
it crosses storage or the public API, and trusted past that. `whisper_schema_version` itself is
no longer here: it joins the stored-format reservations (TODO.md, roadmap 3) so it enters the
cipher binding at the same time. Touches `src/types.ts`, `src/vault.ts`, `src/vault-db.ts` and
their tests. Model: Opus.

### 6. `stale_write_retry`

Once `stale_write` exists: `store()` and `erase()` retry a versioned update up to a small fixed
limit (three) when the expectation fails, re-reading between attempts, and surface `stale_write`
only after that. Erase already wins and carries no expectation. The conflict-handler hook the
rulings mention "with the retry work" is API design and stays in TODO *Soonish*; this thread is
the politeness only. Tests: two sessions racing on one box, the loser's retry landing. Model:
Sonnet.

### 7. `size_budget`

A tree-shaking budget in CI, by library: `size-limit` with `@size-limit/preset-small-lib`, one
entry per public import shape (`openVault` alone; `stableJsonify` alone; `idbDeviceDB` from
`safebyok/idb`; `browserOpts` from `safebyok/browser`), each with a limit a little above today's
measured size, and `pnpm size` at the root. The measured figures to start from (rolldown,
minified; before zod/mini): everything 136 KB, `openVault` 132 KB, `stableJsonify` 106 KB,
`idbDeviceDB` 108 KB. The zod-mini thread then lowers the limits; a regression fails CI. Dev
dependencies only, a Coach's yes for them in the PR. Model: Sonnet.

### 8. `docs_sweep`

The stale lines the canvass found, each a one-line fix; not the README promotion (a roadmap
item) and not anything the two sprints rewrite (CLAUDE.md layout, PROCESS.md releases,
`notes/security.md` release bullet):

* `src/types.ts`: the `Label` doc block lists `userlabel`; `VaultScope.user_id` is deliberately
  not a Label.
* `src/string-store.ts` and `src/vault-db.ts`: "stub", "pretend" and "stand-in" survive from the
  plaintext era; `localVaultDB` is a real local-only store.
* `VOCABULARY.md`: `revisionId` "lets storage refuse a write made from a stale read" is true only
  once storage_verbs lands (check, then keep or reword); the `mask` paragraph matches thread 4.
* The screen-lock recipe the rulings ask to document: a host line on `visibilitychange` calling
  `lock()` (or `lockSoon()` once expiry lands), in the core README's locking section.
* The demo calls `navigator.storage.persist()` as `src/idb.ts`'s doc block says a host should.
* The React passphrase dialog, and the README, say there is no recovery path, as the proposed
  README promised the UI would.
* `demos/safebyok-demo-react/README.md` and `pnpm-workspace.yaml`'s header after the core move.
* `.github/dependabot.yml` gains the package directories if #16 did not add them.

Model: Sonnet.

### 9. `label_grammar_report`

Investigation, no code change: what depends on `Label`'s strictness (`^[a-z](_?[a-z0-9])+$`,
max 40)? Read every `parseLabel` call site, the storage ckeys in both adapters, the cipher
binding (labels are elements of the additional-data array, so a label with a `"` or `\` is
JSON-escaped, not a separator), the Convex table layout, and the React package. Report in a
`human/` entry: which of applabel, vaultlabel, boxlabel could take a host-chosen grammar without
touching a stored record or a binding, and what the pluggable validator's seam would be. The
pluggable validator itself is a *Soonish* item that waits on this. Model: Sonnet.

## Coach chores

Not threads; things only the Coach can do, found on the way:

* Remove the merged worktrees `../byok-convex`, `../byok-whisper-cap`, `../byok-staged-publish`
  and run `scripts/git-attic` (notes/housekeeping.md); a vite dev server from a removed worktree
  is still listening on port 5199.
* Merge dependabot [#13](https://github.com/mrflip/safebyok/pull/13).
* After the first real release: deprecate `safebyok@0.0.0` on npm.
* On the next container rebuild: the `.devcontainer/devcontainer.json` volumes are still named
  `byok-*`.
* Wire `safebyok-convex` into CI once #15 and the Convex client thread have both landed (the
  Convex plan leaves this to you).

## Open to the Coach

* Thread 2's entry name: `safebyok/browser` is the recommendation; `safebyok/basic` was your
  word. The reasoning: name the assumption (IndexedDB, noble Argon2id) so a `safebyok/node`
  sibling reads naturally later.
* Thread 4: `maxLen` over `maxStars`, and whether the stars-only variant ships.
* Thread 7 adds two dev dependencies (`size-limit`, its preset).
