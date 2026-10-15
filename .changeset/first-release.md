---
"safebyok": minor
"safebyok-react": minor
---

First release. `safebyok` is an end-to-end encrypted vault for the API keys and other small secrets users bring to a browser app: encrypted on the user's device under keys that never leave it, synced through a storage layer the host app plugs in (an IndexedDB adapter ships as `safebyok/idb`). `safebyok-react` is its React binding: a provider that follows the signed-in user, snapshot hooks, and a guard that asks for the passphrase on demand.
