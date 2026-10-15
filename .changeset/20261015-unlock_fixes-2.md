---
"safebyok-indexeddb": patch
---

`safebyok-indexeddb`'s BroadcastChannel no longer holds a Node or Bun process open (it is `unref`ed where the platform's channel has `unref`), and a `subscribe` listener that throws no longer escapes as an uncaught error, which ended a Node process: what it threw is dropped, and the other listeners are still called.
