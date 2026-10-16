---
'safebyok': patch
---

Three of `safebyok/testing`'s helpers behave more strictly:

* `expectRefusal` now also requires the refusal to be an `instanceof` the package's own `VaultError`, where it checked only the name and `kind`. An adapter whose refusal is a lookalike (a plain `Error` named `VaultError`, or a `VaultError` from a second installed copy of the package) now fails the test, as it would a host that branches with `instanceof`.
* `tallyWatches` counts each watch closed at most once. Closing one watch twice no longer cancels out another that was never closed, so `opened - closed` is the number of watches still running.
* `beforeNextCall` (and `holdNextCall`) on a method the test already spies on lets that spy record the intercepted call once; it used to be recorded twice.
