---
"safebyok-convex": minor
---

First release of `safebyok-convex`: safebyok's storage on Convex. A Convex component holds each vault's bundle and lockboxes, ciphertext and public fields only, in tables of its own, and serves them through functions your app re-exports behind its own sign-in check; `convexVaultDB` is the client side a vault stores through. `safebyok` and `convex` are peer dependencies.
