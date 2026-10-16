---
"safebyok-react": patch
---

`VaultProvider` closes the passphrase dialog when the vault unlocks under it, and the actions waiting on it run again. Before, a user who cancelled an unlock that was still deriving, then triggered another action, saw a second dialog stay up over a vault the first unlock had since opened; its Cancel gave up an action that would have worked. The same holds for any unlock that lands while the dialog asks.
