# safebyok-e2e

The checks that pair a storage adapter with a framework's client, end to end: a real client, the
real adapter, the real component, and a fake network. A workspace package that is never
published. It exists so that no adapter lists a framework among its dev dependencies, and so the
pairings, which grow adapter by framework, have one place to live. Heavyweight browser specs
(Playwright and the like) would live here too.

An adapter's own tests stay in its package, so a contributor can run that suite without the
workspace's other packages: `safebyok-convex` runs its battery over `ConvexClient` there. This
package runs the same over what needs a framework.

```sh
pnpm justify    # from e2e/: install, lint, typecheck, test (it builds the packages it reads first)
```

## What is here

* [tests/convex/](tests/convex) -- `safebyok-convex` with `ConvexReactClient`, over the fake
  deployment `safebyok-convex/testing` ships:
  * [convex-vault-db.test.ts](tests/convex/convex-vault-db.test.ts) -- the `VaultDB` battery, the
    refusals, the subscriptions and sign-out, and a vault on two devices (one `ConvexClient`, one
    `ConvexReactClient`), each run over the React client. Its loops are copies of the ones in
    `packages/safebyok-convex/tests/convex-vault-db.test.ts`, which run over `ConvexClient`: a
    change to a looped test is made in both.
  * [test-helpers.ts](tests/convex/test-helpers.ts) -- a host app built from `safebyok-convex`'s
    published entries alone, as a host's own tests would.

The packages are read as a consumer reads them: through their built `dist/`, which the `test`
script builds first, except `safebyok-convex/test`, which ships as source.

## Adding a pairing

A new framework's client goes beside the existing one in the adapter's directory: a `connect`
function for it, and the same tests run over it. A new adapter gets a directory of its own,
`tests/<store>/`, and the fake of its store's network from wherever that adapter ships it. A test
that needs no framework belongs in the adapter's own package.
