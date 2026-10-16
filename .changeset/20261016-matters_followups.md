---
"safebyok": minor
"safebyok-convex": minor
---

**`convexVaultDB`'s `storage_unavailable` no longer carries Convex's error as its `cause`.** On a dev deployment that error quotes the call's arguments (names, notes, ciphertext), and a name or note may now be any text, a pasted key among it. The refusal's message says the deployment's logs have the full error. A host that read `cause` for debugging reads its Convex logs instead.

**`Sanitizer`**, a new export of `safebyok`: `Sanitizer.refusalFor(err, kind, message)` is the `VaultError` to throw in place of a foreign error that may quote what it was handed, carrying nothing of it. A storage adapter of your own may throw through it; safebyok's own refusal for a host schema that throws already does.
