# Sprint gripe_fixes -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread             | Base                  | Status  |
| - | ------------------ | --------------------- | ------- |
| 1 | kdf_configs        | #66 tip `5fefc90`     | filed [#68](https://github.com/mrflip/safebyok/pull/68) |
| 2 | vaultdb_validation | #66 tip `5fefc90`     | filed [#70](https://github.com/mrflip/safebyok/pull/70) |
| 3 | react_dialog       | #66 tip `5fefc90`     | filed [#67](https://github.com/mrflip/safebyok/pull/67) |
| 4 | ci_tooling         | #66 tip `5fefc90`     | underway |
| 5 | docs_refresh       | #66 tip `5fefc90`     | filed [#69](https://github.com/mrflip/safebyok/pull/69) (no review: documents only) |
| 6 | thin_tests         | #70 tip `d874db3`     | underway |
| 7 | test_helpers       | thread 6's tip        | pending (after 6 files) |
| 8 | comment_width      | #66 tip, after 1-7    | pending |

## What the threads have taught

*Orchestrator:* **#66's tip moved** from `dfdbbec` to `5fefc90` during the sprint: three docs-only
commits (CLAUDE.md's console line, TODO.md's second_harvest questions, a changeset, the core's
eslint comment). Threads cut later start from `5fefc90`; a thread cut from `dfdbbec` rebases onto
it when it files, as thread 3 did.

*Orchestrator:* thread 3, react_dialog, filed as [#67](https://github.com/mrflip/safebyok/pull/67).
*Review:* `clean`, nothing fixed by the reviewer. The worker took two of its minor points before
filing: the pluralizer is `Intl.NumberFormat` (`useGrouping: false`, output identical), and the
test table's quotes follow STYLE.md. Left, as open questions on the PR: a misuse unlock never
settles the `withUnlockedVault` promise (follow-up: changes `onDone`'s contract); a sub-minute
window reads "1 minute"; the dialog's 168 default and recomputed `ForeverMs` can drift from the
core, which a core accessor for the window would end; the modal test's local helpers are thread
7's to consider.

*Orchestrator:* thread 1, kdf_configs, filed as [#68](https://github.com/mrflip/safebyok/pull/68).
`Argon2idWebV1` moved to `src/key-deriver-spec.ts` (no Argon2 code, no Zod); `argon2idDeriver(spec)`
is exported; a `KeyDeriver` carries its spec's fields beside `deriveKeyBytes`. `openVault` refuses a
deriver labelled `argon2id_web_v1` without exactly that spec's parameters (breaking, minor bump);
`unlock()`/`changePassphrase()` refuse key bytes not 32 long; `keyDeriverShape` bounds `salt_bytes`
to 1..65536. It owns VOCABULARY's key-deriver rows and the last `notes/security.md` entry.
*Review:* `fixed` -- the `iterations` refusal now names the 2^32 ceiling; the worker then added
"test your bytes against ours" to the supplied-label refusal. Left, as open questions on the PR: a
hand-built deriver under a host label declaring `algorithm: 'argon2id'` gets only the generic salt
check at open, so an unrunnable spec fails at `unlock()` with no `kind` (candidate follow-up: run
the Argon2id schema whenever `algorithm === 'argon2id'`); `KeyDeriver` carries Argon2id's optional
fields for every deriver (public surface, before 1.0); key bytes not zeroed (predates); bounds
repeated as literals; the 32-byte check accepts any `ArrayBufferView`; one supplied spec; no
reserved label namespace.

*Orchestrator:* other sessions now have worktrees stacked on this sprint's branches (for example
`byok-argon2_wasm` on #68's tip, `byok-big_feats`, `byok-unlock_envelopes`). They are not this
sprint's; nothing here touches them.

*Orchestrator:* thread 2, vaultdb_validation, is `ready` (survey in its branch's
`validation-survey.md`). For later threads: VaultDB's write verbs now parse every record and
expectation (unknown fields stripped, refusals never quote); `openVault` checks its options bag,
`userId`, and the shapes of `vaultDB`/`deviceDB`; listeners and callbacks must be functions; the
IndexedDB `dbName` goes through `src/idb-opts.ts`. The Convex test "never quotes a record the
deployment refused" now adds its stray field through a wrapping client -- **thread 6 builds on
that client** rather than on Zod letting a field through.

*Orchestrator:* **a size-budget collision to watch.** `openVault`'s budget is 16.5 kB; thread 1
(#68) takes it to 16.19 and thread 2 to 16.27, each from 15.9. Together they likely pass 16.5, so
whichever merges second will fail `pnpm size` in CI and needs either a raised budget (the Coach's
word) or a trim. Thread 8 and anything else touching `vault.ts` should not add to the bundle.

*Orchestrator:* thread 5, docs_refresh, filed as [#69](https://github.com/mrflip/safebyok/pull/69) without a thread review: its diff is
`notes/security.md`, `VOCABULARY.md` and two reworded comments in `vault.ts`, so no thread review.
It added a "Names, records and times" section to VOCABULARY and removed the `whisperSchemaVersion`
row (nothing exports or stores it). **Thread 8**: VOCABULARY's table rows run past 100 columns and
cannot wrap -- the comment-width rule must leave Markdown alone (it is about source comments).

*Orchestrator:* thread 2's *Review:* `fixed` -- the `maxVaultBytes` doc and the security note now
say the 2 KiB covers a lockbox's other fields for a `user_id` up to 512 bytes (nothing bounds
`user_id`). Verified: no new refusal quotes its input; stripping unknown fields drops nothing the
stored format needs; the reframed inequality admits exactly the old configurations. Left, as open
questions: `user_id` unbounded; a control-character note escapes past 2 KiB on a JSON backend;
`openVault` duck-types `vaultDB` (a hand-written object skips the write checks); small
duplications. **Re-plan:** thread 6 now stacks on thread 2 (it strengthens the Convex "never
quotes a record" test thread 2 rewrote; both would rewrite the same lines), so thread 6 is cut
from thread 2's tip once it files, and thread 7 from thread 6's.

*Orchestrator:* thread 2 filed as [#70](https://github.com/mrflip/safebyok/pull/70) (tip `d874db3`);
its review is posted on the PR. Its open questions add to the Coach's list: the `openVault`
size budget will not hold both #68 and #70; is the reframed allowance enough; `user_id` has no
length bound; should `erase()` tolerate a `corrupt_record` box; should `SafebyokComponent.api`
check `getUserId` at load.

*Orchestrator:* **paused 10:18-11:19 at the Coach's word** (session limit). Thread 4 checkpointed
at `830e2ed` during the pause (justify green at `1070c86` below it) and has resumed. Thread 4's
findings so far: Dependabot's `directory: /` already covers `packages/*` and `demos/*` (no config
change); justify ~35 s -> ~20 s warm, with a `SAFEBYOK_SKIP_BUILD_DEPS` env var that the root's
build and test set so each package builds once. Thread 6 was cut from #70's tip after the pause.
