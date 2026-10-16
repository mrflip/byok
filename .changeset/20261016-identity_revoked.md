---
"safebyok": minor
"safebyok-react": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

A vault now locks itself when its user signs out. A new error kind, `identity_revoked`, is storage saying that the user a vault was opened for is no longer the one signed in -- signed out, or another user signed in -- and the vault meets it by locking at once, as `lock()` does: its vaultKey dropped, this device's remembered unlock forgotten, the snapshot `locked`. It erases nothing stored, and the call that met the refusal throws it. A background refresh that meets it locks all the same, and tells the logger. `openVault`'s new `whenIdentityRevoked` option chooses `'lock'` (the default) or `'stay'`, which only throws, leaving the vault as before; `IdentityRevokedResponseVals` lists the two. `VaultProvider` passes the option through.

**Breaking, for code that branches on `not_permitted`**: `safebyok-convex`'s functions and `safebyok-postgres`'s `postgresVaultDB` (and so `safebyok-graphql`'s resolvers over it) now refuse a signed-out caller, and a caller who is not the vault's user, with `identity_revoked` where they said `not_permitted`. Branch on `identity_revoked` to send the user to sign in. `not_permitted` stays, for a signed-in user refused one call by a backend of your own, and locks nothing. Convex's `SafebyokErrorKindVals` is `['identity_revoked', 'vault_full']`. Over a `ConvexClient`, a failed `watchVault` now makes the vault look again (as over a `ConvexReactClient` it already did), so a sign-out locks even an idle vault.

A vault opened before its backend knows who is signed in meets `identity_revoked` at once, and forgets its remembered unlock: open it only once your auth is ready (with Convex in React, once `useConvexAuth()` says so).
