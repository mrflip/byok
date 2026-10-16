---
"safebyok": minor
"safebyok-convex": minor
"safebyok-react": minor
---

**`convexVaultDB`'s `storage_unavailable` no longer carries Convex's error as its `cause`.** On a dev deployment that error quotes the call's arguments (names, notes, ciphertext), and a name or note may now be any text, a pasted key among it. The refusal's message says the deployment's logs have the full error. A host that read `cause` for debugging reads its Convex logs instead.

**`Sanitizer`**, a new export of `safebyok`: `Sanitizer.refusalFor(err, kind, message)` is the `VaultError` to throw in place of a foreign error that may quote what it was handed, carrying nothing of it. A storage adapter of your own may throw through it; safebyok's own refusal for a host schema that throws already does.

**`validators.unlocklabel`**, a sixth check beside the other five: the label of each way in `addPassphrase` and `addPasskey` add, `Label` by default as before, refused with kind `bad_label`. A host whose users name their passphrases and passkeys in their own words passes its own schema (`AnyTextValidators` has one). It is checked only as a way in is added: one already stored opens the vault whatever the check says now. `DefaultValidators` and `AnyTextValidators` gain the field, and `checkValidators` accepts it; `VaultProvider` passes it through, so this `safebyok-react` needs this `safebyok`. The refusal for a missing unlocklabel now says only that one is needed, as text, and one that fails the check says what the check found, as for the other names.

**A second `vault.close()` does nothing.** It used to end the storage watch again, and an adapter whose unsubscribe counts down a shared watch (Convex's guards against it) could have ended another's.
