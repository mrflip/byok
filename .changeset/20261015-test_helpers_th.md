---
'safebyok': minor
---

`safebyok/testing` gains the rest of the core's test helpers: `unlockOf` (a live device unlock around fake wrapped material), `tweakB64` (base64url text bent by one character, for tamper tests), `wakeupAtNextTick` (resolves once the macrotask queue has turned) and `makeGate` (holds an async seam mid-flight, so a test can land one call inside another). Everything it exported before is unchanged. It is meant to be star-imported: `import * as TH from 'safebyok/testing'`.
