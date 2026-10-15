---
'safebyok': patch
'safebyok-convex': patch
'safebyok-react': patch
---

Every kind of `VaultError` is now documented in one place, with its family: the `safebyok` README's *Errors* tables and `VaultErrorKindVals`' doc block say, for each kind, whether it is misuse (a programming error, to fix in the code) or a condition (to handle at run time) and what a host does about it. `safebyok-convex`'s own list of the kinds its server throws is now checked by the compiler against the core's, so it cannot name a kind the core lacks. No kind is renamed or removed, and no behavior changes.
