---
'safebyok': minor
---

`safebyok/testing` gains `perUser(vaultDBFor)`, for running `describeVaultDB` over an adapter that serves only the user signed in, as a server's does when it makes one per request: it gives the suite one adapter reaching every user's vaults, each verb sent to the VaultDB `vaultDBFor` made for the user its scope or bundle names. Everything it exported before is unchanged.
