---
'safebyok': minor
---

A new entry point, `safebyok/testing`, for tests only: `testDeriver` (a cheap key deriver, worthless against a brute-forcer), `fakeCiphered`, `scopeOf`, `bundleOf` and `boxOf` (shape-valid records with fake ciphertext), and `describeVaultDB`, the vitest suite every storage adapter owes. It needs vitest, now an optional peer dependency.
