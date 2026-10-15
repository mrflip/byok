# Thread 2: the storage verbs and versionedUpdate, in the core (2026-10-15)

Branch `20261014-storage_verbs`, PR not yet filed. Justify: root green (243 tests, build, attw,
publint); `packages/safebyok-react` green (7 tests).

* **Built**:
  - `VaultDB` (`src/vault-db.ts`) is the verbs alone. Each public verb validates and calls a
    protected `do*` half the adapter writes. Threads 3 and 4 build to this table:

    | Public verb (validates)                                   | Adapter half (protected)   | Adapter half resolves                          | Convex function    |
    | --------------------------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------ |
    | `readBundle(scope)`                                       | `doReadBundle(scope)`      | the stored record, or null                     | `getBundle`        |
    | `createBundle(bundle)`                                    | `doCreateBundle(bundle)`   | the bundle standing after (find-or-insert)     | `createBundle`     |
    | `updateBundle(bundle, expected: BundleExpectation)`       | `doUpdateBundle(...)`      | `true` if written, `false` if expectation fails | `updateBundle`     |
    | `readBox(scope, boxlabel)`                                | `doReadBox(...)`           | the stored record, or null                     | `getBox`           |
    | `listBoxes(scope)`                                        | `doListBoxes(scope)`       | records, or projections keeping `format`       | `listBoxSummaries` |
    | `updateBox(scope, lockbox, expected: LockboxExpectation)` | `doUpdateBox(...)`         | `true` / `false`, as above                     | `updateBox`        |
    | `eraseBox(scope, boxlabel)`                               | `doEraseBox(...)`          | nothing; quiet when absent                     | `eraseBox`         |
    | `eraseVault(scope)`                                       | `doEraseVault(scope)`      | nothing                                        | `eraseVault`       |
    | `subscribe(scope, onChange)` (sync)                       | `doSubscribe(...)`, default silent | the unsubscribe                        | `watchVault`       |

  - Expectation types, exported as types from `src/index.ts`, plain JSON:
    `BundleExpectation = { vault_id: string, passphrase_epoch: number }`;
    `LockboxExpectation = { vault_id: string, revision_id: string | null }` (null: no box was
    there). `updateBox` lands only while the scope's bundle has `vault_id` and the standing box
    has `revision_id` (null: there is none); no bundle refuses; a box erased since refuses.
  - Error kinds added (`src/errors.ts`): `stale_write` (a failed expectation; the base class
    throws it when the adapter half resolves `false`), `not_permitted` (the backend refused this
    user, signed out or not theirs: the adapter throws it), `storage_unavailable` (the base class
    wraps anything an adapter throws that is not already a VaultError, with the original as
    `cause`). `VaultError` takes standard `ErrorOptions` as a third argument.
  - `localVaultDB` and `idbVaultDB` implement the halves; stored records and ckeys unchanged.
  - `vault.ts`: `changePassphrase` uses `updateBundle`; `store` uses `updateBox`. Both refresh
    before rethrowing a `stale_write`.
  - `tests/vault-db-suite.ts`: `describeVaultDB(adapterTitle, makeVaultDB)`, 21 tests, run
    against `localVaultDB`, `idbVaultDB` and a minimal Map adapter (`tests/vault-db.test.ts`).

* **Decisions taken**:
  - **`do*` names for the adapter half.** A prefix rule (know the verb, know the hook) beat
    synonym pairs like fetch/read, save/update. Public names keep the house verbs (`read`,
    `list`) rather than Convex's (`get`, `listBoxSummaries`); the table maps them.
  - **The adapter half reports a failed expectation as `false`**, and the base class throws the
    one `stale_write` message. A VaultError the adapter throws (any kind, `stale_write`
    included) passes through untouched, so thread 4 may map a `ConvexError` kind straight to a
    VaultError if that is simpler than returning `false`.
  - **One `not_permitted`** for both unauthenticated and forbidden. The host already knows its
    own auth state.
  - **`store()` drops its look-before-write.** The `vault_id` expectation covers a reborn vault;
    a vault re-passphrased elsewhere no longer stops a stale session's store before it writes
    (the box is sealed under the unchanged vaultKey); the session relocks on its next look.
  - **`erase()` keeps its look-before.** Erases carry no expectation (ruled), so nothing else
    stops a stale session erasing from a reborn vault. It is still check-then-act.
  - The base class validates scope and boxlabels on the way in (`bad_label`), not the shape of
    outgoing records or expectations: `vault.ts` builds those, and TypeScript types them.
  - `idbVaultDB` stays check-then-save, as ruled (*TODO(not yet)*); its `doEraseVault` is one
    `delMany`, so one IndexedDB transaction.

* **Deviations**:
  - Pulled in a fix: a `user_id` holding a colon put that user's lockboxes in another user's
    listing (prefix match). Now that `doEraseVault` deletes by prefix it would have erased them,
    so `isBoxCkeyOf` requires a bare boxlabel after the prefix. Tested; in `notes/security.md`.
  - Edited `whiteboard/20261014-convex/design.md`: the interface map now names the settled
    verbs and expectations, and its *Open* item on the `vault_id` hole is struck.

* **Discoveries**:
  - The old reborn-vault tests passed through the change bell, not the look-before: memoryStore
    rings, so the stale handle relocked in the background before `store()` ran. The
    reborn tests now give the stale handle a store that never rings.
  - `idb-keyval`'s `update()` would make `doCreateBundle` and `doUpdateBundle` atomic in a few
    lines (single key). `doUpdateBox` checks two keys, so it needs a two-key transaction through
    the `UseStore` callback.
  - **For thread 4**: import the suite by relative path. Today that is
    `../../../tests/vault-db-suite`; once #16 lands, `../../safebyok/tests/vault-db-suite`. I
    probed it from `packages/safebyok-react/tests/` against the *built* `safebyok`: 21 passed,
    and it typechecks. The factory's type is `VaultDBVerbs`, a structural `Pick` of the public
    verbs, because a class with protected members does not cross from `src/` to `dist/`. The
    suite checks refusals by `kind`, not `instanceof`. It needs `safebyok` built first
    (`pnpm build` at the root).
  - **For thread 3**: `doListBoxes` may return projections without `lockbox_key_wrapped` and
    `whisper_ciphered`. They must keep `format`, or the base class refuses them as
    `corrupt_record`.
  - safebyok-react's guard catches `vault_locked` only. A stale store now surfaces
    `stale_write` (the snapshot is `locked` after it in the reborn case), so the guard does not
    prompt. That belongs with the error-families TODO.

* **For the Coach**:
  - **Public surface**: `VaultDB`'s abstract methods are now the `do*` halves.
    `writeBundle`/`writeBox` are gone, and `updateBundle`/`updateBox` take expectations. There
    are three new error kinds, and the `BundleExpectation`/`LockboxExpectation` types. An
    adapter author renames their primitives to the `do*` verbs and does each update's check
    atomically. No stored record changed shape.
  - **Minor question**: should `eraseBox` carry a `vault_id`-only expectation? The rulings say
    "no *version* expectation", and `vault_id` is not a version. It would let `erase()` drop its
    look-before, as `store()` did, and close the reborn-vault window for erase too. It would
    change the verb's signature, and thread 3's `eraseBox`. I'd recommend it, as a follow-up.
  - **Minor**: `storage_unavailable` also wraps a programming error inside an adapter (a
    TypeError), with that error as `cause`. Its message says "could not be reached, or failed".
  - **Minor**: the `do*` names are mechanical to rename if you'd rather another rule.
