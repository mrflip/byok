---
'safebyok-convex': patch
---

`SafebyokComponent` checks its `component`, and `SafebyokComponent.api` checks its `getUserId` when the host builds it: options that are not a bag holding a `getUserId` function throw a `VaultError` of kind `bad_option`, naming what to pass, as the host's `convex/safebyok.ts` loads rather than on the first request that calls it. `component` must be an object, as `components.safebyok` is, or the constructor throws the same kind. A host that already passes a function sees no change.
