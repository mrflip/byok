---
"safebyok-react": patch
---

`VaultProvider` no longer closes a passphrase dialog that an action opened in the very commit that gave the provider its vault. Before, the provider's cleanup from the render before the vault came ended the dialog as one whose vault had gone, so that action resolved `null` as if the user had dismissed it, and no dialog showed; this needed the action to land before React's passive effects ran, which a loaded machine makes likelier. A dialog still closes, and its actions resolve `null`, when the vault it was opened over goes: a sign-out, another user, a reopen, or the provider unmounting. So does an action whose `vault_locked` refusal reaches `withUnlockedVault` only after that vault went: it resolves `null` at once, and opens no dialog to show over whichever vault comes next.
