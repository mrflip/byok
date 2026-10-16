# Sprint gripes_part2 -- progress

## Status

| #   | Thread                | Status   |
| --- | --------------------- | -------- |
| 1   | validators_tightening | in review (#104) |
| 2   | convex_setup_check    | filed #102 |
| 3   | test_hygiene          | filed #103 |
| 4   | docs_rulings          | filed #101 |

## What the threads have taught

* **Thread 3 (#103), test_hygiene.** `tallyWatches` counts each watch closed at most once;
  `expectRefusal` asserts `instanceOf(VaultError)` (matching `isVaultError`; the pending
  `20261015-thin_tests` changeset now agrees, and the new one names the ESM/CJS split as a second
  way to see two classes); `beforeNextCall`/`holdNextCall` keep a per-method queue, one arming per
  call, on a plain method or an existing spy; `convexRefusalOf` tested; the demo's vaults close
  after each test and its panels wipe their stores. *Review:* fixed two (the panel tests asserted
  before the shelf read, so passed without the wipe; `world.seed` leaked a vault on a refusal).
  The queue came after the review, at the orchestrator's word, restoring base's arm-twice
  behaviour (76 lines, tested, unreviewed). Left, minor: a prototype-level spy is shadowed after
  restore; the demo's ordered test pair breaks under `-t`/`.only`; `stateOnOpen` leaves its vault
  open. `Vault.close()` twice unsubscribes twice: a matter row for the Coach.

* **Thread 2 (#102), convex_setup_check.** `SafebyokComponent.api(opts)` refuses a bag without a
  `getUserId` function, and `new SafebyokComponent(component)` a non-object component (a forgotten
  `app.use(safebyok)`), both `bad_option` from `VaultError`; no new kind. Importing `VaultError`
  into `server.ts` costs a host's Convex bundle 98 B (esbuild-measured). *Review:* clean; left,
  minor: a `getUserId` relying on `this` passes the check (predates), the test setup repeats
  `hostWith`'s, one test pins 9 functions, `checkedApiOpts`'s generic is only a cast. At the
  orchestrator's word the worker then trimmed the message and added the component check (three
  tests): small, but after the review. An installed-looking proxy for a never-deployed component
  still fails only at the first call.

* **Thread 4 (#101), docs_rulings.** `TODO.md` *Soonish* gains the Coach's validator-guarantees
  heading (refused text in `snapshot.boxes`, control characters, lone surrogates, server-side names,
  `unlocklabel`), "Group error messages?", the damaged-box store race, and Convex's `getUserId`
  question; a *Rulings from gripes_part2* section before *Sand in the sandals*; `STYLE.md`'s
  `expect*` rule. *Review:* none (documents only). Deviation, accepted: *Pluggable label validator*
  and *Validating the user id* stay where they were (moving them would be a large hunk in a shared
  file). **For threads 1 and 2**: its TODO lines on control characters, lone surrogates and the
  Convex setup check assume your builds; if yours land differently, say so in your report.

*Orchestrator:* the three cleanup leftovers the Coach asked about (size checks, erase's double
read, `read()`'s doc), `withUnlockedVault` against #98, and `unlocklabel`'s slot are matter rows in
the doc's Open Matters tab, drafting.
