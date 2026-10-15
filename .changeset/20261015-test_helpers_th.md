---
'safebyok': minor
---

`safebyok/testing` gains the rest of the core's test helpers: `unlockOf` (a live device unlock around fake wrapped material), `tweakB64` (base64url text bent by one character, for tamper tests) and `wakeupAtNextTick` (resolves once the macrotask queue has turned). Everything it exported before is unchanged. It is meant to be star-imported: `import * as TH from 'safebyok/testing'`.
