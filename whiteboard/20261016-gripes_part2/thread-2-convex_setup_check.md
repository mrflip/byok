# Thread 2: convex_setup_check (2026-10-16)

Branch `20261016-convex_setup_check`, PR [#102](https://github.com/mrflip/safebyok/pull/102). Justify: green (root; safebyok-convex 290 tests, 7 of them new).

* **Built**: `SafebyokComponent.api(opts)` in `packages/safebyok-convex/src/server.ts` now validates
  `opts` before building any function: not a bag, or no `getUserId` function, throws a `VaultError`
  of kind `bad_option` whose message names the `{ getUserId }` option and shows the usual one-liner.
  Tests in their own describe block ("SafebyokComponent.api, at setup") in `tests/server.test.ts`:
  seven bad shapes (nothing, null, empty bag, misspelt, undefined, text, object) and the sync and
  async functions that build. README note and a patch changeset for `safebyok-convex`.
* **Decisions taken**: kind `bad_option` (the existing misuse kind; no new public kind). It is a
  `VaultError`, not a `ConvexError`: it fires as the host's module loads, not in a request, so it
  never travels to a client; `SafebyokErrorKindVals` is unchanged. `server.ts` now imports the
  `VaultError` class from `safebyok` (a peer dependency the package already has; the client side
  `convex-vault-db.ts` imports it too). The package is unbundled and `sideEffects: false`, so the
  host's Convex bundler keeps only `errors.ts`. Only the *function-ness* is checked; whether it
  answers sensibly stays a per-request matter (null reads as signed out).
* **Deviations**: none.
* **Discoveries**: the `Promise.try` the linter suggests is not in the repo's TS lib, so the test
  uses chai's synchronous `.to.throw(...).with.property('kind', ...)` instead of `TH.expectRefusal`
  (which wants a promise).
* **For the Coach**: the TODO line on the identity question ("do we want a generic interface to
  request an identity; it might not be through the database") is thread 4's, not here.
