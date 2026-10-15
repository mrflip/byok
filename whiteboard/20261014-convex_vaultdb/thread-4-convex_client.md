# Thread 4: the Convex client adapter (2026-10-15)

Branch `20261014-convex_client`, PR not yet filed, stacked on #19. Justify: root green (268 tests,
build, attw, publint); `packages/safebyok-convex` green (lint, typecheck, 207 tests).

* **Built**, all in `packages/safebyok-convex/`:
  - `src/convex-vault-db.ts`: `convexVaultDB(client, api)`, a `VaultDB` (the core's class, from
    `safebyok`) whose nine `do*` halves are one `query` or `mutation` each, on `api.safebyok`.
    `maxRecordBytes` is 1 MiB. The client is `ConvexVaultClient`: `ConvexWatchingClient` (a
    `ConvexClient`'s `query`, `mutation`, `onUpdate`) or `ConvexReactWatchingClient` (the same
    calls and `watchQuery`), written structurally: no import of `convex/react`, and a type probe
    showed both real classes fit, and that a client without watching, or a wrong `api`, does not.
  - `src/index.ts`: the package root `.`, exporting `convexVaultDB`, the client types and the
    `SafebyokApi` type. It loads nothing of the server's.
  - `src/refusals.ts`: `SafebyokErrorKindVals`, `SafebyokErrorData` and `isSafebyokErrorData`,
    moved out of `server.ts` (which re-exports them) so the client can read refusals without
    loading server modules.
  - `tests/fake-deployment.ts`: what stands in for the socket (below). `tests/helpers.ts` gained
    `hostWith` and `bySubject`, moved from `server.test.ts`.
  - README: a client section. `notes/security.md`: three entries. `design.md`: the subscribe row.

* **Decisions taken**:
  - **Refusals.** A `ConvexError` whose data passes `isSafebyokErrorData` becomes
    `new VaultError(data.kind, data.message, { cause })`, the server's fixed message passed
    through. Anything else rejects unchanged, and the base class makes it `storage_unavailable`.
  - **Bad arguments refuse at construction as `bad_option`:** a non-client, or an `api` whose
    functions don't name themselves `<module>:<fn>` (via `getFunctionName`). That catches the
    likely JavaScript mistake of passing the whole generated `api`, which answers any property
    and would otherwise fail on first use as a misleading `storage_unavailable`.
  - **No timeout.** Offline, Convex calls wait, and Convex resends unacknowledged mutations on
    reconnect, so a timed-out write might still land. Documented in the README and security notes.
  - **A failing watch is ignored** (`onError` is a no-op). Without it, `ConvexClient` throws from
    inside its socket handler; a test proves that.

* **Deviations**:
  - **The first `watchVault` emit is not skipped**, unlike the plan and design. Every result calls
    `onChange`. Two reasons, from the `.d.ts` files and confirmed by running both clients:
    `ConvexReactClient.watchQuery(...).onUpdate` sends *no* first result when the client already
    watches that query (an app with two vault handles, or its own `useQuery(watchVault)`), so a
    skip would swallow a real change; and the vault subscribes before its first read, so the
    first result can carry a write that read missed. The cost is one redundant refresh (two
    queries, no render) per open. A test pins each case; skipping the first emit fails eight
    tests.
  - **No core change.** The suite and `openVault` ran over the adapter unchanged.
  - `react` added as a dev dependency (`deps:` commit): the tests construct a real
    `ConvexReactClient`, and `convex/react` had only resolved through another workspace
    package's `react`.

* **What stands in for the socket, and what that cannot prove.** The tests run the real,
  unmodified `ConvexClient` and `ConvexReactClient` (convex 1.46.0). Each gets a fake WebSocket
  whose server side answers the sync protocol's `ModifyQuerySet` and `Mutation` with `Transition`
  and `MutationResponse` messages, running each call on a `convex-test` host built as the README
  has one (`SafebyokComponent.api({ getUserId })` over the registered component). So it does
  prove the clients' real argument encoding, `ConvexError` decoding, one-shot queries,
  `onUpdate`/`watchQuery` semantics, and mutation completion. It cannot prove:
  - **concurrency:** calls run one at a time, in arrival order, so no two transactions race;
  - **real invalidation:** every watched query reruns after every mutation, where Convex
    reruns only those whose reads it touched;
  - **auth:** each socket is signed in as one user from the start, with no `setAuth`, JWT or
    token refresh;
  - **the network:** no reconnect, resend, ping, chunked transition or offline wait.

  The fake follows convex 1.46.0's wire protocol, so a `convex` bump may need it touched. The
  protocol is backward compatible by necessity, since deployed clients must keep working.
  - **Tests:** `describeVaultDB` (24 tests) runs twice, over each client. One user per client,
    as in a real app: the suite reaches two users' vaults, so `perUser` routes each call to a
    `convexVaultDB` whose client is signed in as that call's `user_id`. Also: construction
    refusals; every verb refused `not_permitted` signed out and as another user, over both
    clients; other failures `storage_unavailable`; a Convex-refused record never quoted; and
    subscribe behaviour. Then one whole vault across a laptop (`ConvexClient`) and a phone
    (`ConvexReactClient`): made, stored, heard and read on the other device, written back,
    re-passphrased (the phone relocks, the old passphrase is refused), and destroyed (the laptop
    hears it gone). The stored row holds no whisper or passphrase. Ran stably 8 times in a row
    and 3 at once.

* **Discoveries**:
  - A real `ConvexError` arrives client-side with `data` intact, and a message that quotes the
    data JSON (never a record, for safebyok's refusals).
  - `ConvexClient.onUpdate` always delivers a first result. `watchQuery(...).onUpdate` delivers
    one only when that client was not already watching the query.
  - Signing out leaves an unlocked vault's vaultKey in memory, though every call is refused
    (README and security notes say to close the vault).

* **For the Coach**:
  - **Minor:** should the vault lock itself when storage refuses `not_permitted` (a sign-out)?
    Today it holds the vaultKey until it locks, expires or closes. That is a core change to
    `vault.ts`, not made here.
  - **Minor:** the deviation above (no first-emit skip). Say if you would rather have the skip
    back, accepting the two gaps.
  - **For a demo over Convex** (a follow-up): it needs a deployment (`npx convex dev`, yours to
    run), a `convex/` with the README's `convex.config.ts` and `safebyok.ts`, an auth provider
    (or a dev `getUserId`), and `VITE_CONVEX_URL`. The app passes its `ConvexReactClient` to
    `convexVaultDB` and opens the vault only once `useConvexAuth().isAuthenticated`.
  - **For CI** (a follow-up, after #15): `pnpm build` at the root, then `pnpm justify` in
    `packages/safebyok-convex`. It needs no network or deployment, and takes about 3 s.
