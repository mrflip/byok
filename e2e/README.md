# safebyok-e2e

The tests that pair a storage adapter with a framework's client, end to end: a real client, the
real adapter, the real component, and a fake network. A workspace package that is never
published. It exists so that no adapter lists a framework among its dev dependencies, and so the
pairings, which grow adapter by framework, have one place to live.

```sh
pnpm justify    # from e2e/: install, lint, typecheck, test (it builds the packages it reads first)
```

## What is here

* [tests/convex/](tests/convex) -- `safebyok-convex` with each of Convex's clients, `ConvexClient`
  and `ConvexReactClient`:
  * [fake-deployment.ts](tests/convex/fake-deployment.ts) -- a Convex deployment in memory that
    the unmodified clients talk to over a fake WebSocket, answering the sync protocol's query and
    mutation messages from `convex-test`. It runs one call at a time, reruns every watched query
    after each mutation, and signs each socket in as one user from the start; its doc block says
    what that cannot prove.
  * [convex-vault-db.test.ts](tests/convex/convex-vault-db.test.ts) -- the whole `VaultDB`
    battery, the refusals, the subscriptions and a vault on two devices, each run over both
    clients.
  * [test-helpers.ts](tests/convex/test-helpers.ts) -- a host app built from `safebyok-convex`'s
    published entries alone, as a host's own tests would.

The packages are read as a consumer reads them: through their built `dist/`, which the `test`
script builds first, except `safebyok-convex/test`, which ships as source.

## Adding a pairing

A new framework's client goes in the row of whatever adapter it pairs with: a client `connect`
function beside the existing ones in the adapter's directory, and the same tests run over it. A
new adapter gets a directory of its own, `tests/<store>/`, with its fake of the store's network.
A test that needs no deployment fake and no client of a framework -- the component's functions,
the adapter's pure helpers -- belongs in that adapter's own package. Every test that runs a real
client of the store against the fake goes here, `ConvexClient` included: the fake is one file, so
its tests are one directory.
